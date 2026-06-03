/**
 * Drizzle-backed implementation of RuntimeStore repositories.
 *
 * This module is the ONLY place that directly writes Drizzle queries for the
 * vNext runtime. All other modules go through the RuntimeStore interface.
 */

import * as schema from "@/lib/db/schema";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ArtifactRepository,
  ArtifactRow,
  CommandLogRepository,
  CommandLogRow,
  GoalRepository,
  GoalRow,
  InsertArtifact,
  InsertCommandLog,
  InsertMessage,
  InsertRun,
  InsertRunnerProvider,
  InsertRunnerRun,
  InsertRuntimeEvent,
  InsertSession,
  InsertToolCall,
  MessageRepository,
  MessageRow,
  RunRepository,
  RunRow,
  RunnerProviderRow,
  RunnerRepository,
  RunnerRunRow,
  RuntimeEventRepository,
  RuntimeEventRow,
  RuntimeStore,
  RuntimeStoreTx,
  SessionRepository,
  SessionRow,
  ToolCallRepository,
  ToolCallRow,
} from "./store";

type DrizzleDb = ReturnType<typeof import("drizzle-orm/better-sqlite3").drizzle<typeof schema>>;

// ─── Factory ─────────────────────────────────────────────────────────

export function createRuntimeStore(db: DrizzleDb): RuntimeStore {
  const repos = {
    sessions: new DrizzleSessionRepo(db),
    messages: new DrizzleMessageRepo(db),
    runs: new DrizzleRunRepo(db),
    events: new DrizzleEventRepo(db),
    tools: new DrizzleToolCallRepo(db),
    artifacts: new DrizzleArtifactRepo(db),
    runners: new DrizzleRunnerRepo(db),
    goals: new DrizzleGoalRepo(db),
    commands: new DrizzleCommandLogRepo(db),
  };

  const store: RuntimeStore = {
    ...repos,
    async transaction<T>(fn: (tx: RuntimeStoreTx) => Promise<T> | T): Promise<T> {
      return db.transaction(async (tx) => {
        const txStore: RuntimeStoreTx = {
          sessions: new DrizzleSessionRepo(tx as unknown as DrizzleDb),
          messages: new DrizzleMessageRepo(tx as unknown as DrizzleDb),
          runs: new DrizzleRunRepo(tx as unknown as DrizzleDb),
          events: new DrizzleEventRepo(tx as unknown as DrizzleDb),
          tools: new DrizzleToolCallRepo(tx as unknown as DrizzleDb),
          artifacts: new DrizzleArtifactRepo(tx as unknown as DrizzleDb),
          runners: new DrizzleRunnerRepo(tx as unknown as DrizzleDb),
          goals: new DrizzleGoalRepo(tx as unknown as DrizzleDb),
          commands: new DrizzleCommandLogRepo(tx as unknown as DrizzleDb),
        };
        return fn(txStore);
      });
    },
  };

  return store;
}

// ─── Sessions ────────────────────────────────────────────────────────

class DrizzleSessionRepo implements SessionRepository {
  constructor(private db: DrizzleDb) {}

  async create(
    data: Partial<InsertSession> & Pick<InsertSession, "id" | "status">,
  ): Promise<SessionRow> {
    const now = new Date().toISOString();
    const row: InsertSession = {
      title: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    await this.db.insert(schema.sessions).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<SessionRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1);
    return rows[0];
  }

  async update(id: string, data: Partial<InsertSession>): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, id));
  }

  async setActiveRun(sessionId: string, runId: string | null): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ activeRunId: runId, updatedAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, sessionId));
  }
}

// ─── Messages ────────────────────────────────────────────────────────

class DrizzleMessageRepo implements MessageRepository {
  constructor(private db: DrizzleDb) {}

  async create(
    data: Partial<InsertMessage> & Pick<InsertMessage, "sessionId" | "role" | "content">,
  ): Promise<MessageRow> {
    const now = new Date().toISOString();
    const row: InsertMessage = {
      id: nanoid(),
      messageType: "plain",
      messageStatus: "visible",
      contentFormat: "markdown",
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    await this.db.insert(schema.messages).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<MessageRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, id))
      .limit(1);
    return rows[0];
  }

  async findBySession(
    sessionId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<MessageRow[]> {
    const base = this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .orderBy(asc(schema.messages.createdAt));
    const limited = opts?.limit ? base.limit(opts.limit) : base;
    const result = opts?.offset ? limited.offset(opts.offset) : limited;
    return await result;
  }

  async findByRun(runId: string): Promise<MessageRow[]> {
    return await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.runId, runId))
      .orderBy(asc(schema.messages.createdAt));
  }
}

// ─── Runs ────────────────────────────────────────────────────────────

class DrizzleRunRepo implements RunRepository {
  constructor(private db: DrizzleDb) {}

  async create(
    data: Partial<InsertRun> & Pick<InsertRun, "sessionId" | "skillName">,
  ): Promise<RunRow> {
    const now = new Date().toISOString();
    const row: InsertRun = {
      id: nanoid(),
      status: "queued",
      createdAt: now,
      queuedAt: now,
      ...data,
    };
    await this.db.insert(schema.runs).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<RunRow | undefined> {
    const rows = await this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
    return rows[0];
  }

  async findBySession(sessionId: string, opts?: { limit?: number }): Promise<RunRow[]> {
    const base = this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.sessionId, sessionId))
      .orderBy(desc(schema.runs.createdAt));
    const result = opts?.limit ? base.limit(opts.limit) : base;
    return await result;
  }

  async findActiveBySession(sessionId: string): Promise<RunRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.runs)
      .where(
        and(
          eq(schema.runs.sessionId, sessionId),
          // Active statuses: queued, running, waiting_for_input
          sql`${schema.runs.status} IN ('queued', 'running', 'waiting_for_input')`,
        ),
      )
      .orderBy(desc(schema.runs.createdAt))
      .limit(1);
    return rows[0];
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: { finishedAt?: string; durationMs?: number; errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    await this.db
      .update(schema.runs)
      .set({
        status,
        ...(extra?.finishedAt ? { finishedAt: extra.finishedAt } : {}),
        ...(extra?.durationMs != null ? { durationMs: extra.durationMs } : {}),
        ...(extra?.errorCode ? { errorCode: extra.errorCode } : {}),
        ...(extra?.errorMessage ? { errorMessage: extra.errorMessage } : {}),
      })
      .where(eq(schema.runs.id, id));
  }

  async update(id: string, data: Partial<InsertRun>): Promise<void> {
    await this.db.update(schema.runs).set(data).where(eq(schema.runs.id, id));
  }
}

// ─── RuntimeEvents ───────────────────────────────────────────────────

class DrizzleEventRepo implements RuntimeEventRepository {
  constructor(private db: DrizzleDb) {}

  async append(event: InsertRuntimeEvent): Promise<RuntimeEventRow> {
    const row: InsertRuntimeEvent = {
      ...event,
      schemaVersion: event.schemaVersion ?? "runtime-event.v1",
      persist: event.persist ?? 1,
      createdAt: event.createdAt ?? new Date().toISOString(),
    };
    await this.db.insert(schema.runtimeEvents).values(row);
    const result = await this.findBySession(row.sessionId as string, { limit: 1 });
    return result[result.length - 1] ?? row;
  }

  async findBySession(
    sessionId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<RuntimeEventRow[]> {
    const conditions = [eq(schema.runtimeEvents.sessionId, sessionId)];
    if (opts?.afterSeq != null) {
      conditions.push(gt(schema.runtimeEvents.sessionSeq, opts.afterSeq));
    }
    const base = this.db
      .select()
      .from(schema.runtimeEvents)
      .where(and(...conditions))
      .orderBy(asc(schema.runtimeEvents.sessionSeq));
    const result = opts?.limit ? base.limit(opts.limit) : base;
    return await result;
  }

  async findByRun(
    runId: string,
    opts?: { afterSeq?: number; limit?: number },
  ): Promise<RuntimeEventRow[]> {
    const conditions = [eq(schema.runtimeEvents.runId, runId)];
    if (opts?.afterSeq != null) {
      // biome-ignore lint/style/noNonNullAssertion: runSeq is always set for event rows
      conditions.push(gt(schema.runtimeEvents.runSeq!, opts.afterSeq));
    }
    const base = this.db
      .select()
      .from(schema.runtimeEvents)
      .where(and(...conditions))
      .orderBy(asc(schema.runtimeEvents.runSeq));
    const result = opts?.limit ? base.limit(opts.limit) : base;
    return await result;
  }

  async nextSessionSeq(sessionId: string): Promise<number> {
    const rows = await this.db
      .select({ maxSeq: sql<number>`coalesce(max(${schema.runtimeEvents.sessionSeq}), 0)` })
      .from(schema.runtimeEvents)
      .where(eq(schema.runtimeEvents.sessionId, sessionId));
    return (rows[0]?.maxSeq ?? 0) + 1;
  }

  async nextRunSeq(runId: string): Promise<number> {
    const rows = await this.db
      .select({ maxSeq: sql<number>`coalesce(max(${schema.runtimeEvents.runSeq}), 0)` })
      .from(schema.runtimeEvents)
      .where(eq(schema.runtimeEvents.runId, runId));
    return (rows[0]?.maxSeq ?? 0) + 1;
  }
}

// ─── ToolCalls ───────────────────────────────────────────────────────

class DrizzleToolCallRepo implements ToolCallRepository {
  constructor(private db: DrizzleDb) {}

  async create(data: InsertToolCall): Promise<ToolCallRow> {
    const now = new Date().toISOString();
    const row: InsertToolCall = {
      ...data,
      id: data.id ?? nanoid(),
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    await this.db.insert(schema.toolCalls).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<ToolCallRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.toolCalls)
      .where(eq(schema.toolCalls.id, id))
      .limit(1);
    return rows[0];
  }

  async updateStatus(
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
  ): Promise<void> {
    await this.db
      .update(schema.toolCalls)
      .set({
        status,
        updatedAt: new Date().toISOString(),
        ...(extra?.resultJson != null ? { resultJson: extra.resultJson } : {}),
        ...(extra?.resultText != null ? { resultText: extra.resultText } : {}),
        ...(extra?.errorCode ? { errorCode: extra.errorCode } : {}),
        ...(extra?.errorMessage ? { errorMessage: extra.errorMessage } : {}),
        ...(extra?.finishedAt ? { finishedAt: extra.finishedAt } : {}),
        ...(extra?.latencyMs != null ? { latencyMs: extra.latencyMs } : {}),
      })
      .where(eq(schema.toolCalls.id, id));
  }

  async findByRun(runId: string): Promise<ToolCallRow[]> {
    return await this.db
      .select()
      .from(schema.toolCalls)
      .where(eq(schema.toolCalls.runId, runId))
      .orderBy(asc(schema.toolCalls.createdAt));
  }
}

// ─── Artifacts ───────────────────────────────────────────────────────

class DrizzleArtifactRepo implements ArtifactRepository {
  constructor(private db: DrizzleDb) {}

  async create(
    data: Partial<InsertArtifact> & Pick<InsertArtifact, "runId" | "kind" | "name">,
  ): Promise<ArtifactRow> {
    const row: InsertArtifact = {
      ...data,
      id: data.id ?? nanoid(),
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    await this.db.insert(schema.artifacts).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<ArtifactRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.id, id))
      .limit(1);
    return rows[0];
  }

  async findByRun(runId: string): Promise<ArtifactRow[]> {
    return await this.db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.runId, runId))
      .orderBy(asc(schema.artifacts.createdAt));
  }

  async findBySession(sessionId: string): Promise<ArtifactRow[]> {
    return await this.db
      .select()
      .from(schema.artifacts)
      // biome-ignore lint/style/noNonNullAssertion: sessionId is always set for session artifacts
      .where(eq(schema.artifacts.sessionId!, sessionId))
      .orderBy(asc(schema.artifacts.createdAt));
  }
}

// ─── Runners ─────────────────────────────────────────────────────────

class DrizzleRunnerRepo implements RunnerRepository {
  constructor(private db: DrizzleDb) {}

  async create(data: InsertRunnerRun): Promise<RunnerRunRow> {
    const now = new Date().toISOString();
    const row: InsertRunnerRun = {
      ...data,
      id: data.id ?? nanoid(),
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    await this.db.insert(schema.runnerRuns).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findByRun(row.runId as string))!;
  }

  async findByRun(runId: string): Promise<RunnerRunRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.runnerRuns)
      .where(eq(schema.runnerRuns.runId, runId))
      .limit(1);
    return rows[0];
  }

  async upsertProvider(data: InsertRunnerProvider): Promise<RunnerProviderRow> {
    const now = new Date().toISOString();
    const row: InsertRunnerProvider = {
      ...data,
      id: data.id ?? nanoid(),
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    // Use INSERT OR REPLACE for upsert
    await this.db
      .insert(schema.runnerProviders)
      .values(row)
      .onConflictDoUpdate({
        target: schema.runnerProviders.id,
        set: { ...row, updatedAt: now },
      });
    const rows = await this.db
      .select()
      .from(schema.runnerProviders)
      .where(eq(schema.runnerProviders.id, row.id as string))
      .limit(1);
    // biome-ignore lint/style/noNonNullAssertion: we just upserted it
    return rows[0]!;
  }

  async listProviders(): Promise<RunnerProviderRow[]> {
    return await this.db.select().from(schema.runnerProviders);
  }
}

// ─── Goals ───────────────────────────────────────────────────────────

class DrizzleGoalRepo implements GoalRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<GoalRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.researchGoals)
      .where(eq(schema.researchGoals.id, id))
      .limit(1);
    return rows[0];
  }

  async findActiveBySession(sessionId: string): Promise<GoalRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.researchGoals)
      .where(
        and(
          eq(schema.researchGoals.sessionId, sessionId),
          eq(schema.researchGoals.status, "active"),
        ),
      )
      .limit(1);
    return rows[0];
  }
}

// ─── CommandLog ──────────────────────────────────────────────────────

class DrizzleCommandLogRepo implements CommandLogRepository {
  constructor(private db: DrizzleDb) {}

  async create(data: InsertCommandLog): Promise<CommandLogRow> {
    const row: InsertCommandLog = {
      ...data,
      id: data.id ?? nanoid(),
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    await this.db.insert(schema.commandLog).values(row);
    // biome-ignore lint/style/noNonNullAssertion: we just inserted it
    return (await this.findById(row.id!))!;
  }

  async findById(id: string): Promise<CommandLogRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.commandLog)
      .where(eq(schema.commandLog.id, id))
      .limit(1);
    return rows[0];
  }

  async findByIdempotencyKey(key: string): Promise<CommandLogRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.commandLog)
      .where(eq(schema.commandLog.idempotencyKey, key))
      .limit(1);
    return rows[0];
  }

  async updateResult(
    id: string,
    data: {
      status: string;
      responseJson?: string;
      errorCode?: string;
      errorMessage?: string;
      finishedAt?: string;
    },
  ): Promise<void> {
    await this.db
      .update(schema.commandLog)
      .set({
        status: data.status,
        responseJson: data.responseJson ?? null,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
        finishedAt: data.finishedAt ?? new Date().toISOString(),
      })
      .where(eq(schema.commandLog.id, id));
  }
}
