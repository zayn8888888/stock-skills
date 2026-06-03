import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";

type DB = ReturnType<typeof drizzle<typeof schema>>;

interface CreateRunData {
  sessionId: string;
  skillName: string;
  goalId?: string;
}

interface RunEventPayload {
  severity?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Create a new run record in the "pending" state.
 */
export function createRun(db: DB, data: CreateRunData): typeof schema.runs.$inferSelect {
  const now = new Date().toISOString();
  const id = nanoid();

  const run = {
    id,
    sessionId: data.sessionId,
    goalId: data.goalId ?? null,
    skillName: data.skillName,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    resultSummary: null,
    createdAt: now,
    metadata: null,
    // vNext nullable columns
    messageId: null,
    parentRunId: null,
    runnerId: null,
    workflowType: null,
    executionMode: null,
    ticker: null,
    market: null,
    intent: null,
    modelId: null,
    requestId: null,
    owner: null,
    caller: null,
    errorCode: null,
    errorMessage: null,
    metadataJson: null,
    queuedAt: null,
  };

  db.insert(schema.runs).values(run).run();
  return run;
}

/**
 * Update the status of a run. When transitioning to a terminal state
 * (success / failed / cancelled) the finishedAt timestamp is set automatically.
 *
 * @param errorMessage  Optional message stored in resultSummary when status is "failed".
 */
export function updateStatus(db: DB, runId: string, status: string, errorMessage?: string): void {
  const now = new Date().toISOString();
  const isTerminal = status === "success" || status === "failed" || status === "cancelled";

  const values: Record<string, unknown> = { status };

  if (status === "running" && !errorMessage) {
    values.startedAt = now;
  }

  if (isTerminal) {
    values.finishedAt = now;

    // Calculate duration if the run was started
    const [run] = db
      .select({ startedAt: schema.runs.startedAt })
      .from(schema.runs)
      .where(eq(schema.runs.id, runId))
      .limit(1)
      .all();

    if (run?.startedAt) {
      values.durationMs = new Date(now).getTime() - new Date(run.startedAt).getTime();
    }
  }

  if (status === "failed" && errorMessage) {
    values.resultSummary = errorMessage;
  }

  db.update(schema.runs).set(values).where(eq(schema.runs.id, runId)).run();
}

/**
 * Append an event to the run_events table.
 */
export function addRunEvent(
  db: DB,
  runId: string,
  eventType: string,
  severity: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  const eventData: RunEventPayload = { severity, message, ...payload };

  db.insert(schema.runEvents)
    .values({
      id: nanoid(),
      runId,
      timestamp: new Date().toISOString(),
      eventType,
      data: JSON.stringify(eventData),
    })
    .run();
}

/**
 * Fetch a run together with its associated artifacts.
 */
export function getRun(
  db: DB,
  runId: string,
):
  | (typeof schema.runs.$inferSelect & { artifacts: (typeof schema.artifacts.$inferSelect)[] })
  | undefined {
  const results = db
    .select()
    .from(schema.runs)
    .leftJoin(schema.artifacts, eq(schema.artifacts.runId, schema.runs.id))
    .where(eq(schema.runs.id, runId))
    .all();

  if (results.length === 0) return undefined;

  const run = results[0].runs;
  const arts = results
    .filter((r) => r.artifacts !== null)
    .map((r) => r.artifacts as typeof schema.artifacts.$inferSelect);

  return { ...run, artifacts: arts };
}
