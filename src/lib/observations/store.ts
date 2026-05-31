/**
 * ObservationStore — insert, query, and retrieve unexpired observations.
 *
 * Works directly with the Drizzle database instance returned by getDb().
 * Observations are stored in the `observations` table defined in schema.ts.
 *
 * Note: The current schema stores observation value as JSON in the `detail`
 * column. This store follows that convention.
 */

import type { Observation } from "@/lib/adapters/base";
import { observations } from "@/lib/db/schema";
import { type SQL, and, desc, eq, gte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getFreshnessExpiry, isExpired } from "./freshness";

// Use the Drizzle database type with schema
type DB = BetterSQLite3Database<typeof import("@/lib/db/schema")>;

// ──────────────────────────── Query Options ───────────────────────

export interface ObservationQuery {
  ticker: string;
  category?: string;
  source?: string;
  since?: string; // ISO-8601 — only return observations created after this
}

// ──────────────────────────── Insert ──────────────────────────────

/**
 * Insert a single observation into the database.
 *
 * The observation's detail field receives the JSON-encoded value payload.
 * expiresAt is auto-calculated from the freshness policy if not set.
 */
export function insert(db: DB, observation: Observation): Observation {
  const expiresAt =
    observation.expiresAt ?? getFreshnessExpiry(observation.category, observation.createdAt);

  db.insert(observations)
    .values({
      id: observation.id,
      sessionId: observation.sessionId,
      category: observation.category,
      ticker: observation.ticker,
      detail: observation.detail,
      confidence: observation.confidence,
      createdAt: observation.createdAt,
    })
    .run();

  return { ...observation, expiresAt };
}

// ──────────────────────────── Query ───────────────────────────────

/**
 * Query observations matching the given filters.
 * Results are ordered by createdAt descending (most recent first).
 */
export function query(db: DB, opts: ObservationQuery): Observation[] {
  const conditions: SQL[] = [eq(observations.ticker, opts.ticker)];

  if (opts.category) {
    conditions.push(eq(observations.category, opts.category));
  }
  if (opts.since) {
    conditions.push(gte(observations.createdAt, opts.since));
  }

  const rows = db
    .select()
    .from(observations)
    .where(and(...conditions))
    .orderBy(desc(observations.createdAt))
    .all();

  return rows.map(rowToObservation);
}

// ──────────────────────────── Get Unexpired ───────────────────────

/**
 * Return all observations for a ticker that have not yet expired,
 * ordered by createdAt descending.
 */
export function getUnexpired(db: DB, ticker: string): Observation[] {
  const now = new Date();

  const rows = db
    .select()
    .from(observations)
    .where(eq(observations.ticker, ticker))
    .orderBy(desc(observations.createdAt))
    .all();

  return rows.map(rowToObservation).filter((obs) => !isExpired(obs, now));
}

// ──────────────────────────── Helpers ─────────────────────────────

function rowToObservation(row: typeof observations.$inferSelect): Observation {
  return {
    id: row.id,
    sessionId: row.sessionId,
    category: row.category,
    ticker: row.ticker,
    detail: row.detail,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}
