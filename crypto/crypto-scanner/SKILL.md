---
name: crypto-scanner
description: 加密市场热点赛道扫描 + 候选筛选器。基于 CoinGecko Demo API（全局数据/赛道涨跌/币种行情）+ Tavily 叙事验证 + Hyperliquid 链上拥挤度 + event-calendar 宏观锚定，4 阶段扫出当前热点赛道 Top 5 及赛道内评分候选，输出结构化清单并交接 crypto-analyzer 做深度分析。触发场景：(1) "加密市场最近什么热点 / 哪个赛道在涨 / 链上资金在炒什么"；(2) "帮我找下一个加密热点 / 赛道轮动到哪了 / BTC 主导率高吗"；(3) "山寨季开了吗 / DeFi / RWA / AI 链上 哪个方向强"；(4) "扫一下加密市场，给我候选清单"。不适用于：单币深度分析（用 crypto-analyzer）、A 股/美股板块扫描（用 market-scanner）、Hyperliquid 加密原生 perp 分析。
---

# crypto-scanner

4 阶段扫描加密市场热点赛道，输出候选清单并交接 crypto-analyzer。

## 环境准备

```bash
BASE="https://api.coingecko.com/api/v3"

# ⚠️ DNS 绕过（部分网络环境本地 DNS 会将 api.coingecko.com 解析到错误 IP）
# 用 Google DNS 获取真实 IP，固定写入每条 curl 命令
# 真实 IP：104.20.41.132（或 172.66.172.219）
# 每条 curl 加：--resolve "api.coingecko.com:443:104.20.41.132"

# 有 Demo key：每条 curl 加 -H "x-cg-demo-api-key: $COINGECKO_DEMO_KEY"（100次/分）
# 无 key：省略 header，降级到公共端点（~3次/分，需在请求间加间隔）
```

## 执行前必读（收到任务后第一步）

```bash
Read references/report-template.md   # 完整报告模板
Read references/sector-mapping.md    # 赛道 ID 与分类映射
Read references/data-sources.md      # CoinGecko API 速查
```

## 阶段 0：宏观锚定

并行拉取全局数据与宏观事件：

```bash
# 全局市场结构（BTC 主导率、总市值、山寨季指标）
curl "$BASE/global" $HEADER

# BTC 30 日历史（与 Nasdaq 相关性参考）
curl "$BASE/coins/bitcoin/market_chart?vs_currency=usd&days=30" $HEADER
```

curl 批次完成后，主对话直接 `Skill(skill="event-calendar")` 顺序执行（region=US，from=今天，to=今天+14，返回 FOMC/CPI/非农结构化事件列表）。Skill 返回实际数据 → 继续阶段 1；失败 → 跳过宏观锚定，在报告中标注。

**BTC 主导率判断规则**：

| 主导率 | 解读 | 扫描策略 |
|---|---|---|
| > 60% | 资金聚集 BTC | 只关注 BTC/ETH 级别，降低山寨建议权重 |
| 50-60% | 过渡期 | 主流山寨（SOL/BNB/XRP）开始轮动 |
| < 50% | 山寨季启动 | 全赛道扫描，寻找轮动机会 |

## 阶段 1：赛道热度扫描

**信号 A：CoinGecko 赛道涨跌榜**

```bash
curl "$BASE/coins/categories?order=market_cap_change_24h_desc" $HEADER \
  | jq '[.[:30] | .[] | {id, name, market_cap_change_24h}]'
```

取 24h 市值变化 Top 10 赛道。

**信号 B：CoinGecko 热搜榜**（与 A 并行）

```bash
curl "https://api.coingecko.com/api/v3/search/trending" \
  --resolve "api.coingecko.com:443:104.20.41.132" \
  -H "x-cg-demo-api-key: $COINGECKO_DEMO_KEY"
```

响应包含三组热搜：
- `coins[]` → 热搜币种（附 24h 涨跌、市值排名）
- `categories[]` → 热搜赛道（附 24h 市值变化%）
- `nfts[]` → 热搜 NFT（可忽略）

**信号 B 使用方式**：
- 热搜赛道（categories）与信号 A 取交集 → 双重确认热度
- 热搜币种（coins）直接加分：出现在热搜榜 → 阶段 2 打分 +1（独立加分项）
- 热搜但 24h 涨幅 > 50% → 标"已透支"，降权

**信号 C：Tavily 叙事验证**（对 A+B 确认赛道做补充）

对进入候选的赛道搜索（days=7）：
- `crypto {sector_name} sector rally narrative week 2026`
- `加密货币 {赛道中文名} 热点 本周`

命中 rally/热点/outperform/主线 等正向词 → +1；命中 crash/rug/fraud → 直接出局

**交集规则**：
- A + B（categories）双命中 → 进阶段 2（强信号）
- A + C 双命中，无 B → 进阶段 2（中等信号）
- 仅 A → 候补池；仅 B/C → 对应候补池

## 阶段 2：赛道内候选筛选

对阶段 1 确认赛道逐一拉取币种行情：

```bash
curl "$BASE/coins/markets?vs_currency=usd&category={CATEGORY_ID}&order=volume_desc&per_page=30&sparkline=true&price_change_percentage=24h,7d" $HEADER
```

**硬过滤（质量门槛）**：
- 市值 ≥ 100M USD
- 24h 成交量 ≥ 5M USD
- 上线不足 30 天跳过

**软打分向量**（总分 ≥ 3 进候选，每赛道取 Top 3）：

| 因子 | 口径 | 打分 |
|---|---|---|
| 7日动量 | price_change_percentage_7d | <-10% → +2（超跌补涨）/ 0-30% → +1 / >50% → -1（透支）|
| 成交量异常 | 24h量 ÷ 7日均量 | >2x → +2 / 1-2x → +1 |
| 链上拥挤度 | Hyperliquid fundingAprNow（有镜像才查）| <+20% → +1 / >+100% → -2 |
| 赛道相对动量 | 币7日涨幅 - 赛道均值 | <-10pp → +2（滞涨）/ +30pp以上 → -1 |
| **CoinGecko 热搜** | 出现在 /search/trending coins 列表 | +1（若同时 24h > 50% 则不加）|

Hyperliquid 查询（有 perps 镜像的币）：
```bash
HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] || HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/../core/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] && "$HL" <TICKER> --json 2>/dev/null || echo "无链上镜像 / hyperliquid-perps 未安装"
```

## 阶段 3：跨市场背离信号

BTC 数据来自阶段 0 的 market_chart，Nasdaq 趋势从 Tavily 搜索获取。

| 背离模式 | 信号含义 |
|---|---|
| Nasdaq ↑ BTC ↓ | 加密偏弱，谨慎追涨 |
| Nasdaq ↓ BTC ↑ | 脱钩信号（稳定币/黄金叙事驱动）|
| BTC ↑ 山寨不动 | BTC 独享，山寨资金观望 |
| BTC ↑ 山寨普涨 | 山寨季启动，赛道轮动激活 |

## ⚠️ 输出即止规则

四个阶段数据全部在 context 后，**立即**以报告模板对应标题开头写正文。禁止 `echo` / `python print` 等"准备输出"工具调用。

## 输出结构

（报告模板、赛道映射、数据源 API 已在执行前必读块加载）

## 协作关系

```
event-calendar    ──→ crypto-scanner（阶段 0 宏观输入）
hyperliquid-perps ──→ crypto-scanner（阶段 2 链上拥挤度）
crypto-scanner    ──→ crypto-analyzer（候选交接）
```

扫描结束后，将候选清单交接给 crypto-analyzer：

```
→ 调用：crypto-analyzer 分析 <COIN1>, <COIN2>, ...
```
