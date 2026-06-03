/**
 * ArtifactService — writes artifact files and emits artifact.created events.
 *
 * No direct DB writes from runner or tool adapters.
 * The service receives metadata from RuntimeEventSink and writes through RuntimeStore.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import type { RuntimeStore } from "@/lib/runtime/store";
import type { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeEvent } from "@/lib/runtime/events";

export interface WriteArtifactOptions {
  runId: string;
  sessionId: string;
  kind: "report" | "result" | "sources" | "chart" | "data" | "model" | "raw";
  name: string;
  content: string;
  contentType?: string;
  producer?: string;
  schemaVersion?: string;
  sourceEventId?: string;
}

export interface WriteArtifactResult {
  artifactId: string;
  path: string;
  sha256: string;
  sizeBytes: number;
}

export class ArtifactService {
  constructor(
    private store: RuntimeStore,
    private eventLog: RuntimeEventLog,
  ) {}

  /**
   * Write an artifact file, persist metadata, and emit artifact.created event.
   */
  async writeArtifact(options: WriteArtifactOptions): Promise<WriteArtifactResult> {
    const { runId, sessionId, kind, name, content } = options;

    // Write file to disk
    const { analysisRoot } = getConfig();
    const artifactsRoot = path.resolve(analysisRoot, "artifacts");
    const targetDir = path.resolve(artifactsRoot, runId);
    const targetPath = path.resolve(targetDir, name);

    // Path-boundary check
    if (!targetPath.startsWith(artifactsRoot + path.sep) && targetPath !== artifactsRoot) {
      throw new Error(
        `Path traversal detected: resolved "${targetPath}" is outside artifacts root "${artifactsRoot}"`,
      );
    }

    mkdirSync(targetDir, { recursive: true });
    writeFileSync(targetPath, content, "utf-8");

    // Calculate metadata
    const sha256 = createHash("sha256").update(content, "utf-8").digest("hex");
    const sizeBytes = Buffer.byteLength(content, "utf-8");

    // Persist to DB
    const artifact = await this.store.artifacts.create({
      runId,
      sessionId,
      kind,
      name,
      path: targetPath,
      inlineContent: content,
      contentType: options.contentType ?? "text/plain",
      schemaVersion: options.schemaVersion ?? null,
      producer: options.producer ?? "agent",
      sha256,
      sizeBytes,
    });

    // Emit artifact.created event
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        artifactId: artifact.id,
        type: "artifact.created",
        category: "artifact",
        scope: "artifact",
        producer: (options.producer as "server" | "runner" | "adapter" | "ui" | "system") ?? "runner",
        payload: {
          artifactId: artifact.id,
          runId,
          kind,
          name,
          path: targetPath,
          sha256,
          sizeBytes,
          contentType: options.contentType ?? "text/plain",
        },
      }),
    );

    return { artifactId: artifact.id, path: targetPath, sha256, sizeBytes };
  }

  /**
   * Write standard run artifacts (report.md, result.json, sources.json).
   */
  async writeRunArtifacts(options: {
    runId: string;
    sessionId: string;
    report?: string;
    result?: unknown;
    sources?: unknown[];
    producer?: string;
  }): Promise<WriteArtifactResult[]> {
    const results: WriteArtifactResult[] = [];
    const producer = options.producer ?? "agent";

    if (options.report) {
      results.push(
        await this.writeArtifact({
          runId: options.runId,
          sessionId: options.sessionId,
          kind: "report",
          name: "report.md",
          content: options.report,
          contentType: "text/markdown",
          producer,
        }),
      );
    }

    if (options.result) {
      results.push(
        await this.writeArtifact({
          runId: options.runId,
          sessionId: options.sessionId,
          kind: "result",
          name: "result.json",
          content: JSON.stringify(options.result, null, 2),
          contentType: "application/json",
          producer,
        }),
      );
    }

    if (options.sources) {
      results.push(
        await this.writeArtifact({
          runId: options.runId,
          sessionId: options.sessionId,
          kind: "sources",
          name: "sources.json",
          content: JSON.stringify(options.sources, null, 2),
          contentType: "application/json",
          producer,
        }),
      );
    }

    return results;
  }
}
