/**
 * Zod schemas for observation value payloads.
 *
 * Each category has a dedicated schema so the observation pipeline
 * can validate and type-narrow at ingestion time.
 */

import { z } from "zod";

// ──────────────────────────── quote ───────────────────────────────

export const quoteValueSchema = z.object({
  last_price: z.number(),
  change_pct: z.number(),
  volume: z.number(),
  turnover: z.number(),
  currency: z.string(),
});
export type QuoteValue = z.infer<typeof quoteValueSchema>;

// ──────────────────────────── kline ───────────────────────────────

export const klineBarSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const klineValueSchema = z.object({
  timeframe: z.string(), // "1d", "1h", "5m", etc.
  bars: z.array(klineBarSchema),
});
export type KlineValue = z.infer<typeof klineValueSchema>;

// ──────────────────────────── news ────────────────────────────────

export const newsItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  published_at: z.string(),
  source: z.string(),
});

export const newsValueSchema = z.object({
  items: z.array(newsItemSchema),
});
export type NewsValue = z.infer<typeof newsValueSchema>;

// ──────────────────────────── technical ───────────────────────────

export const technicalValueSchema = z.object({
  indicators: z.record(z.string(), z.number()),
  trend_summary: z.string(),
});
export type TechnicalValue = z.infer<typeof technicalValueSchema>;

// ──────────────────────────── fundamental ─────────────────────────

export const fundamentalValueSchema = z.object({
  market_cap: z.number().optional(),
  pe_ratio: z.number().optional(),
  eps: z.number().optional(),
  revenue: z.number().optional(),
  net_income: z.number().optional(),
  debt_to_equity: z.number().optional(),
  free_cash_flow: z.number().optional(),
  period: z.string(), // e.g. "Q1 FY2027"
  summary: z.string(),
});
export type FundamentalValue = z.infer<typeof fundamentalValueSchema>;

// ──────────────────────────── sentiment ───────────────────────────

export const sentimentValueSchema = z.object({
  score: z.number().min(-1).max(1), // -1 bearish, +1 bullish
  volume_mentions: z.number().optional(),
  top_topics: z.array(z.string()).optional(),
  summary: z.string(),
});
export type SentimentValue = z.infer<typeof sentimentValueSchema>;

// ──────────────────────────── funding (crypto) ────────────────────

export const fundingValueSchema = z.object({
  current_rate: z.number(),
  predicted_rate: z.number().optional(),
  next_funding_time: z.string(),
  open_interest: z.number().optional(),
});
export type FundingValue = z.infer<typeof fundingValueSchema>;

// ──────────────────────────── options ─────────────────────────────

export const optionsValueSchema = z.object({
  put_call_ratio: z.number().optional(),
  implied_volatility: z.number().optional(),
  max_pain: z.number().optional(),
  notable_strikes: z
    .array(
      z.object({
        strike: z.number(),
        type: z.enum(["call", "put"]),
        open_interest: z.number(),
        volume: z.number(),
      })
    )
    .optional(),
  summary: z.string(),
});
export type OptionsValue = z.infer<typeof optionsValueSchema>;

// ──────────────────────────── Schema Map ──────────────────────────

export const valueSchemasByCategory: Record<string, z.ZodTypeAny> = {
  quote: quoteValueSchema,
  kline: klineValueSchema,
  news: newsValueSchema,
  technical: technicalValueSchema,
  fundamental: fundamentalValueSchema,
  sentiment: sentimentValueSchema,
  funding: fundingValueSchema,
  options: optionsValueSchema,
};
