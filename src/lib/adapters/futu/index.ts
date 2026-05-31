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
import { BollingerBands, MACD, RSI, SMA } from "technicalindicators";
import type {
  AdapterRequest,
  DataSourceAdapter,
  Observation,
  RawResponse,
  SourceHealth,
} from "../base";
import { FutuClient, KLType, Market, SubType, klTypeToSubType } from "./client";

// ──────────────────── Market mapping ────────────────────────────────

/** Format Date to "yyyy-MM-dd HH:mm:ss" for Futu API */
function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const MARKET_MAP: Record<string, number> = {
  HK: Market.HK, // 1
  US: Market.US, // 11
  NASDAQ: Market.US, // 11
  NYSE: Market.US, // 11
  SSE: Market.CN_SH, // 21
  SH: Market.CN_SH, // 21
  SZ: Market.CN_SZ, // 22
  SG: Market.SG, // 31
  JP: Market.JP, // 41
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

    // Reset initialized flag when connection drops so re-handshake happens
    this.client.setOnDisconnect(() => {
      this.initialized = false;
    });
  }

  // ── DataSourceAdapter interface ─────────────────────────────────

  capabilities(): string[] {
    return [
      "quote.snapshot",
      "quote.kline",
      "quote.depth",
      "quote.history_kline",
      "capital.flow",
      "capital.distribution",
      "technical.indicators",
      "company.info",
      "financial.statements",
      "valuation.detail",
      "shareholders.overview",
      "corporate.dividends",
      "options.chain",
      "plate.list",
      "plate.stocks",
    ];
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
        // getSecuritySnapshot — 无需订阅，返回完整快照数据
        const snapshots = await this.client.getSecuritySnapshot([{ market, code: ticker }]);
        const snap = snapshots[0];
        if (snap) {
          // Flatten: merge basic + equityExData into one object
          const basic = snap.basic ?? snap;
          const equity = snap.equityExData ?? {};
          data = {
            ...basic,
            // Map equity fields to friendly names
            pe: equity.peRate ?? equity.peTTMRate,
            pb: equity.pbRate,
            marketCap: equity.issuedMarketVal,
            earningsPerShare: equity.earningsPershare,
            netAssetPerShare: equity.netAssetPershare,
            dividendTTM: equity.dividendTTM,
            dividendRatioTTM: equity.dividendRatioTTM,
          };
        } else {
          data = null;
        }
        break;
      }

      case "quote.kline": {
        const num = (request.params?.num as number) ?? 30;
        const klType = (request.params?.klType as number) ?? KLType.Day;
        const subType = klTypeToSubType(klType);
        await this.client.subscribe([{ market, code: ticker }], [subType]);
        const bars = await this.client.getKline(market, ticker, klType, num);
        data = { ticker, timeframe: "1d", bars };
        break;
      }

      case "quote.depth": {
        const levels = (request.params?.levels as number) ?? 10;
        await this.client.subscribe([{ market, code: ticker }], [SubType.OrderBook]);
        const book = await this.client.getOrderBook(market, ticker, levels);
        data = { ticker, ...book };
        break;
      }

      case "quote.history_kline": {
        const klType = (request.params?.klType as number) ?? KLType.Day;
        const beginTime = (request.params?.beginTime as string) ?? "";
        const endTime = (request.params?.endTime as string) ?? "";
        const maxCount = (request.params?.maxCount as number) ?? 1000;
        const bars = await this.client.requestHistoryKline(
          market,
          ticker,
          klType,
          beginTime,
          endTime,
          maxCount,
        );
        data = { ticker, bars };
        break;
      }

      case "capital.flow": {
        const periodType = (request.params?.periodType as number) ?? 2; // DAY
        // Futu requires beginTime/endTime in "yyyy-MM-dd HH:mm:ss" format
        const now = new Date();
        const endTime = formatDate(now);
        const beginTime = formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        const flow = await this.client.getCapitalFlow(
          market,
          ticker,
          periodType,
          beginTime,
          endTime,
        );
        data = { ticker, ...flow };
        break;
      }

      case "capital.distribution": {
        const dist = await this.client.getCapitalDistribution(market, ticker);
        data = { ticker, ...dist };
        break;
      }

      case "technical.indicators": {
        // Fetch recent K-line data — 60 calendar days (~42 trading days) covers all indicators
        const now = new Date();
        const beginDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const endDate = now.toISOString().slice(0, 10);
        const bars = await this.client.requestHistoryKline(
          market,
          ticker,
          KLType.Day,
          beginDate,
          endDate,
          60,
        );

        const closes = bars
          .map((b: any) => b.closePrice ?? b.close ?? 0)
          .filter((v: number) => v > 0);

        if (closes.length < 5) {
          data = { ticker, error: "Insufficient K-line data for indicators" };
          break;
        }

        // Calculate indicators
        const sma5 = SMA.calculate({ period: 5, values: closes });
        const sma10 = SMA.calculate({ period: 10, values: closes });
        const sma20 = SMA.calculate({ period: 20, values: closes });
        const rsi14 = RSI.calculate({ period: 14, values: closes });
        const macd = MACD.calculate({
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
          values: closes,
        });
        const boll = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });

        const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];
        const macdLast = last(macd);
        const bollLast = last(boll);

        data = {
          ticker,
          indicators: {
            sma: { sma5: last(sma5), sma10: last(sma10), sma20: last(sma20) },
            rsi: { period: 14, value: last(rsi14) },
            macd: macdLast
              ? {
                  macd: macdLast.MACD,
                  signal: macdLast.signal,
                  histogram: macdLast.histogram,
                }
              : null,
            boll: bollLast
              ? {
                  upper: bollLast.upper,
                  middle: bollLast.middle,
                  lower: bollLast.lower,
                }
              : null,
          },
          // Return the K-line dates for reference
          dataPoints: closes.length,
          lastClose: last(closes),
        };
        break;
      }

      case "company.info": {
        const snapshots = await this.client.getSecuritySnapshot([{ market, code: ticker }]);
        const snap = snapshots[0];
        const basic = snap?.basic ?? snap;
        const equity = snap?.equityExData ?? {};
        data = {
          ticker,
          snapshot: basic
            ? {
                name: basic.name,
                curPrice: basic.curPrice,
                highPrice: basic.highPrice,
                lowPrice: basic.lowPrice,
                openPrice: basic.openPrice,
                lastClosePrice: basic.lastClosePrice,
                volume: basic.volume,
                turnover: basic.turnover,
                turnoverRate: basic.turnoverRate,
                amplitude: basic.amplitude,
                updateTime: basic.updateTime,
                isSuspended: basic.isSuspended,
                listTime: basic.listTime,
                lotSize: basic.lotSize,
              }
            : null,
          valuation: {
            pe: equity.peRate ?? equity.peTTMRate,
            pb: equity.pbRate,
            marketCap: equity.issuedMarketVal,
            earningsPerShare: equity.earningsPershare,
            netAssetPerShare: equity.netAssetPershare,
            dividendTTM: equity.dividendTTM,
            dividendRatioTTM: equity.dividendRatioTTM,
            totalShares: equity.issuedShares,
            outstandingShares: equity.outstandingShares,
          },
        };
        break;
      }

      case "financial.statements": {
        const stType = (request.params?.statementType as number) ?? 1;
        const finType = (request.params?.financialType as number) ?? 1;
        const num = (request.params?.num as number) ?? 8;
        const result = await this.client.getFinancialsStatements(
          market,
          ticker,
          stType,
          finType,
          num,
        );
        data = { ticker, ...result };
        break;
      }

      case "valuation.detail": {
        const valType = (request.params?.valuationType as number) ?? 1;
        const result = await this.client.getValuationDetail(market, ticker, valType);
        data = { ticker, ...result };
        break;
      }

      case "shareholders.overview": {
        const result = await this.client.getShareholdersOverview(market, ticker);
        data = { ticker, ...result };
        break;
      }

      case "corporate.dividends": {
        const result = await this.client.getCorporateActionsDividends(market, ticker);
        data = { ticker, ...result };
        break;
      }

      case "options.chain": {
        const type = (request.params?.type as number) ?? 0; // 0=全部
        const optionChain = await this.client.getOptionChain(market, ticker, type);
        data = { ticker, optionChain };
        break;
      }

      case "plate.list": {
        const plateSetType = (request.params?.plateSetType as number) ?? 3; // 3=Concept
        const plates = await this.client.getPlateSet(market, plateSetType);
        data = { market, plateSetType, plates };
        break;
      }

      case "plate.stocks": {
        const plateCode = (request.params?.plateCode as string) ?? "";
        if (!plateCode) throw new Error("plate.stocks requires params.plateCode");
        const stocks = await this.client.getPlateSecurity(market, plateCode);
        data = { plateCode, stocks };
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
