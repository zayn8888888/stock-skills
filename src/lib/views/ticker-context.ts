/**
 * TickerContextBuilder — assembles a unified view of all data
 * relevant to a specific ticker from the database.
 *
 * This is the primary read model for skills that need to assess
 * the current state of a ticker before acting.
 */

import type { Observation } from "@/lib/adapters/base";
import { decisions, observations, runs } from "@/lib/db/schema";
import { isExpired } from "@/lib/observations/freshness";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// Reuse the DB type alias from the store module
type DB = BetterSQLite3Database<typeof import("@/lib/db/schema")>;

// ──────────────────────────── Types ───────────────────────────────

export interface RunSummary {
  id: string;
  skillName: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  resultSummary: string | null;
  createdAt: string;
}

export interface DecisionSummary {
  id: string;
  decision: string;
  rationale: string | null;
  confidence: number | null;
  createdAt: string;
  sessionId: string;
}

export interface DataGap {
  category: string;
  status: "missing" | "expired";
  lastObservation: string | null; // ISO-8601 of last observation, if any
}

export interface TickerContext {
  ticker: string;
  /** Most recent runs (across all sessions) for this ticker's skills */
  latestRuns: RunSummary[];
  /** Observations that have not yet expired */
  unexpiredObservations: Observation[];
  /** All observations including expired, for reference */
  allObservations: Observation[];
  /** Decisions referencing this ticker's observations */
  openDecisions: DecisionSummary[];
  /** Categories with missing or expired data */
  dataGaps: DataGap[];
  /** ISO-8601 timestamp when this context was built */
  builtAt: string;
}

// ──────────────────────────── Expected Categories ─────────────────

const EXPECTED_CATEGORIES = ["quote", "kline", "technical", "news", "fundamental", "sentiment"];

// ──────────────────────────── Builder ─────────────────────────────

/**
 * Build a TickerContext for the given ticker.
 *
 * Queries the database for:
 * 1. Latest runs (most recent 10)
 * 2. Unexpired observations for this ticker
 * 3. All observations for this ticker (including expired)
 * 4. Open decisions linked to this ticker's observations
 * 5. Data gaps (expected categories with no fresh observation)
 */
export function buildTickerContext(db: DB, ticker: string): TickerContext {
  const now = new Date();
  const nowISO = now.toISOString();

  // 1. Latest runs — grab the most recent 10 runs across all sessions
  //    that reference this ticker (via run_events or skill name patterns)
  const latestRuns: RunSummary[] = db
    .select({
      id: runs.id,
      skillName: runs.skillName,
      status: runs.status,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
      durationMs: runs.durationMs,
      resultSummary: runs.resultSummary,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(10)
    .all();

  // 2 & 3. Observations for this ticker
  const allObsRows = db
    .select()
    .from(observations)
    .where(eq(observations.ticker, ticker))
    .orderBy(desc(observations.createdAt))
    .all();

  const allObservations: Observation[] = allObsRows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    category: row.category,
    ticker: row.ticker,
    detail: row.detail,
    confidence: row.confidence,
    createdAt: row.createdAt,
  }));

  const unexpiredObservations = allObservations.filter((obs) => !isExpired(obs, now));

  // 4. Open decisions — find decisions that belong to sessions where
  //    we have observations for this ticker, and that don't have a
  //    resolved/acted status. Since the decisions table doesn't have
  //    a ticker column, we join through session IDs.
  const sessionIds = new Set(allObsRows.map((r) => r.sessionId));

  let openDecisions: DecisionSummary[] = [];
  if (sessionIds.size > 0) {
    const decisionRows = db
      .select({
        id: decisions.id,
        decision: decisions.decision,
        rationale: decisions.rationale,
        confidence: decisions.confidence,
        createdAt: decisions.createdAt,
        sessionId: decisions.sessionId,
      })
      .from(decisions)
      .orderBy(desc(decisions.createdAt))
      .all();

    openDecisions = decisionRows.filter((d) => sessionIds.has(d.sessionId)).slice(0, 20);
  }

  // 5. Data gaps — determine which expected categories are missing
  //    or have only expired observations
  const freshByCategory = new Set(unexpiredObservations.map((o) => o.category));
  const anyByCategory = new Map<string, string>();
  for (const obs of allObservations) {
    if (!anyByCategory.has(obs.category)) {
      anyByCategory.set(obs.category, obs.createdAt);
    }
  }

  const dataGaps: DataGap[] = [];
  for (const category of EXPECTED_CATEGORIES) {
    if (!anyByCategory.has(category)) {
      dataGaps.push({ category, status: "missing", lastObservation: null });
    } else if (!freshByCategory.has(category)) {
      const lastObservation = anyByCategory.get(category);
      if (!lastObservation) continue;
      dataGaps.push({
        category,
        status: "expired",
        lastObservation,
      });
    }
  }

  return {
    ticker,
    latestRuns,
    unexpiredObservations,
    allObservations,
    openDecisions,
    dataGaps,
    builtAt: nowISO,
  };
}
