/**
 * RuntimeStore — unified DB access boundary for vNext runtime.
 *
 * All mutating DB access in the vNext runtime MUST go through this interface.
 * API routes, runners, and adapters must NOT import Drizzle or better-sqlite3 directly.
 */

import type {
  sessions,
  messages,
  runs,
  runtimeEvents,
  toolCalls,
  artifacts,
  runnerProviders,
  runnerRuns,
  researchGoals,
  commandLog,
} from "@/lib/db/schema";

// ─── RuntimeStore interface ──────────────────────────────────────────

export interface RuntimeStore {
  /** Run a callback inside a DB transaction. */
  transaction<T>(fn: (tx: RuntimeStoreTx) => Promise<T> | T): Promise<T>;

  sessions: SessionRepository;
  messages: MessageRepository;
  runs: RunRepository;
  events: RuntimeEventRepository;
  tools: ToolCallRepository;
  artifacts: ArtifactRepository;
  runners: RunnerRepository;
  goals: GoalRepository;
  commands: CommandLogRepository;
}

/** Transaction-scoped store (same shape, but guaranteed atomic). */
export type RuntimeStoreTx = Omit<RuntimeStore, "transaction">;

// ─── Repository interfaces ───────────────────────────────────────────

export interface SessionRepository {
  create(data: Partial<InsertSession> & Pick<InsertSession, 'id' | 'status'>): Promise<SessionRow>;
  findById(id: string): Promise<SessionRow | undefined>;
  update(id: string, data: Partial<InsertSession>): Promise<void>;
  setActiveRun(sessionId: string, runId: string | null): Promise<void>;
}

export interface MessageRepository {
  create(data: Partial<InsertMessage> & Pick<InsertMessage, 'sessionId' | 'role' | 'content'>): Promise<MessageRow>;
  findById(id: string): Promise<MessageRow | undefined>;
  findBySession(sessionId: string, opts?: { limit?: number; offset?: number }): Promise<MessageRow[]>;
  findByRun(runId: string): Promise<MessageRow[]>;
}

export interface RunRepository {
  create(data: Partial<InsertRun> & Pick<InsertRun, 'sessionId' | 'skillName'>): Promise<RunRow>;
  findById(id: string): Promise<RunRow | undefined>;
  findBySession(sessionId: string, opts?: { limit?: number }): Promise<RunRow[]>;
  findActiveBySession(sessionId: string): Promise<RunRow | undefined>;
  updateStatus(
    id: string,
    status: string,
    extra?: { finishedAt?: string; durationMs?: number; errorCode?: string; errorMessage?: string },
  ): Promise<void>;
  update(id: string, data: Partial<InsertRun>): Promise<void>;
}

export interface RuntimeEventRepository {
  append(event: InsertRuntimeEvent): Promise<RuntimeEventRow>;
  findBySession(sessionId: string, opts?: { afterSeq?: number; limit?: number }): Promise<RuntimeEventRow[]>;
  findByRun(runId: string, opts?: { afterSeq?: number; limit?: number }): Promise<RuntimeEventRow[]>;
  nextSessionSeq(sessionId: string): Promise<number>;
  nextRunSeq(runId: string): Promise<number>;
}

export interface ToolCallRepository {
  create(data: InsertToolCall): Promise<ToolCallRow>;
  findById(id: string): Promise<ToolCallRow | undefined>;
  updateStatus(
    id: string,
    status: string,
    extra?: {
      resultJson?: string;
      resultText?: string;
      errorCode?: string;
      errorMessage?: string;
      finishedAt?: string;
      latencyMs?: number;
    },
  ): Promise<void>;
  findByRun(runId: string): Promise<ToolCallRow[]>;
}

export interface ArtifactRepository {
  create(data: Partial<InsertArtifact> & Pick<InsertArtifact, 'runId' | 'kind' | 'name'>): Promise<ArtifactRow>;
  findById(id: string): Promise<ArtifactRow | undefined>;
  findByRun(runId: string): Promise<ArtifactRow[]>;
  findBySession(sessionId: string): Promise<ArtifactRow[]>;
}

export interface RunnerRepository {
  create(data: InsertRunnerRun): Promise<RunnerRunRow>;
  findByRun(runId: string): Promise<RunnerRunRow | undefined>;
  upsertProvider(data: InsertRunnerProvider): Promise<RunnerProviderRow>;
  listProviders(): Promise<RunnerProviderRow[]>;
}

export interface GoalRepository {
  create(data: { sessionId: string; goal: string; status?: string }): Promise<GoalRow>;
  findById(id: string): Promise<GoalRow | undefined>;
  findActiveBySession(sessionId: string): Promise<GoalRow | undefined>;
}

export interface CommandLogRepository {
  create(data: InsertCommandLog): Promise<CommandLogRow>;
  findByIdempotencyKey(key: string): Promise<CommandLogRow | undefined>;
  updateResult(
    id: string,
    data: { status: string; responseJson?: string; errorCode?: string; errorMessage?: string; finishedAt?: string },
  ): Promise<void>;
}

// ─── Row types (derived from Drizzle schema) ─────────────────────────

export type SessionRow = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

export type MessageRow = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export type RunRow = typeof runs.$inferSelect;
export type InsertRun = typeof runs.$inferInsert;

export type RuntimeEventRow = typeof runtimeEvents.$inferSelect;
export type InsertRuntimeEvent = typeof runtimeEvents.$inferInsert;

export type ToolCallRow = typeof toolCalls.$inferSelect;
export type InsertToolCall = typeof toolCalls.$inferInsert;

export type ArtifactRow = typeof artifacts.$inferSelect;
export type InsertArtifact = typeof artifacts.$inferInsert;

export type RunnerRunRow = typeof runnerRuns.$inferSelect;
export type InsertRunnerRun = typeof runnerRuns.$inferInsert;

export type RunnerProviderRow = typeof runnerProviders.$inferSelect;
export type InsertRunnerProvider = typeof runnerProviders.$inferInsert;

export type GoalRow = typeof researchGoals.$inferSelect;
export type InsertGoal = typeof researchGoals.$inferInsert;

export type CommandLogRow = typeof commandLog.$inferSelect;
export type InsertCommandLog = typeof commandLog.$inferInsert;
