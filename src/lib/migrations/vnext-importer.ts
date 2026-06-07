/**
 * vNext Importer — maps old DB tables to vNext canonical schema.
 *
 * This module is ONLY imported by migration scripts and tests.
 * It must NOT be imported by app runtime (Next.js routes, runners, adapters).
 *
 * The importer reads old tables through a raw SQLite connection (not Drizzle)
 * so it can operate independently of the current schema.
 */

import type { RuntimeStore } from "@/lib/runtime/store";
import { nanoid } from "nanoid";

// ─── Status / event type mapping ─────────────────────────────────────

const RUN_STATUS_MAP: Record<string, string> = {
  pending: "queued",
  running: "running",
  success: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * Map old run status to vNext canonical status.
 */
export function mapOldRunStatus(old: string): string {
  return RUN_STATUS_MAP[old] ?? old;
}

/**
 * Map old run event type + sub-status to vNext RuntimeEvent type.
 */
export function mapOldRunEventType(eventType: string, subStatus?: string): string {
  if (eventType === "tool_use") {
    if (subStatus === "running") return "tool.call.created";
    if (subStatus === "completed") return "tool.call.completed";
    if (subStatus === "error") return "tool.call.failed";
    return "tool.call.created";
  }
  if (eventType === "error") return "error.created";
  if (eventType === "run_started") return "run.started";
  if (eventType === "run.created") return "run.created";
  if (eventType === "text_delta") return "model.text.delta";
  if (eventType === "thinking_delta") return "model.reasoning.delta";
  if (eventType === "run.updated") return "run.progressed";
  if (eventType === "progress" || eventType === "log") return "run.progressed";
  return "system.info";
}

// ─── Old DB row types ────────────────────────────────────────────────

interface OldSession {
  id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface OldMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string | null;
  metadata: string | null;
}

interface OldRun {
  id: string;
  session_id: string;
  goal_id: string | null;
  skill_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_summary: string | null;
  created_at: string | null;
  metadata: string | null;
}

interface OldRunEvent {
  id: string;
  run_id: string;
  timestamp: string;
  event_type: string;
  data: string | null;
}

interface OldSessionEvent {
  id: string;
  session_id: string;
  timestamp: string;
  event_type: string;
  data: string | null;
}

interface OldArtifact {
  id: string;
  run_id: string;
  kind: string;
  name: string;
  path: string | null;
  content: string | null;
  mime_type: string | null;
  created_at: string | null;
}

interface OldObservation {
  id: string;
  session_id: string;
}

// ─── Importer ────────────────────────────────────────────────────────

export interface ImportOptions {
  /** Raw SQLite database instance (source). Use better-sqlite3 directly. */
  sqlite: { prepare(sql: string): { all(): unknown[] } };
  /** vNext RuntimeStore (target). */
  store: RuntimeStore;
  /** If true, only report what would be imported. */
  dryRun?: boolean;
}

export interface ImportResult {
  sessions: number;
  messages: number;
  runs: number;
  runEvents: number;
  sessionEvents: number;
  artifacts: number;
  observations: number;
  dryRun: boolean;
}

/**
 * Import old DB data into vNext canonical schema.
 *
 * Reads from old tables using raw SQLite and writes through RuntimeStore.
 */
export async function importToVNext(options: ImportOptions): Promise<ImportResult> {
  const { sqlite, store, dryRun = false } = options;
  const result: ImportResult = {
    sessions: 0,
    messages: 0,
    runs: 0,
    runEvents: 0,
    sessionEvents: 0,
    artifacts: 0,
    observations: 0,
    dryRun,
  };

  const query = (sql: string) => sqlite.prepare(sql).all() as Record<string, unknown>[];
  let oldRuns: OldRun[] = [];
  const runSessionById = new Map<string, string>();

  // Import sessions
  const oldSessions = query("SELECT * FROM sessions") as unknown as OldSession[];
  result.sessions = oldSessions.length;

  if (!dryRun) {
    for (const s of oldSessions) {
      await store.sessions.create({
        id: s.id,
        title: s.name ?? null,
        status: s.status ?? "active",
        createdAt: s.created_at ?? new Date().toISOString(),
        updatedAt: s.updated_at ?? new Date().toISOString(),
      });
    }
  }

  // Import messages
  try {
    const oldMessages = query("SELECT * FROM messages") as unknown as OldMessage[];
    result.messages = oldMessages.length;

    if (!dryRun) {
      for (const m of oldMessages) {
        await store.messages.create({
          id: m.id,
          sessionId: m.session_id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at ?? new Date().toISOString(),
          updatedAt: m.created_at ?? new Date().toISOString(),
          messageType: "plain",
          messageStatus: "visible",
          contentFormat: "markdown",
          metadata: m.metadata ?? null,
          metadataJson: m.metadata ?? null,
        });
      }
    }
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  // Import runs
  try {
    oldRuns = query("SELECT * FROM runs") as unknown as OldRun[];
    result.runs = oldRuns.length;
    for (const run of oldRuns) {
      runSessionById.set(run.id, run.session_id);
    }

    if (!dryRun) {
      for (const r of oldRuns) {
        const meta = r.metadata ? JSON.parse(r.metadata) : {};
        await store.runs.create({
          id: r.id,
          sessionId: r.session_id,
          goalId: r.goal_id ?? null,
          skillName: r.skill_name,
          status: mapOldRunStatus(r.status),
          ticker: meta.ticker ?? null,
          market: meta.market ?? null,
          workflowType: meta.workflow_type ?? null,
          caller: meta.caller ?? null,
          resultSummary: r.result_summary ?? null,
          createdAt: r.created_at ?? new Date().toISOString(),
          startedAt: r.started_at ?? null,
          finishedAt: r.finished_at ?? null,
          durationMs: r.duration_ms ?? null,
          metadata: r.metadata ?? null,
          metadataJson: r.metadata ?? null,
        });
      }
    }
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  // Import run_events → runtime_events
  try {
    const oldRunEvents = query(
      "SELECT * FROM run_events ORDER BY timestamp, id",
    ) as unknown as OldRunEvent[];
    result.runEvents = oldRunEvents.length;

    if (!dryRun) {
      for (const re of oldRunEvents) {
        const data = re.data ? JSON.parse(re.data) : {};
        const eventType = mapOldRunEventType(re.event_type, data.status);
        const sessionId = runSessionById.get(re.run_id);
        if (!sessionId) {
          throw new Error(`Cannot import event ${re.id}: run ${re.run_id} has no session`);
        }

        await store.events.append({
          id: re.id ?? nanoid(),
          schemaVersion: "runtime-event.v1",
          sessionSeq: await store.events.nextSessionSeq(sessionId),
          runSeq: await store.events.nextRunSeq(re.run_id),
          scope: "run",
          type: eventType,
          category: categoryForEvent(eventType),
          sessionId,
          runId: re.run_id,
          producer: "server",
          visibility: "ui",
          persist: 1,
          payloadJson: re.data ?? null,
          createdAt: re.timestamp,
        });
      }
    }
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  // Import session_events → runtime_events
  try {
    const oldSessionEvents = query(
      "SELECT * FROM session_events ORDER BY timestamp, id",
    ) as unknown as OldSessionEvent[];
    result.sessionEvents = oldSessionEvents.length;

    if (!dryRun) {
      for (const se of oldSessionEvents) {
        await store.events.append({
          id: se.id ?? nanoid(),
          schemaVersion: "runtime-event.v1",
          sessionSeq: await store.events.nextSessionSeq(se.session_id),
          scope: "session",
          type: se.event_type ?? "system.info",
          category: "lifecycle",
          sessionId: se.session_id,
          producer: "server",
          visibility: "ui",
          persist: 1,
          payloadJson: se.data ?? null,
          createdAt: se.timestamp,
        });
      }
    }
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  // Ensure terminal runs have a canonical terminal event even if the old
  // runtime only persisted the terminal status on the run row.
  if (!dryRun) {
    const terminalTypes: Record<string, string> = {
      succeeded: "run.completed",
      failed: "run.failed",
      cancelled: "run.cancelled",
    };
    for (const run of oldRuns) {
      const terminalType = terminalTypes[mapOldRunStatus(run.status)];
      if (!terminalType) continue;

      const events = await store.events.findByRun(run.id);
      if (events.some((event) => Object.values(terminalTypes).includes(event.type))) continue;

      await store.events.append({
        id: nanoid(),
        schemaVersion: "runtime-event.v1",
        sessionSeq: await store.events.nextSessionSeq(run.session_id),
        runSeq: await store.events.nextRunSeq(run.id),
        scope: "run",
        type: terminalType,
        category: terminalType === "run.failed" ? "error" : "lifecycle",
        sessionId: run.session_id,
        runId: run.id,
        producer: "system",
        visibility: "audit",
        persist: 1,
        payloadJson: JSON.stringify({ status: mapOldRunStatus(run.status), imported: true }),
        createdAt: run.finished_at ?? run.created_at ?? new Date().toISOString(),
      });
    }
  }

  // Import artifacts
  try {
    const oldArtifacts = query("SELECT * FROM artifacts") as unknown as OldArtifact[];
    result.artifacts = oldArtifacts.length;

    if (!dryRun) {
      for (const a of oldArtifacts) {
        const runSessionId = runSessionById.get(a.run_id);
        if (!runSessionId) {
          throw new Error(`Cannot import artifact ${a.id}: run ${a.run_id} has no session`);
        }

        await store.artifacts.create({
          id: a.id,
          runId: a.run_id,
          sessionId: runSessionId,
          kind: a.kind,
          name: a.name,
          path: a.path ?? null,
          content: a.content ?? null,
          inlineContent: a.content ?? null,
          mimeType: a.mime_type ?? null,
          contentType: a.mime_type ?? null,
          createdAt: a.created_at ?? new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  // Import observations
  try {
    const oldObs = query("SELECT * FROM observations") as unknown as OldObservation[];
    result.observations = oldObs.length;
  } catch (error) {
    rethrowUnlessMissingTable(error);
  }

  return result;
}

function categoryForEvent(eventType: string): string {
  if (eventType.startsWith("tool.")) return "tool";
  if (eventType.startsWith("model.")) return "model";
  if (eventType.startsWith("run.")) return "lifecycle";
  if (eventType.startsWith("error.")) return "error";
  return "lifecycle";
}

function rethrowUnlessMissingTable(error: unknown): void {
  if (!(error instanceof Error) || !error.message.includes("no such table")) {
    throw error;
  }
}
