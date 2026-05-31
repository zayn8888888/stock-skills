/**
 * EastMoneyAdapter — 东方财富公开 HTTP API
 *
 * A 股板块扫描首选数据源，覆盖 486 个概念板块。
 * 无需认证，免费公开接口。
 *
 * 接口：
 *   - 板块列表（概念板块，按 5 日涨幅排序）
 *   - 板块成分股（按 5 日涨幅排序）
 *   - 板块历史 K 线（周度轮动分析）
 */
import { nanoid } from "nanoid";
import type {
  AdapterRequest,
  DataSourceAdapter,
  Observation,
  RawResponse,
  SourceHealth,
} from "../base";

const EM_NODES = ["http://push2delay.eastmoney.com", "http://push2.eastmoney.com"];
const EM_HIS_NODE = "http://push2his.eastmoney.com";
const EM_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0",
  Connection: "close",
};

// ── Noise keywords to filter from board names ────────────────────

const NOISE_KEYWORDS = [
  "昨日",
  "历史新高",
  "百日新高",
  "连板",
  "涨停",
  "跌停",
  "首板",
  "大盘股",
  "中盘股",
  "小盘股",
  "龙头股",
  "高价股",
  "低价股",
  "近期新高",
  "破净",
  "破发",
  "回购",
  "增持",
  "社保",
  "QFII",
  "融资融券",
  "沪股通",
  "深股通",
  "A股通",
  "富时",
  "MSCI",
  "标普",
];

function isNoiseBoard(name: string): boolean {
  return NOISE_KEYWORDS.some((kw) => name.includes(kw));
}

// ── Fetch helper with node failover ──────────────────────────────

async function emFetch(path: string, retries = 3): Promise<any> {
  for (const node of EM_NODES) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(node + path, {
          headers: EM_HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        return await res.json();
      } catch {
        // retry
      }
    }
  }
  return {};
}

async function emFetchHis(path: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(EM_HIS_NODE + path, {
        headers: EM_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return {};
}

// ── EastMoneyAdapter ─────────────────────────────────────────────

export class EastMoneyAdapter implements DataSourceAdapter {
  readonly name = "eastmoney";

  capabilities(): string[] {
    return ["market.cn_boards", "market.cn_board_stocks", "market.cn_board_kline"];
  }

  async healthCheck(): Promise<SourceHealth> {
    const start = Date.now();
    try {
      const data = await emFetch(
        "/api/qt/clist/get?pn=1&pz=1&po=1&np=1&fltt=2&invt=2&fid=f109&fs=m:90+t:3&fields=f12,f14",
      );
      if (!data?.data?.diff) throw new Error("Empty response");
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
    let data: unknown;

    switch (request.operation) {
      case "market.cn_boards": {
        const pages = (request.params?.pages as number) ?? 5;
        const boards: Array<{
          code: string;
          name: string;
          changeRate: number;
          changeRate5d: number;
          isNoise: boolean;
        }> = [];

        for (let pn = 1; pn <= pages; pn++) {
          const d = await emFetch(
            `/api/qt/clist/get?pn=${pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f109&fs=m:90+t:3&fields=f12,f14,f3,f109`,
          );
          const diff = d?.data?.diff ?? [];
          if (!diff.length) break;
          for (const item of diff) {
            boards.push({
              code: item.f12,
              name: item.f14,
              changeRate: Number(item.f3) || 0,
              changeRate5d: Number(item.f109) || 0,
              isNoise: isNoiseBoard(item.f14 ?? ""),
            });
          }
          if (pn < pages) await new Promise((r) => setTimeout(r, 300));
        }

        data = { total: boards.length, boards };
        break;
      }

      case "market.cn_board_stocks": {
        const bkCode = (request.params?.boardCode as string) ?? "";
        if (!bkCode) throw new Error("market.cn_board_stocks requires params.boardCode");
        const limit = (request.params?.limit as number) ?? 50;

        const d = await emFetch(
          `/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f109` +
            `&fs=b:${bkCode}+f:!60&fields=f12,f13,f14,f3,f6,f109,f62`,
        );
        const diff = d?.data?.diff ?? [];

        const stocks = diff.map((s: Record<string, unknown>) => ({
          code: s.f12,
          market: s.f13 === 1 ? "SH" : "SZ",
          futuCode: `${s.f13 === 1 ? "SH" : "SZ"}.${s.f12}`,
          name: s.f14,
          changeRate: Number(s.f3) || 0,
          changeRate5d: Number(s.f109) || 0,
          turnover: Number(s.f6) || 0,
          mainFlow: Number(s.f62) || 0,
        }));

        data = { boardCode: bkCode, total: stocks.length, stocks };
        break;
      }

      case "market.cn_board_kline": {
        const bkCode = (request.params?.boardCode as string) ?? "";
        if (!bkCode) throw new Error("market.cn_board_kline requires params.boardCode");
        const weeks = (request.params?.weeks as number) ?? 4;

        const end = new Date();
        const start = new Date(end.getTime() - (weeks + 1) * 7 * 24 * 60 * 60 * 1000);
        const beg = start.toISOString().slice(0, 10).replace(/-/g, "");
        const endStr = end.toISOString().slice(0, 10).replace(/-/g, "");

        const d = await emFetchHis(
          `/api/qt/stock/kline/get?secid=90.${bkCode}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59&klt=101&fqt=1&beg=${beg}&end=${endStr}&lmt=200`,
        );

        const klines = (d?.data?.klines ?? []).map((line: string) => {
          const f = line.split(",");
          return {
            time: f[0],
            open: Number(f[1]),
            close: Number(f[2]),
            high: Number(f[3]),
            low: Number(f[4]),
            volume: Number(f[5]),
            turnover: Number(f[6]),
            amplitude: Number(f[7]),
            changeRate: Number(f[8]),
          };
        });

        data = { boardCode: bkCode, klines };
        break;
      }

      default:
        throw new Error(
          `EastMoneyAdapter: unsupported operation "${request.operation}". ` +
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
        confidence: 0.9,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}
