# crypto-scanner 数据源速查

## 数据源优先级

| 阶段 | 数据 | 优先来源 | Fallback |
|---|---|---|---|
| 0 | 全局市场结构 | CryptoCompare `mktcapfull` | CoinGecko `/global` DNS 绕过 |
| 0 | BTC 30日历史 | CryptoCompare `histoday` | CoinGecko `market_chart` |
| 1-2 | 赛道热度 / 热搜 / 赛道内筛选 | CoinGecko | — |

---

## CryptoCompare API（阶段 0 优先）

**Base URL：** `https://min-api.cryptocompare.com`  
**认证：** 无需 key（免费 tier）  
**限速：** 100 req/min，100K req/month  
**直连：** 国内可直连

### 端点

| 端点 | 用途 | 阶段 |
|---|---|---|
| `/data/top/mktcapfull?limit=100&tsym=USD` | BTC/ETH 主导率、总市值（Top 100 汇总）| 0 |
| `/data/v2/histoday?fsym=BTC&tsym=USD&limit=30` | BTC 30日 OHLCV（跨市场分析）| 0, 3 |

**注意：** `active_cryptos` 字段不可用，标注"Top 100 采样"代替。24h 总市值变化% 不可直接获取，用 BTC 的 `CHANGEPCT24HOUR` 代替。

---

## CoinGecko Demo API（阶段 1 / 2 及阶段 0 fallback）

**Base URL：** `https://api.coingecko.com/api/v3`  
**Demo Key Header：** `x-cg-demo-api-key: $COINGECKO_DEMO_KEY`  
**限速：** Demo key 100次/分钟；无 key ~3次/分钟  
**直连：** 国内需 DNS 绕过 `--resolve "api.coingecko.com:443:104.20.41.132"`

### 扫描用端点

| 端点 | 用途 | 阶段 |
|---|---|---|
| `/global` | BTC 主导率 / 总市值 / 山寨季指标（阶段 0 fallback）| 0 |
| `/coins/bitcoin/market_chart?vs_currency=usd&days=30` | BTC 30日历史（阶段 0 fallback）| 0, 3 |
| `/coins/categories?order=market_cap_change_24h_desc` | 赛道涨跌榜（按24h市值变化排序）| 1 信号A |
| `/search/trending` | 热搜币种 + 热搜赛道（社区/平台搜索热度）| 1 信号B |
| `/coins/markets?vs_currency=usd&category={id}&order=volume_desc&per_page=30&sparkline=true&price_change_percentage=24h,7d` | 赛道内币种行情+7日K线 | 2 |

### `/search/trending` 响应结构

```json
{
  "coins": [
    { "item": { "symbol": "HYPE", "name": "Hyperliquid", "market_cap_rank": 11,
                "data": { "price_change_percentage_24h": { "usd": 1.0 } } } }
  ],
  "categories": [
    { "name": "Decentralized Identifier (DID)",
      "data": { "market_cap_change_percentage_24h": { "usd": 4.0 } } }
  ],
  "nfts": [...]
}
```

**注意**：`/news` 和 `/articles` 端点需要 Pro key，Demo key 返回 error，用 Tavily 替代。

### CoinGecko `/global` 关键字段（fallback 时使用）
```
data.bitcoin_dominance_percentage   BTC 主导率
data.total_market_cap.usd           总市值
data.market_cap_change_percentage_24h_usd  24h总市值变化%
data.active_cryptocurrencies        活跃币种数
```

### `/coins/categories` 字段
```
id                      赛道 CoinGecko ID（用于 /coins/markets 查询）
name                    赛道名称
market_cap_change_24h   24h市值变化%（用于排序热度）
```

### `/coins/markets` 字段
```
id / symbol / name
current_price
market_cap
total_volume                         24h成交量
price_change_percentage_24h_in_currency
price_change_percentage_7d_in_currency
sparkline_in_7d.price[]              7日价格数组（计算均量用）
```

## Hyperliquid 链上数据

脚本：
```bash
HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] || HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/../core/hyperliquid-perps/scripts/lookup.sh"
"$HL" <TICKER> --json
```

仅用于阶段 2 打分中的"链上拥挤度"因子。无镜像时直接跳过该因子（不扣分）。

## Tavily 搜索

用于阶段 1 叙事验证（信号 B）和阶段 3 Nasdaq 趋势获取。  
搜索词模板见 SKILL.md 阶段 1 说明。

## event-calendar skill

在阶段 0 调用，获取未来 14 天 FOMC/CPI/非农等宏观事件。
