/**
 * vNext Importer — maps old DB tables to vNext canonical schema.
 *
 * This module is ONLY imported by migration scripts and tests.
 * It must NOT be imported by app runtime (Next.js routes, runners, adapters).
 *
 * The importer reads old tables through a raw SQLite connection (not Drizzle)
 * so it can operate independently of the current schema.
 */

import { nanoid } from "nanoid";
import type { RuntimeStore } from "@/lib/runtime/store";

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
  } catch {
    // Table may not exist
  }

  // Import runs
  try {
    const oldRuns = query("SELECT * FROM runs") as unknown as OldRun[];
    result.runs = oldRuns.length;

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
  } catch {
    // Table may not exist
  }

  // Import run_events → runtime_events
  try {
    const oldRunEvents = query("SELECT * FROM run_events") as unknown as OldRunEvent[];
    result.runEvents = oldRunEvents.length;

    if (!dryRun) {
      for (const re of oldRunEvents) {
        const data = re.data ? JSON.parse(re.data) : {};
        const eventType = mapOldRunEventType(re.event_type, data.status);
        const runRow = query(`SELECT session_id FROM runs WHERE id = '${re.run_id}'`)[0] as { session_id?: string } | undefined;
        const sessionId = runRow?.session_id ?? "";

        await store.events.append({
          id: re.id ?? nanoid(),
          schemaVersion: "runtime-event.v1",
          sessionSeq: 0,
          scope: "run",
          type: eventType,
          category: "tool",
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
  } catch {
    // Table may not exist
  }

  // Import session_events → runtime_events
  try {
    const oldSessionEvents = query("SELECT * FROM session_events") as unknown as OldSessionEvent[];
    result.sessionEvents = oldSessionEvents.length;

    if (!dryRun) {
      for (const se of oldSessionEvents) {
        await store.events.append({
          id: se.id ?? nanoid(),
          schemaVersion: "runtime-event.v1",
          sessionSeq: 0,
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
  } catch {
    // Table may not exist
  }

  // Import artifacts
  try {
    const oldArtifacts = query("SELECT * FROM artifacts") as unknown as OldArtifact[];
    result.artifacts = oldArtifacts.length;

    if (!dryRun) {
      for (const a of oldArtifacts) {
        const runRow = query(`SELECT session_id FROM runs WHERE id = '${a.run_id}'`)[0] as { session_id?: string } | undefined;
        const runSessionId = runRow?.session_id ?? "";

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
  } catch {
    // Table may not exist
  }

  // Import observations
  try {
    const oldObs = query("SELECT * FROM observations") as unknown as OldObservation[];
    result.observations = oldObs.length;
  } catch {
    // Table may not exist
  }

  return result;
}

function findSessionForRun(runs: OldRun[], runId: string): string | undefined {
  return runs.find((r) => r.id === runId)?.session_id;
}
