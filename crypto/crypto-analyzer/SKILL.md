---
name: crypto-analyzer
description: 加密资产七维度深度分析助手。基于 CoinGecko Demo API（行情/K线/赛道/基本面）+ Hyperliquid 链上永续镜像（funding rate / OI）+ Tavily 新闻 + event-calendar 前瞻事件，对单只加密资产输出结构化分析报告。触发场景：(1) 用户说"分析 SOL / BTC 怎么样 / 帮我看看 HYPE / ETH 值不值得买"；(2) 用户问"XX 为什么涨跌 / 链上 funding 怎样 / 赛道地位如何 / 有什么催化事件"；(3) 被 crypto-scanner 调用做候选深度分析；(4) 用户提到加密货币并想了解行情/技术/链上/叙事综合情况。不适用于：纯加密宏观研究（用 event-calendar）、Hyperliquid 加密原生 perp 交易分析、A 股/美股个股分析（用 stock-analyzer）。
---

# crypto-analyzer

对单只加密资产做七个维度的结构化分析，输出含行情、技术、链上、叙事、同类对比、新闻、事件日历的完整报告。

## 环境准备

```bash
BASE="https://api.coingecko.com/api/v3"
CC="https://min-api.cryptocompare.com"  # 免费直连，无需 key，100 req/min

# ⚠️ CoinGecko DNS 绕过：部分网络环境本地 DNS 将 api.coingecko.com 解析到错误 IP
# 每条 CoinGecko curl 命令必须加：--resolve "api.coingecko.com:443:104.20.41.132"
# 有 Demo key：加 -H "x-cg-demo-api-key: $COINGECKO_DEMO_KEY"（100次/分）
# 无 key：省略 header，降级到公共端点（~3次/分，请求间需间隔）
# CryptoCompare 优先：维度 1/2 用 $CC，无需 key，直连稳定
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

### 维度 0：加密宏观背景（**单独执行，不与其他维度并行**）

若本会话 context 中已有 `crypto-macro` 输出（crypto-scanner 可能已调用），直接沿用，跳过本维度。否则：

```
Skill(skill="crypto-macro")
```

输出背景小结后**立即**继续下方维度 1-7，不停等用户确认。

---

### 维度 1：行情快照

```bash
# CryptoCompare（优先，用 step 1 解析出的 SYMBOL 大写，如 SOL / BTC）
curl -sf "$CC/data/pricemultifull?fsyms={SYMBOL}&tsyms=USD" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)['RAW']['{SYMBOL}']['USD']
print('price_usd:', d.get('PRICE'))
print('mktcap:', d.get('MKTCAP'))
print('volume_24h:', d.get('TOTALVOLUME24HTO'))
print('change_24h_pct:', d.get('CHANGEPCT24HOUR'))
print('high_24h:', d.get('HIGH24HOUR'))
print('low_24h:', d.get('LOW24HOUR'))
print('supply:', d.get('SUPPLY'))
print('注意: ATH/FDV/7d/30d 涨跌幅 → 见维度 2 histoday 计算结果')
" 2>/dev/null || \
curl -sf "$BASE/coins/{id}?localization=false&tickers=false&community_data=true&developer_data=false" \
  --resolve "api.coingecko.com:443:104.20.41.132" $HEADER
```

提取：当前价（USD）/ 市值 / 24h 成交量 / 24h 涨跌幅（CryptoCompare）或 ATH/FDV/7d/30d（CoinGecko fallback）；7d/30d 涨跌幅由维度 2 histoday 数据计算补充

### 维度 2：技术面

```bash
# CryptoCompare histoday（优先）→ CoinGecko market_chart fallback
curl -sf "$CC/data/v2/histoday?fsym={SYMBOL}&tsym=USD&limit=90" 2>/dev/null || \
curl -sf "$BASE/coins/{id}/market_chart?vs_currency=usd&days=90" \
  --resolve "api.coingecko.com:443:104.20.41.132" $HEADER
```

用以下 Python 片段内联计算（根据数据源选择对应解析逻辑）：

```python
import json, statistics

resp = json.loads("""<API 响应>""")

# CryptoCompare histoday 格式
if "Data" in resp and "Data" in resp.get("Data", {}):
    bars = resp["Data"]["Data"]
    prices = [b["close"] for b in bars]
    week_high = max(b["high"] for b in bars[-7:])
    week_low  = min(b["low"]  for b in bars[-7:])
else:
    # CoinGecko market_chart fallback 格式
    bars = None
    prices = [p[1] for p in resp["prices"]]
    week_high = max(p[1] for p in resp["prices"][-7:])
    week_low  = min(p[1] for p in resp["prices"][-7:])

# 14 日 RSI
def rsi(series, n=14):
    deltas = [series[i+1] - series[i] for i in range(len(series)-1)]
    gains = [max(d, 0) for d in deltas[-n:]]
    losses = [abs(min(d, 0)) for d in deltas[-n:]]
    avg_g = sum(gains) / n
    avg_l = sum(losses) / n
    if avg_l == 0:
        return 100
    rs = avg_g / avg_l
    return round(100 - 100 / (1 + rs), 1)

rsi14 = rsi(prices)
# >70 超买 / <30 超卖

# 7 日均价 vs 30 日均价（金叉/死叉）
ma7  = statistics.mean(prices[-7:])
ma30 = statistics.mean(prices[-30:])
cross = "金叉（上涨信号）" if ma7 > ma30 else "死叉（下跌信号）"

# 90 日趋势
first30_avg = statistics.mean(prices[:30])
last30_avg  = statistics.mean(prices[-30:])
trend = "上升" if last30_avg > first30_avg * 1.05 else ("下降" if last30_avg < first30_avg * 0.95 else "震荡")

# 7d / 30d 涨跌幅（补充维度 1 缺失字段）
change_7d  = round((prices[-1] - prices[-8])  / prices[-8]  * 100, 2) if len(prices) >= 8  else 'N/A'
change_30d = round((prices[-1] - prices[-31]) / prices[-31] * 100, 2) if len(prices) >= 31 else 'N/A'

print(f"RSI14={rsi14} | MA7={ma7:.4f} vs MA30={ma30:.4f}（{cross}）| 7日区间 {week_low:.4f}~{week_high:.4f} | 90日趋势：{trend}")
print(f"7d涨跌幅: {change_7d}% | 30d涨跌幅: {change_30d}%")
```

### 维度 3：链上信号（Hyperliquid）

```bash
HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] || HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/../core/hyperliquid-perps/scripts/lookup.sh"
[ -f "$HL" ] && "$HL" <TICKER> --json 2>/dev/null || echo "该币无 Hyperliquid 链上镜像 / hyperliquid-perps 未安装"
```

- 无镜像（多数小币）：标注"该币无 Hyperliquid 链上镜像"后跳过
- 有镜像：输出 fundingAprNow / OI / 链上价 vs CoinGecko 价差 / 24h 链上成交量

**拥挤度规则**：APR < +20% → 未拥挤 ✅ / +20~+100% → 多头偏强（正常上涨段）⚠️ / >+100% → 极度拥挤 🚨（与 hyperliquid-perps 等级表一致）

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

主对话直接 `Skill(skill="event-calendar")` 顺序调用（region=US，from=今天，to=今天+30，返回 FOMC/CPI/非农结构化事件列表）。Skill 返回后执行：

Tavily（days=90）：`{coin_name} upgrade unlock airdrop event schedule 2026`

关注：代币解锁日期 / 协议重大升级 / ETF 申请进展 / 监管事件

## ⚠️ 输出即止规则

**输出前自检**：

- [ ] 维度 0 `crypto-macro` 背景小结是否已输出？
- [ ] 维度 3 `hyperliquid-perps` 是否已调用？（无镜像可 N/A）
- [ ] 维度 7 `event-calendar` 是否已调用？

全部 ✅ 或合法 N/A 后，**立即**以 `## 📊 <标的>` 或报告模板标题开头写正文。禁止 `echo` / `python print` 等"准备输出"工具调用。
报告输出完成后，**立即**调用 `Skill(skill="ticker-journal")` → write 存档（来源 `crypto-analyzer`，评级 `纯分析`，见下方「分析存档」）。

## 输出规范

- 价格用 USD 后缀，市值用 B/M 简写，**本 skill 强制不用 $ 符号**（Claude Code 终端 Markdown 渲染下 `$XX` 可能被 KaTeX 吞掉，加密资产价格数字小数位多，更易触发）
- 所有 API 数据标注拉取时间（UTC）

（报告模板、指标解读、数据源 API 已在执行前必读块加载）

## 协作关系

```
crypto-scanner ──→ crypto-analyzer（候选交接）
crypto-analyzer ──→ trading-debate（可选决策层）
event-calendar  ──→ 维度 7
hyperliquid-perps → 维度 3
```

## 分析存档（自动，输出报告后立即执行）

七维度报告输出完成后，**立即**调用 `Skill(skill="ticker-journal")` → write 操作：

- 来源标记为 `crypto-analyzer`，评级填 `纯分析`
- **完整七维度报告**写入 `~/.stock-skills/reports/{TICKER}/`（通过 `write.py --report-file`）
- 同天其他 skill 已写档的条目禁止覆盖，各自独立区块
- PE/PB 百分位不适用时填 `N/A`，改填 MV/RV 比率（如有）
- 字段从刚输出的报告中提取，禁止重新调用 API
- 提取失败的字段填 `N/A`，不中止流程
