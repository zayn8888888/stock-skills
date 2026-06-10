# crypto-analyzer 数据源速查

## CryptoCompare API（维度 1 / 2 优先使用）

**Base URL：** `https://min-api.cryptocompare.com`  
**认证：** 无需 key（免费 tier）  
**限速：** 100 req/min，100K req/month  
**直连：** 国内可直连，无需代理

### 常用端点

| 端点 | 用途 | 维度 |
|---|---|---|
| `/data/pricemultifull?fsyms={SYMBOL}&tsyms=USD` | 当前行情快照（价格/市值/成交量/24h 涨跌）| 1 |
| `/data/v2/histoday?fsym={SYMBOL}&tsym=USD&limit=90` | 90日 OHLCV 历史（计算 RSI/MA/7d/30d 涨跌）| 2 |

### `pricemultifull` 关键响应字段（`RAW.{SYMBOL}.USD`）

```
PRICE                当前价格
MKTCAP               市值
TOTALVOLUME24HTO     24h 成交量（USD）
CHANGEPCT24HOUR      24h 涨跌幅%
HIGH24HOUR           24h 最高
LOW24HOUR            24h 最低
SUPPLY               流通量
```

**注意：** ATH / FDV / 7d / 30d 涨跌幅需从 histoday 计算，或使用 CoinGecko fallback。

### `histoday` 响应结构（`Data.Data[]`）

```json
{
  "Data": {
    "Data": [
      {"time": 1234567890, "open": 44000, "high": 46000, "low": 43000, "close": 45000, "volumeto": 1234567}
    ]
  }
}
```

---

## CoinGecko Demo API（维度 4 / 5 / ticker search）

**Base URL：** `https://api.coingecko.com/api/v3`  
**Demo Key Header：** `x-cg-demo-api-key: $COINGECKO_DEMO_KEY`  
**限速：** Demo key 100次/分钟；无 key（公共端点）~3次/分钟  
**直连：** 国内需 DNS 绕过 `--resolve "api.coingecko.com:443:104.20.41.132"`

### 常用端点

| 端点 | 用途 | 维度 |
|---|---|---|
| `/search?query={ticker}` | 解析 ticker → CoinGecko ID + symbol | 前置 |
| `/coins/{id}?localization=false&tickers=false&community_data=true` | 行情快照（维度 1 fallback）+ 赛道分类 | 1 fallback, 4 |
| `/coins/{id}/market_chart?vs_currency=usd&days=90` | 90日历史价格（维度 2 fallback）| 2 fallback |
| `/coins/markets?vs_currency=usd&category={id}&order=market_cap_desc&per_page=10&price_change_percentage=7d,30d` | 同赛道对比 | 5 |

### 关键响应字段

**`/coins/{id}` 主要字段：**
```
market_data.current_price.usd
market_data.market_cap.usd
market_data.fully_diluted_valuation.usd
market_data.total_volume.usd
market_data.ath.usd
market_data.ath_change_percentage.usd
market_data.price_change_percentage_24h
market_data.price_change_percentage_7d_in_currency.usd
market_data.price_change_percentage_30d_in_currency.usd
market_data.market_cap_rank
market_data.circulating_supply
market_data.total_supply
categories[]
```

**`/coins/{id}/market_chart` 响应结构：**
```json
{
  "prices": [[timestamp_ms, price], ...],
  "market_caps": [[timestamp_ms, market_cap], ...],
  "total_volumes": [[timestamp_ms, volume], ...]
}
```

## Hyperliquid 链上数据

脚本：
```bash
HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] || HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/../core/hyperliquid-perps/scripts/lookup.sh"
"$HL" <TICKER> --json
```

**关键字段：**
```
fundingAprNow     年化资金费率（正值=多头支付空头）
openInterest      持仓量（USD）
markPrice         链上标记价
spotPrice         现货价（CoinGecko）
premium           链上 vs 现货溢价%
volume24h         24h链上成交量
```

**覆盖范围：** 主流大币（BTC/ETH/SOL/BNB/AVAX/DOGE 等）及部分链上原生资产，多数小币无镜像。

## Tavily 搜索

用于维度 4（叙事）、维度 6（新闻）、维度 7（链上事件）。构建方式见 SKILL.md 各维度示例。

## event-calendar skill

调用方式：在 skill 内部调用 event-calendar，参数 region=US，取未来 30 天 FOMC/CPI/非农事件。
