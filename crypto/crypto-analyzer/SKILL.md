---
name: crypto-analyzer
description: 加密资产七维度深度分析助手。基于 CoinGecko Demo API（行情/K线/赛道/基本面）+ Hyperliquid 链上永续镜像（funding rate / OI）+ Tavily 新闻 + event-calendar 前瞻事件，对单只加密资产输出结构化分析报告。触发场景：(1) 用户说"分析 SOL / BTC 怎么样 / 帮我看看 HYPE / ETH 值不值得买"；(2) 用户问"XX 为什么涨跌 / 链上 funding 怎样 / 赛道地位如何 / 有什么催化事件"；(3) 被 crypto-scanner 调用做候选深度分析；(4) 用户提到加密货币并想了解行情/技术/链上/叙事综合情况。不适用于：纯加密宏观研究（用 event-calendar）、Hyperliquid 加密原生 perp 交易分析、A 股/美股个股分析（用 stock-analyzer）。
---

# crypto-analyzer

对单只加密资产做七个维度的结构化分析，输出含行情、技术、链上、叙事、同类对比、新闻、事件日历的完整报告。

## 环境准备

```bash
BASE="https://api.coingecko.com/api/v3"
CG_KEY="${COINGECKO_DEMO_KEY:-}"  # 从 ~/.zshenv 读取

# ⚠️ DNS 绕过：部分网络环境本地 DNS 将 api.coingecko.com 解析到错误 IP
# 每条 curl 命令必须加：--resolve "api.coingecko.com:443:104.20.41.132"
# 有 Demo key：加 -H "x-cg-demo-api-key: $CG_KEY"（100次/分）
# 无 key：省略 header，降级到公共端点（~3次/分，请求间需间隔）
```

## 第一步：解析 CoinGecko ID

用户输入 ticker（如 `HYPE`、`SOL`），先解析成 CoinGecko ID：

```bash
curl "$BASE/search?query=HYPE" $HEADER \
  | jq '.coins[:5] | .[] | {id, symbol, name, market_cap_rank}'
```

取 `market_cap_rank` 最小的匹配项。若 symbol 与输入完全一致则优先采用。

## 执行前必读（收到任务后第一步）

```bash
Read references/report-template.md          # 完整报告模板
Read references/metrics-interpretation.md   # 指标含义解读
Read references/data-sources.md             # CoinGecko + Hyperliquid API 速查
```

## 七维度分析流程

每个维度独立拉取。**硬约束：失败必须显式标注"维度 X 数据不可用，原因：XX"，不允许静默跳过。**

### 维度 1：行情快照

```bash
curl "$BASE/coins/{id}?localization=false&tickers=false&community_data=true&developer_data=false" $HEADER
```

提取：当前价（USD）/ 市值 / FDV / 24h 成交量 / ATH 及距离% / 24h/7d/30d 涨跌幅 / 市值排名 / 流通量÷总量

### 维度 2：技术面

```bash
curl "$BASE/coins/{id}/market_chart?vs_currency=usd&days=90" $HEADER
```

用 Python 或 jq 内联计算：
- 14 日 RSI（>70 超买 / <30 超卖）
- 7 日均价 vs 30 日均价（判断金叉/死叉）
- 7 日最高/最低（支撑阻力参考）
- 90 日趋势描述（上升/下降/震荡区间）

### 维度 3：链上信号（Hyperliquid）

```bash
~/.claude/skills/hyperliquid-perps/scripts/lookup.sh <TICKER> --json 2>/dev/null
```

- 无镜像（多数小币）：标注"该币无 Hyperliquid 链上镜像"后跳过
- 有镜像：输出 fundingAprNow / OI / 链上价 vs CoinGecko 价差 / 24h 链上成交量

**拥挤度规则**：APR < +20% → 未拥挤 ✅ / +20~+100% → 多头建仓 ⚠️ / >+100% → 极度拥挤 🚨

**流动性闸门**：OI < 1M USD 或日成交 < 1M USD → 标注"链上信号参考意义有限"

### 维度 4：叙事定位

```bash
curl "$BASE/coins/{id}?localization=false" $HEADER | jq '{categories: .categories}'
```

并行 Tavily（days=30）：
- `{coin_name} narrative use case 2026`
- `{代币名称} 叙事 赛道 投资逻辑 2026`

输出：赛道归属 / 叙事强度（新兴/成熟/式微）/ 同赛道地位（龙头/跟随/差异化）

### 维度 5：同类对比

从维度 4 取 category_id，拉同赛道行情：

```bash
curl "$BASE/coins/markets?vs_currency=usd&category={category_id}&order=market_cap_desc&per_page=10&price_change_percentage=7d,30d" $HEADER
```

计算本币相对赛道均值的 7d/30d 超额收益，标注市值排名。

### 维度 6：近期新闻

并行三条 Tavily：
1. `{coin_name} news latest week` topic=news days=7
2. `{代币名} 最新消息 动态` topic=news days=7
3. `{coin_name} partnership upgrade tokenomics 2026` days=30

输出：关键事件摘要 / 情绪倾向（正面/负面/中性）

### 维度 7：前瞻事件日历

1. 调用 `event-calendar skill`（region=US, from=今天, to=今天+30）→ 取 FOMC/CPI/非农
2. Tavily（days=90）：`{coin_name} upgrade unlock airdrop event schedule 2026`

关注：代币解锁日期 / 协议重大升级 / ETF 申请进展 / 监管事件

## 输出规范

- 价格用 USD 后缀，市值用 B/M 简写，不用 $ 符号（防 KaTeX 冲突）
- 所有 API 数据标注拉取时间（UTC）

（报告模板、指标解读、数据源 API 已在执行前必读块加载）

## 协作关系

```
crypto-scanner ──→ crypto-analyzer（候选交接）
crypto-analyzer ──→ trading-debate（可选决策层）
event-calendar  ──→ 维度 7
hyperliquid-perps → 维度 3
```
