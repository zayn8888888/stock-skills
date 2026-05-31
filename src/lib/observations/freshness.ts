/**
 * Freshness / TTL policy for observations.
 *
 * Each category has a maximum age after which its observations are
 * considered stale and should be refreshed before use.
 */

export interface FreshnessPolicy {
  /** Category name matching observation.category */
  category: string;
  /** Maximum age in milliseconds */
  maxAgeMs: number;
}

// ──────────────────────────── Policies ────────────────────────────

const HOUR = 60 * 60 * 1000;
const _DAY = 24 * HOUR;

export const FRESHNESS_POLICIES: FreshnessPolicy[] = [
  { category: "quote", maxAgeMs: 4 * HOUR },
  { category: "kline", maxAgeMs: 1 * HOUR },
  { category: "news", maxAgeMs: 24 * HOUR },
  { category: "technical", maxAgeMs: 4 * HOUR },
  { category: "fundamental", maxAgeMs: 24 * HOUR },
  { category: "sentiment", maxAgeMs: 12 * HOUR },
  { category: "funding", maxAgeMs: 1 * HOUR },
  { category: "options", maxAgeMs: 24 * HOUR },
];

const POLICY_MAP = new Map<string, number>(FRESHNESS_POLICIES.map((p) => [p.category, p.maxAgeMs]));

// Default TTL for categories without an explicit policy
const DEFAULT_MAX_AGE_MS = 4 * HOUR;

// ──────────────────────────── Public API ──────────────────────────

/**
 * Calculate the expiration timestamp for an observation of the given
 * category, based on the time the data was observed.
 */
export function getFreshnessExpiry(category: string, observedAt: string | Date): string {
  const maxAge = POLICY_MAP.get(category) ?? DEFAULT_MAX_AGE_MS;
  const observed = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
  return new Date(observed.getTime() + maxAge).toISOString();
}

/**
 * Returns true if the observation has expired (current time > expiresAt).
 *
 * If the observation has no expiresAt field, it is considered expired
 * as a safety measure.
 */
export function isExpired(observation: { expiresAt?: string | null }, now?: Date): boolean {
  if (!observation.expiresAt) return true;
  const currentTime = now ?? new Date();
  return currentTime.getTime() > new Date(observation.expiresAt).getTime();
}

/** Get the max-age in milliseconds for a given category. */
export function getMaxAgeMs(category: string): number {
  return POLICY_MAP.get(category) ?? DEFAULT_MAX_AGE_MS;
}
