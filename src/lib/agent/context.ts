import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// ──────────────────────────── types ──────────────────────────────

export interface MessageRecord {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata: string | null;
}

export interface GoalRecord {
  id: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  uiSummary: string | null;
  criteria: {
    id: string;
    criterion: string;
    type: string;
    targetValue: number | null;
    currentValue: number | null;
    status: string;
  }[];
}

export interface TickerContext {
  ticker: string;
  observations: {
    id: string;
    category: string;
    detail: string;
    confidence: number | null;
    createdAt: string;
  }[];
  decisions: {
    id: string;
    decision: string;
    rationale: string | null;
    confidence: number | null;
    createdAt: string;
  }[];
}

export interface AgentContext {
  sessionId: string;
  messages: MessageRecord[];
  goal: GoalRecord | null;
  ticker: TickerContext | null;
  recentRuns: {
    id: string;
    skillName: string;
    status: string;
    resultSummary: string | null;
    createdAt: string;
  }[];
}

// ──────────────────────── public API ─────────────────────────────

/**
 * Build a structured context object for an agent run.
 *
 * @param db        Drizzle database instance
 * @param sessionId The session to load history from
 * @param goalId    Optional goal ID — when provided the goal + criteria are included
 * @param ticker    Optional ticker symbol — when provided observations & decisions are included
 */
export function buildAgentContext(
  db: DB,
  sessionId: string,
  goalId?: string,
  ticker?: string,
): AgentContext {
  const messages = loadMessages(db, sessionId);
  const goal = goalId ? loadGoal(db, goalId) : null;
  const tickerCtx = ticker ? buildTickerContext(db, sessionId, ticker) : null;
  const recentRuns = loadRecentRuns(db, sessionId, 10);

  return {
    sessionId,
    messages,
    goal,
    ticker: tickerCtx,
    recentRuns,
  };
}

// ──────────────────────── internal ───────────────────────────────

function loadMessages(db: DB, sessionId: string): MessageRecord[] {
  const rows = db
    .select({
      id: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content,
      createdAt: schema.messages.createdAt,
      metadata: schema.messages.metadata,
    })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId))
    .orderBy(schema.messages.createdAt)
    .all();

  return rows;
}

function loadGoal(db: DB, goalId: string): GoalRecord | null {
  const [goalRow] = db
    .select()
    .from(schema.researchGoals)
    .where(eq(schema.researchGoals.id, goalId))
    .limit(1)
    .all();

  if (!goalRow) return null;

  const criteriaRows = db
    .select()
    .from(schema.goalCriteria)
    .where(eq(schema.goalCriteria.goalId, goalId))
    .all();

  return {
    id: goalRow.id,
    goal: goalRow.goal,
    status: goalRow.status,
    createdAt: goalRow.createdAt,
    updatedAt: goalRow.updatedAt,
    uiSummary: goalRow.uiSummary,
    criteria: criteriaRows.map((c) => ({
      id: c.id,
      criterion: c.criterion,
      type: c.type,
      targetValue: c.targetValue,
      currentValue: c.currentValue,
      status: c.status,
    })),
  };
}

function buildTickerContext(db: DB, sessionId: string, ticker: string): TickerContext {
  const obsRows = db
    .select()
    .from(schema.observations)
    .where(eq(schema.observations.sessionId, sessionId))
    .all()
    .filter((r) => r.ticker === ticker);

  const decisionRows = db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.sessionId, sessionId))
    .all();

  return {
    ticker,
    observations: obsRows.map((r) => ({
      id: r.id,
      category: r.category,
      detail: r.detail,
      confidence: r.confidence,
      createdAt: r.createdAt,
    })),
    decisions: decisionRows.map((r) => ({
      id: r.id,
      decision: r.decision,
      rationale: r.rationale,
      confidence: r.confidence,
      createdAt: r.createdAt,
    })),
  };
}

function loadRecentRuns(db: DB, sessionId: string, limit: number): AgentContext["recentRuns"] {
  const rows = db
    .select({
      id: schema.runs.id,
      skillName: schema.runs.skillName,
      status: schema.runs.status,
      resultSummary: schema.runs.resultSummary,
      createdAt: schema.runs.createdAt,
    })
    .from(schema.runs)
    .where(eq(schema.runs.sessionId, sessionId))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit)
    .all();

  return rows;
}
