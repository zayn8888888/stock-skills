/**
 * FixtureAdapter — deterministic, in-memory data source for testing
 * and development. Returns canned NVDA data for all supported operations.
 */

import { nanoid } from "nanoid";
import type {
  AdapterRequest,
  DataSourceAdapter,
  Observation,
  RawResponse,
  SourceHealth,
} from "../base";

// ──────────────────────────── Canned Data ─────────────────────────

const NVDA_QUOTE = {
  ticker: "NVDA",
  last_price: 134.66,
  change_pct: 2.35,
  volume: 287_400_000,
  turnover: 38_730_000_000,
  currency: "USD",
  market: "NASDAQ",
  name: "NVIDIA Corporation",
  timestamp: "2026-05-30T16:00:00Z",
};

const NVDA_KLINE = {
  timeframe: "1d",
  bars: [
    { date: "2026-05-26", open: 130.2, high: 132.8, low: 129.5, close: 131.5, volume: 245_000_000 },
    { date: "2026-05-27", open: 131.8, high: 134.1, low: 131.0, close: 133.2, volume: 260_000_000 },
    { date: "2026-05-28", open: 133.0, high: 134.5, low: 132.1, close: 132.9, volume: 210_000_000 },
    { date: "2026-05-29", open: 132.5, high: 133.8, low: 131.6, close: 131.8, volume: 195_000_000 },
    { date: "2026-05-30", open: 132.0, high: 135.2, low: 131.5, close: 134.66, volume: 287_400_000 },
  ],
};

const NVDA_NEWS = {
  items: [
    {
      title: "NVIDIA unveils next-gen Blackwell Ultra GPU at Computex 2026",
      url: "https://example.com/news/nvda-blackwell-ultra",
      published_at: "2026-05-30T10:00:00Z",
      source: "Reuters",
    },
    {
      title: "NVIDIA data center revenue surges 55% YoY in Q1 FY2027",
      url: "https://example.com/news/nvda-q1-earnings",
      published_at: "2026-05-29T14:30:00Z",
      source: "Bloomberg",
    },
    {
      title: "Major cloud providers double down on NVIDIA GPU orders",
      url: "https://example.com/news/nvda-cloud-demand",
      published_at: "2026-05-28T09:15:00Z",
      source: "CNBC",
    },
  ],
};

const NVDA_TECHNICAL = {
  indicators: {
    sma_20: 131.2,
    sma_50: 128.7,
    sma_200: 115.3,
    rsi_14: 62.4,
    macd: 1.85,
    macd_signal: 1.42,
    bollinger_upper: 138.5,
    bollinger_lower: 126.1,
    atr_14: 3.2,
  },
  trend_summary: "Bullish — price above SMA20/50/200, RSI neutral-healthy, MACD positive crossover.",
};

// ──────────────────────────── Operation → Data Map ────────────────

const FIXTURE_DATA: Record<string, unknown> = {
  "quote.snapshot": NVDA_QUOTE,
  "quote.kline": NVDA_KLINE,
  "news.search": NVDA_NEWS,
  "technical.indicators": NVDA_TECHNICAL,
};

const OPERATION_CATEGORY: Record<string, string> = {
  "quote.snapshot": "quote",
  "quote.kline": "kline",
  "news.search": "news",
  "technical.indicators": "technical",
};

// ──────────────────────────── FixtureAdapter ──────────────────────

export class FixtureAdapter implements DataSourceAdapter {
  readonly name = "fixture";

  async healthCheck(): Promise<SourceHealth> {
    return {
      name: this.name,
      status: "healthy",
      latency_ms: 0,
      last_checked_at: new Date().toISOString(),
    };
  }

  async fetch(request: AdapterRequest): Promise<RawResponse> {
    const data = FIXTURE_DATA[request.operation];
    if (!data) {
      throw new Error(
        `FixtureAdapter does not support operation "${request.operation}". ` +
          `Supported: ${this.capabilities().join(", ")}`
      );
    }

    return {
      data,
      latency_ms: 0,
      source: this.name,
      operation: request.operation,
      fetched_at: new Date().toISOString(),
    };
  }

  normalize(raw: RawResponse, request: AdapterRequest): Observation[] {
    const category = OPERATION_CATEGORY[raw.operation] ?? raw.operation;
    const now = new Date().toISOString();

    const observation: Observation = {
      id: nanoid(),
      sessionId: "", // Caller must fill this in
      category,
      ticker: request.ticker ?? null,
      detail: JSON.stringify(raw.data),
      confidence: 1.0,
      createdAt: now,
      value: JSON.stringify(raw.data),
      source: this.name,
      observedAt: raw.fetched_at,
    };

    return [observation];
  }

  capabilities(): string[] {
    return Object.keys(FIXTURE_DATA);
  }
}
