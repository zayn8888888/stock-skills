/**
 * Core interfaces for data source adapters.
 *
 * Every external data provider (market API, news API, fixture, etc.)
 * implements DataSourceAdapter so the observation pipeline can treat
 * them uniformly.
 */

// ──────────────────────────── Health ──────────────────────────────

export type SourceStatus = "healthy" | "degraded" | "down" | "unknown";

export interface SourceHealth {
  name: string;
  status: SourceStatus;
  latency_ms?: number;
  last_checked_at?: string;
  last_error?: string;
}

// ──────────────────────────── Request / Response ──────────────────

export interface AdapterRequest {
  /** Operation identifier, e.g. "quote.snapshot", "news.search" */
  operation: string;
  /** Ticker symbol, e.g. "NVDA", "AAPL" */
  ticker?: string;
  /** Market identifier, e.g. "NASDAQ", "SSE" */
  market?: string;
  /** Arbitrary operation-specific parameters */
  params?: Record<string, unknown>;
}

export interface RawResponse<T = unknown> {
  data: T;
  latency_ms: number;
  source: string;
  operation: string;
  fetched_at: string; // ISO-8601
}

// ──────────────────────────── Observation ─────────────────────────
// Matches the observations table in src/lib/db/schema.ts

export interface Observation {
  id: string;
  sessionId: string;
  category: string;
  ticker: string | null;
  detail: string;
  confidence: number | null;
  createdAt: string;
  /** JSON-encoded value payload (validated by Zod schemas) */
  value?: string;
  /** Data source that produced this observation */
  source?: string;
  /** ISO-8601 timestamp of the underlying data point */
  observedAt?: string;
  /** ISO-8601 timestamp when the observation expires */
  expiresAt?: string;
}

// ──────────────────────────── Adapter Interface ──────────────────

export interface DataSourceAdapter {
  /** Unique adapter name, e.g. "fixture", "yfinance", "alpha_vantage" */
  readonly name: string;

  /** Health-check: returns current source status */
  healthCheck(): Promise<SourceHealth>;

  /** Fetch raw data for the given request */
  fetch(request: AdapterRequest): Promise<RawResponse>;

  /** Convert a raw response into one or more Observation objects */
  normalize(raw: RawResponse, request: AdapterRequest): Observation[];

  /** List of supported operations, e.g. ["quote.snapshot", "quote.kline"] */
  capabilities(): string[];
}
