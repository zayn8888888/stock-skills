# crypto-analyzer 数据源速查

## CoinGecko Demo API

**Base URL：** `https://api.coingecko.com/api/v3`  
**Demo Key Header：** `x-cg-demo-api-key: $COINGECKO_DEMO_KEY`  
**限速：** Demo key 100次/分钟；无 key（公共端点）~3次/分钟

### 常用端点

| 端点 | 用途 | 维度 |
|---|---|---|
| `/search?query={ticker}` | 解析 ticker → CoinGecko ID | 前置 |
| `/coins/{id}?localization=false&tickers=false&community_data=true` | 行情快照 + 基本面 + 赛道分类 | 1, 4 |
| `/coins/{id}/market_chart?vs_currency=usd&days=90` | 90日历史价格（含成交量）| 2 |
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

脚本：`~/.claude/skills/hyperliquid-perps/scripts/lookup.sh <TICKER> --json`

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
