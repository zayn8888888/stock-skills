/**
 * vNext Importer — maps old DB tables to vNext canonical schema.
 *
 * This module is ONLY imported by migration scripts and tests.
 * It must NOT be imported by app runtime (Next.js routes, runners, adapters).
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
 * Old "pending" → "queued", old "success" → "succeeded".
 * Unknown statuses pass through unchanged.
 */
export function mapOldRunStatus(old: string): string {
  return RUN_STATUS_MAP[old] ?? old;
}

/**
 * Map old run event type + sub-status to vNext RuntimeEvent type.
 * Handles both old event_type strings and tool_use sub-statuses.
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
  if (eventType === "progress" || eventType === "log") return "run.progressed";
  return "system.info";
}

// ─── Importer ────────────────────────────────────────────────────────

export interface ImportOptions {
  /** Old Drizzle database instance (source). */
  oldDb: ReturnType<typeof import("drizzle-orm/better-sqlite3").drizzle>;
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
 * Reads from old tables (sessions, messages, runs, run_events,
 * session_events, artifacts, observations, etc.) and writes through RuntimeStore.
 */
export async function importToVNext(options: ImportOptions): Promise<ImportResult> {
  const { oldDb, store, dryRun = false } = options;
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

  // Import sessions
  const oldSessions = oldDb
    .select()
    .from(getTable(oldDb, "sessions"))
    .all() as OldSession[];
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
  const oldMessages = oldDb
    .select()
    .from(getTable(oldDb, "messages"))
    .all() as OldMessage[];
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

  // Import runs
  const oldRuns = oldDb
    .select()
    .from(getTable(oldDb, "runs"))
    .all() as OldRun[];
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

  // Import run_events → runtime_events
  try {
    const oldRunEvents = oldDb
      .select()
      .from(getTable(oldDb, "run_events"))
      .all() as OldRunEvent[];
    result.runEvents = oldRunEvents.length;

    if (!dryRun) {
      for (const re of oldRunEvents) {
        const data = re.data ? JSON.parse(re.data) : {};
        const eventType = mapOldRunEventType(re.event_type, data.status);
        const sessionId = findSessionForRun(oldRuns, re.run_id) ?? "";
        await store.events.append({
          id: re.id ?? nanoid(),
          schemaVersion: "runtime-event.v1",
          sessionSeq: 0, // Will be auto-assigned by event-log; placeholder for importer
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
    // Table may not exist or be empty; proceed
  }

  // Import session_events → runtime_events
  try {
    const oldSessionEvents = oldDb
      .select()
      .from(getTable(oldDb, "session_events"))
      .all() as OldSessionEvent[];
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
    // Table may not exist or be empty; proceed
  }

  // Import artifacts
  try {
    const oldArtifacts = oldDb
      .select()
      .from(getTable(oldDb, "artifacts"))
      .all() as OldArtifact[];
    result.artifacts = oldArtifacts.length;

    if (!dryRun) {
      for (const a of oldArtifacts) {
        const runSessionId = findSessionForRun(oldRuns, a.run_id) ?? "";
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
    // Table may not exist or be empty; proceed
  }

  // Import observations
  try {
    const oldObs = oldDb
      .select()
      .from(getTable(oldDb, "observations"))
      .all() as OldObservation[];
    result.observations = oldObs.length;
  } catch {
    // Table may not exist
  }

  return result;
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

// ─── Helpers ─────────────────────────────────────────────────────────

function getTable(db: unknown, tableName: string): Record<string, unknown> {
  // Access Drizzle schema tables by name — used for reading old DB
  const schema = (db as { _: { schema?: Record<string, unknown> } })._;
  // For raw Drizzle instance, tables are accessed via select().from(...)
  // We return a simple table-like object
  return { [tableName]: true };
}

function findSessionForRun(runs: OldRun[], runId: string): string | undefined {
  return runs.find((r) => r.id === runId)?.session_id;
}
