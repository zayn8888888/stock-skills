/**
 * FutuNewsAdapter — Futu public HTTP API for news search and sentiment.
 *
 * Endpoints (no auth required):
 *   - GET /news_search  — news, notices, research reports
 *   - GET /stock_feed   — stock comment sentiment feed
 *
 * Base URL: https://ai-news-search.futunn.com
 */

import { nanoid } from "nanoid";
import type {
  AdapterRequest,
  DataSourceAdapter,
  Observation,
  RawResponse,
  SourceHealth,
} from "../base";

const BASE_URL = "https://ai-news-search.futunn.com";

// ──────────────────── FutuNewsAdapter ────────────────────────────

export class FutuNewsAdapter implements DataSourceAdapter {
  readonly name = "futu-news";

  capabilities(): string[] {
    return ["news.search", "sentiment.feed"];
  }

  async healthCheck(): Promise<SourceHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/news_search?keyword=test&size=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    const start = Date.now();
    const ticker = request.ticker ?? "";
    const params = request.params ?? {};

    let data: unknown;

    switch (request.operation) {
      case "news.search": {
        const keyword = (params.query as string) ?? ticker;
        const size = (params.maxResults as number) ?? 10;
        const newsType = (params.newsType as number) ?? 1; // 1=News, 2=Notice, 3=Research
        const lang = (params.lang as string) ?? "zh";

        const url = new URL(`${BASE_URL}/news_search`);
        url.searchParams.set("keyword", keyword);
        url.searchParams.set("size", String(size));
        url.searchParams.set("news_type", String(newsType));
        url.searchParams.set("lang", lang);
        url.searchParams.set("sort_type", "2"); // 2=最新

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`News search failed: HTTP ${res.status}`);
        const json = (await res.json()) as { code: number; data: unknown[] };
        data = { articles: json.data ?? [] };
        break;
      }

      case "sentiment.feed": {
        const keyword = ticker;
        const size = (params.maxResults as number) ?? 10;

        const url = new URL(`${BASE_URL}/stock_feed`);
        url.searchParams.set("keyword", keyword);
        url.searchParams.set("size", String(size));

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`Sentiment feed failed: HTTP ${res.status}`);
        const json = (await res.json()) as { code: number; data: unknown[] };
        data = { items: json.data ?? [] };
        break;
      }

      default:
        throw new Error(
          `FutuNewsAdapter: unsupported operation "${request.operation}". ` +
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
    return [
      {
        id: nanoid(),
        sessionId: "",
        category: request.operation.split(".")[0],
        ticker: request.ticker ?? null,
        detail: JSON.stringify(raw.data, null, 2),
        confidence: 0.8,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}
