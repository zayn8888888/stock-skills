# Data Source Architecture v2

## Problem

Current data source system is flat and disconnected:
- Adapter registry (runtime) ≠ DB table (persisted) — two separate systems
- No routing logic — agent sees raw adapter names like `futu_quote_snapshot`
- No market-aware routing — can't say "HK quotes come from Futu, US from Alpha Vantage"
- No fallback — if Futu is down, the tool call just fails
- Agent YAML `data_sources` are dead metadata — never used for routing
- 12+ declared data sources, only 2 implemented
- Observation store drops source/value/observedAt on insert

## Design

### Two Dimensions

```
             Capabilities (vertical)
             quote  kline  depth  news  sentiment  capital  options
Providers   ┌──────┬──────┬──────┬─────┬──────────┬────────┬────────┐
(horiz.)    │      │      │      │     │          │        │        │
Futu        │  HK  │  HK  │  HK  │     │          │        │        │
            │  US  │  US  │      │     │          │        │        │
            ├──────┼──────┼──────┼─────┼──────────┼────────┼────────┤
EastMoney   │  CN  │  CN  │      │     │          │  CN    │        │
            ├──────┼──────┼──────┼─────┼──────────┼────────┼────────┤
CoinGecko   │CRYPTO│CRYPTO│      │     │          │        │        │
            ├──────┼──────┼──────┼─────┼──────────┼────────┼────────┤
Tavily      │      │      │      │ ALL │          │        │        │
            ├──────┼──────┼──────┼─────┼──────────┼────────┼────────┤
Hyperliquid │      │      │      │     │          │        │CRYPTO  │
            └──────┴──────┴──────┴─────┴──────────┴────────┴────────┘
```

Each cell = a **SourceRoute**: provider + capability + market, with priority and status.

### Database Schema

```sql
-- Providers: the horizontal axis
CREATE TABLE data_providers (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,      -- "futu", "tavily", "coingecko"
  display_name  TEXT NOT NULL,             -- "Futu OpenD", "Tavily Search"
  type          TEXT NOT NULL,             -- "api" | "sdk" | "scraper" | "mock"
  connection    TEXT,                      -- JSON: { host, port, apiKey, ... }
  enabled       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'unknown',
  last_check_at TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Capabilities: the vertical axis
CREATE TABLE data_capabilities (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,        -- "quote.snapshot", "kline", "news.search"
  category    TEXT NOT NULL,               -- "quote", "kline", "depth", "news", ...
  display_name TEXT NOT NULL,              -- "实时报价", "K线数据", "新闻搜索"
  description TEXT,
  created_at  TEXT NOT NULL
);

-- Routes: the matrix cells (provider × capability × market)
CREATE TABLE data_source_routes (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES data_providers(id),
  capability_id TEXT NOT NULL REFERENCES data_capabilities(id),
  markets       TEXT NOT NULL,             -- JSON: ["HK", "US"] or ["*"] for all
  priority      INTEGER NOT NULL DEFAULT 0, -- higher = preferred
  enabled       INTEGER NOT NULL DEFAULT 1,
  config        TEXT,                      -- JSON: per-route overrides
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(provider_id, capability_id)
);
```

### Runtime Architecture

```
                    ┌─────────────────┐
                    │   SourceRouter   │
                    │                 │
                    │ resolve(cap,    │
                    │   market) →     │
                    │   [route, ...]  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  Route 1 │  │  Route 2 │  │  Route 3 │
        │  (primary)│  │(fallback)│  │(fallback)│
        │ ProviderA│  │ ProviderB│  │ ProviderC│
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        adapter.fetch()  adapter.fetch()  adapter.fetch()
        (success?)       (if #1 fails)   (if #2 fails)
```

### Tool Naming

**Before**: `futu_quote_snapshot` (leaks implementation detail)
**After**: `get_quote_snapshot` (capability-based, router picks provider)

Agent sees clean capability names. Router handles provider selection, fallback, and market routing transparently.

### Management Page

Matrix view showing providers × capabilities:

```
┌─────────────────────────────────────────────────────────────┐
│ 数据源管理                                    [+ 添加供应商] │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│          │ 实时报价  │ K线数据  │ 新闻搜索 │ 资金流向         │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Futu     │ HK,US ●  │ HK,US ●  │    —     │    —            │
│ OpenD    │ P1  4ms  │ P1 12ms │          │                 │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Tavily   │    —     │    —    │ ALL ●    │    —            │
│          │          │         │ P1 200ms │                 │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ CoinGecko│ CRYPTO ● │ CRYPTO ●│    —     │    —            │
│          │ P2 500ms │ P2 1s   │          │                 │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Hyperliquid│  —      │    —    │    —     │ CRYPTO ●        │
│          │          │         │          │ P1 100ms        │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘

● = enabled,  — = not configured
P1/P2 = priority,  4ms = last latency
```

Click a cell → configure: enable/disable, priority, markets, view health history.
Click a provider row → edit connection config, view all routes.
