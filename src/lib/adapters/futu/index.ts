/**
 * FutuAdapter — connects to a local Futu OpenD gateway for real-time
 * and historical market data (HK / US / CN stocks).
 *
 * Supported operations:
 *   - quote.snapshot  → current price, volume, turnover
 *   - quote.kline     → candlestick data (daily by default)
 *   - quote.depth     → order book (bid/ask levels)
 *
 * Requires a running OpenD instance on the configured host:port.
 * Default: 127.0.0.1:11111
 *
 * Environment variables:
 *   FUTU_OPEND_HOST  (default: 127.0.0.1)
 *   FUTU_OPEND_PORT  (default: 11111)
 */

import { nanoid } from "nanoid";
import { FutuClient, Market, KLType } from "./client";
import type {
  AdapterRequest,
  DataSourceAdapter,
  Observation,
  RawResponse,
  SourceHealth,
} from "../base";

// ──────────────────── Market mapping ────────────────────────────────

const MARKET_MAP: Record<string, number> = {
  HK: Market.HK,
  US: Market.US,
  NASDAQ: Market.US,
  NYSE: Market.US,
  SSE: Market.CN_SH,
  "SH": Market.CN_SH,
  SZ: Market.CN_SZ,
  SG: Market.SG,
  JP: Market.JP,
};

function resolveMarket(market?: string): number {
  if (!market) return Market.US;
  return MARKET_MAP[market.toUpperCase()] ?? Market.US;
}

// ──────────────────── FutuAdapter ───────────────────────────────────

export class FutuAdapter implements DataSourceAdapter {
  readonly name = "futu";
  private client: FutuClient;
  private initialized = false;

  constructor(host?: string, port?: string | number) {
    const h = host ?? process.env.FUTU_OPEND_HOST ?? "127.0.0.1";
    const p = Number(port ?? process.env.FUTU_OPEND_PORT ?? 11111);
    this.client = new FutuClient(h, p);
  }

  // ── DataSourceAdapter interface ─────────────────────────────────

  capabilities(): string[] {
    return ["quote.snapshot", "quote.kline", "quote.depth"];
  }

  async healthCheck(): Promise<SourceHealth> {
    const start = Date.now();
    try {
      await this.ensureReady();
      return {
        name: this.name,
        status: "healthy",
        latency_ms: Date.now() - start,
        last_checked_at: new Date().toISOString(),
      };
    } catch (err) {
      return {
        name: this.name,
        status: "down",
        latency_ms: Date.now() - start,
        last_checked_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async fetch(request: AdapterRequest): Promise<RawResponse> {
    await this.ensureReady();
    const start = Date.now();
    const market = resolveMarket(request.market);
    const ticker = request.ticker ?? "NVDA";

    let data: unknown;

    switch (request.operation) {
      case "quote.snapshot": {
        const qots = await this.client.getBasicQot([
          { market, code: ticker },
        ]);
        data = qots[0] ?? null;
        break;
      }

      case "quote.kline": {
        const num = (request.params?.num as number) ?? 30;
        const klType = (request.params?.klType as number) ?? KLType.Day;
        const bars = await this.client.getKline(market, ticker, klType, num);
        data = { ticker, timeframe: "1d", bars };
        break;
      }

      case "quote.depth": {
        const levels = (request.params?.levels as number) ?? 10;
        const book = await this.client.getOrderBook(market, ticker, levels);
        data = { ticker, ...book };
        break;
      }

      default:
        throw new Error(
          `FutuAdapter: unsupported operation "${request.operation}". ` +
            `Supported: ${this.capabilities().join(", ")}`,
        );
    }

    return {
      data,
      latency_ms: Date.now() - start,
      source: this.name,
      operation: request.operation,
      fetched_at: new Date().toISOString(),
    };
  }

  normalize(raw: RawResponse, request: AdapterRequest): Observation[] {
    const now = new Date().toISOString();

    const OPERATION_CATEGORY: Record<string, string> = {
      "quote.snapshot": "quote",
      "quote.kline": "kline",
      "quote.depth": "depth",
    };

    return [
      {
        id: nanoid(),
        sessionId: "", // Caller fills this in
        category: OPERATION_CATEGORY[raw.operation] ?? raw.operation,
        ticker: request.ticker ?? null,
        detail: JSON.stringify(raw.data, null, 2),
        confidence: 1.0,
        createdAt: now,
        value: JSON.stringify(raw.data),
        source: this.name,
        observedAt: raw.fetched_at,
      },
    ];
  }

  // ── Internal ────────────────────────────────────────────────────

  private async ensureReady(): Promise<void> {
    if (this.initialized) return;
    await this.client.initConnect();
    this.initialized = true;
  }
}

// ──────────────────── Factory ───────────────────────────────────────

/**
 * Create and return a FutuAdapter instance.
 * Call this from the adapter registry setup.
 */
export function createFutuAdapter(): FutuAdapter {
  return new FutuAdapter();
}
