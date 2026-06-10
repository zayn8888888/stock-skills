---
name: crypto-macro
description: Use when needing crypto market macro backdrop before individual coin analysis, or when user asks about overall crypto market conditions — sentiment, BTC dominance cycle, altcoin season, market-wide leverage. Symptoms: "币圈情绪怎样", "山寨季开了吗", "加密市场现在什么状态", "altcoin season", "crypto fear greed", "BTC 统治率", "整体市场怎样".
---

# 加密市场宏观脉搏

整体加密市场环境快照：情绪 / 市场结构 / 链上杠杆 / 宏观联动，为单币分析提供背景底色。

## 核心原则

1. **背景层，非个币结论**：输出市场整体状态，不对单币下买卖判断
2. **数据先行**：三个数据源全部拉完再输出，不靠印象描述市场
3. **给判断，不只给数字**：每个维度最后一行必须给出明确的阶段判断

## 数据源速查

| 维度 | 数据源 | 备注 |
|------|--------|------|
| Fear & Greed 7日趋势 | `https://api.alternative.me/fng/?limit=7` | 免费无 key |
| BTC 统治率 / 总市值 / 24h 变化 | CryptoCompare `/data/top/mktcapfull`（优先）→ CoinGecko DNS 绕过 fallback | 免费无 key，100 req/min |
| 链上杠杆（BTC/ETH/SOL funding） | `hyperliquid-perps` skill | 未安装时跳过 |
| BTC ETF 资金流向 | Tavily days=2 | BlackRock IBIT / Fidelity FBTC |
| BTC 链上信号（MVRV + Exchange Flow） | Tavily days=7 / days=3 | 免费无 key |
| 加密 Polymarket + 前瞻宏观日历 | Polymarket Gamma API + event-calendar skill | 无 key，event-calendar 处理宏观节点 |
| 宏观联动 | Tavily（days=3） | Fed/DXY 对加密影响 |

## 执行流程

### Step 0：读缓存（优先，命中则跳过 Step 1-3）

```bash
python3 -c "
import json, os
from datetime import datetime
p = os.path.expanduser('~/.stock-skills/cache/crypto-macro-latest.json')
try:
    d = json.loads(open(p).read())
    age = (datetime.now() - datetime.fromisoformat(d['timestamp'])).total_seconds() / 3600
    print('HIT' if age < d.get('ttl_hours', 4) else 'EXPIRED', d.get('timestamp',''), f'{age:.1f}h', sep='|')
except:
    print('MISS||')
" 2>/dev/null || echo "MISS||"
```

- `HIT|...`：直接展示缓存 `summary` 字段内容，标注 `[缓存 YYYY-MM-DD HH:MM，X.Xh 前，TTL 2h]`，**跳过 Step 1-3，直接输出背景小结**
- `EXPIRED|...` 或 `MISS|...`：继续 Step 1 全量拉取

### Step 1：并行拉取三源（单条消息内批量发）

**Bash 批次（并行）**：

```bash
# Fear & Greed 7日趋势
curl -s "https://api.alternative.me/fng/?limit=7" | python3 -c "
import json, sys, datetime
d = json.load(sys.stdin)['data']
for item in d[:7]:
    ts = datetime.datetime.fromtimestamp(int(item['timestamp'])).strftime('%m-%d')
    print(f\"{ts}: {item['value']:>3} ({item['value_classification']})\")
"
```

```bash
# CryptoCompare 全局数据（优先，免费直连）→ CoinGecko DNS 绕过 fallback
curl -sf "https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin).get('Data', [])
total = sum(c['RAW']['USD']['MKTCAP'] for c in data if c.get('RAW', {}).get('USD', {}).get('MKTCAP'))
btc_mcap = eth_mcap = btc_chg = 0
for c in data:
    name = c.get('CoinInfo', {}).get('Name', '')
    raw = c.get('RAW', {}).get('USD', {})
    if name == 'BTC':
        btc_mcap = raw.get('MKTCAP', 0)
        btc_chg = raw.get('CHANGEPCT24HOUR', 0)
    elif name == 'ETH':
        eth_mcap = raw.get('MKTCAP', 0)
print('btc_dom:', round(btc_mcap / total * 100, 1) if total else 'N/A')
print('eth_dom:', round(eth_mcap / total * 100, 1) if total else 'N/A')
print('total_mcap_T:', round(total / 1e12, 3) if total else 'N/A')
print('mcap_change_24h:', round(btc_chg, 2))
print('active_cryptos: Top 100 采样')
" 2>/dev/null || \
curl -sf "https://api.coingecko.com/api/v3/global" \
  --resolve "api.coingecko.com:443:104.20.41.132" \
  ${COINGECKO_DEMO_KEY:+-H "x-cg-demo-api-key: $COINGECKO_DEMO_KEY"} \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
pct = d['market_cap_percentage']
print('btc_dom:', round(pct.get('btc', 0), 1))
print('eth_dom:', round(pct.get('eth', 0), 1))
total = d['total_market_cap']['usd']
print('total_mcap_T:', round(total / 1e12, 3))
print('mcap_change_24h:', round(d['market_cap_change_percentage_24h_usd'], 2))
print('active_cryptos:', d['active_cryptocurrencies'])
" 2>/dev/null || \
echo "global_data_unavailable=true"
```

**Tavily 批次（并行）**：

> **年份动态替换**：下列 query 中 `{YEAR}` 替换为当前年份。

- `crypto market bitcoin dominance altcoin season sentiment today` days=3
- `Federal Reserve Fed interest rates impact crypto bitcoin {YEAR}` days=7（**若本会话 context 已有 tradfi-macro 报告，跳过此条，直接引用其"利率"小节及 Section 2.5 数据意外结论，仅追加对加密的特定影响 1 句**）
- `Bitcoin ETF IBIT FBTC net inflows outflows BlackRock Fidelity latest week {YEAR}` days=3（⚠️ **仅使用文章发布日 ≤3 天且引用数据日期 ≤7 天的内容；若所有结果的数据日期 >7 天 → 标 ⚠️ 并注明数据截止日，不引用旧数字**）
- `NFP CPI PCE economic data actual vs expected surprise Fed rate cut hike expectations {YEAR}` days=7（专项捕获近期数据意外方向；**若本会话 context 已有 tradfi-macro Section 2.5 → 跳过此条，直接引用**）

### Step 1.5：BTC 链上信号（串行，Step 1 完成后）

两条 Tavily 并行：

- `"MVRV Z-score bitcoin current {YEAR}"` days=7
- `"Bitcoin exchange netflow CryptoQuant Glassnode latest week {YEAR}"` days=2

⚠️ **数据鲜度校验（必须执行）**：
- 从搜索结果中提取**数据日期**（不是文章发布日期）
- 若数据日期 ≤7 天 → 正常使用
- 若数据日期 8–14 天 → 标注 ⚠️（数据略旧，参考价值降低）并使用
- 若数据日期 >14 天，或无法确认数据日期 → **标 ❌ 过期，跳过该读数，不以旧数字代替当前状态**
- 优先从 Glassnode/CryptoQuant 页面 snippet 读取"Latest Values"字段（往往含精确时间戳）

判断规则：

```
MVRV Z-Score：
  < 0    → 历史底部区 🟢（2018/2022 底均在此）
  0–3    → 中性
  3–7    → 偏热 ⚠️
  > 7    → 历史顶部区 🚨

交易所净流向：
  净流入交易所 → 卖压⚠️
  净流出交易所 → 囤币🟢
```

### Step 3：链上杠杆——BTC/ETH/SOL 采样（串行，Step 1 完成后）

```bash
HL="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/../core/hyperliquid-perps/scripts/lookup.sh"
if [ -f "$HL" ]; then
  "$HL" BTC --json 2>/dev/null
  "$HL" ETH --json 2>/dev/null
  "$HL" SOL --json 2>/dev/null
else
  echo "hyperliquid-perps 未安装，跳过链上杠杆维度"
fi
```

从三者 fundingAprNow 取平均值作为市场整体杠杆倾向代理。

### Step 3.5：内联推算山寨季状态（无额外 API，基于 Step 1 数据）

基于 Step 1 的 BTC dominance：

```
> 55%  → BTC Season（BTC 主导，山寨整体跑输）
50-55% → 均衡区（部分山寨轮动启动）
< 50%  → 山寨季候选：双重确认
         条件 A：ETH 30d 涨幅 > BTC 30d 涨幅 ≥ 10pp
         条件 B：SOL 30d 涨幅 > BTC 30d 涨幅（同向验证）
         A + B 均满足 → Altcoin Season 确认
         仅 A 满足 → 碎片化轮动（ETH 单独超跑，非系统性山寨季）
         均不满足 → BTC dom < 50% 可能由山寨暴跌造成（参考 2022 LUNA 崩盘），维持 BTC Season 判断
```

Fear & Greed 区间：

```
0-25   Extreme Fear（历史底部区，反向指标）
26-45  Fear
46-55  Neutral
56-75  Greed
76-100 Extreme Greed（过热，注意回调风险）
```

链上杠杆拥挤度（与 hyperliquid-perps 等级表一致）：

```
APR < +20%           未拥挤 ✅
APR +20% ~ +100%     多头偏强（正常上涨段）⚠️
APR > +100%          极度多头拥挤 🚨
APR < -20%           空头偏强 ⚠️
APR < -100%          极度空头拥挤 🚨
```

### Step 4：前瞻日历 + 加密 Polymarket（并行，Step 1.5 完成后）

**4a. 调用 event-calendar skill**（取压缩输出）：

```
from=today, to=today+21, region=US
取：FOMC / CPI / NFP 日期+预期值 + Polymarket 宏观 Top 3（vol24 > $200k）
```

**4b. Fed 全年利率前景 Polymarket**（bash，**若本会话已有 tradfi-macro 报告则跳过，直接引用其 Section 2 全年利率前景表**）：

```bash
python3 -c "
import urllib.request, json
from datetime import datetime

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except:
        return None

year = str(datetime.now().year)

hike_events = fetch('https://gamma-api.polymarket.com/events?series_slug=fed-rate-hike&closed=false&limit=5') or []
for ev in hike_events:
    m = (ev.get('markets') or [{}])[0]
    prices = json.loads(m.get('outcomePrices') or '[0,0]')
    vol = float(ev.get('volume') or 0)
    print(f'全年加息概率: Yes={round(float(prices[0])*100,1)}% No={round(float(prices[1])*100,1)}% | {ev.get(\"title\",\"\")[:45]} | 总vol \${round(vol):,}')
    break

cuts_events = fetch('https://gamma-api.polymarket.com/events?tag_slug=fed-rates&closed=false&limit=20') or []
for ev in cuts_events:
    if 'how many' not in ev.get('title','').lower() or year not in ev.get('title',''):
        continue
    vol = float(ev.get('volume') or 0)
    print(f'全年降息次数({year}, 总vol \${round(vol):,}):')
    for m in (ev.get('markets') or [])[:5]:
        prices = json.loads(m.get('outcomePrices') or '[0,0]')
        print(f'  {m.get(\"question\",\"\")[:50]}: {round(float(prices[0])*100,1)}%')
    break
" 2>/dev/null || echo "polymarket_fed_rate_unavailable"
```

**4c. 加密专项 Polymarket**（bash，按 event 总成交量过滤，不用 market 级别）：

```bash
python3 -c "
import urllib.request, json

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except:
        return None

kw_exact = {'btc','eth','sol','xrp','sec','etf'}  # 需完整词匹配
kw_substr = ['bitcoin','crypto','ethereum','solana','altcoin','coinbase','ripple']
events = fetch('https://gamma-api.polymarket.com/events?closed=false&active=true&limit=200&order=volume&ascending=false') or []

results = []
for ev in events:
    title = ev.get('title','').lower()
    words = set(title.replace('?','').replace(',','').split())
    if not (any(w in title for w in kw_substr) or any(w in words for w in kw_exact)):
        continue
    vol24 = float(ev.get('volume24hr') or 0)
    vol = float(ev.get('volume') or 0)
    if vol < 500000: continue  # 总成交 > \$500k
    slug = ev.get('slug','')
    markets = ev.get('markets') or []

    # 价格目标类市场：提炼当前价位前沿（找最接近 50% 的未决市场）
    price_mkts = [m for m in markets if float(m.get('volumeNum') or 0) > 0]
    price_mkts = [m for m in price_mkts if json.loads(m.get('outcomePrices','[1]'))[0] not in (0.0, 1.0)]
    price_mkts = [m for m in price_mkts if 0.05 < float(json.loads(m.get('outcomePrices','[0]'))[0]) < 0.95]

    if price_mkts:
        # 按 yes 概率排序，找最接近50%的（市场定价边界）
        price_mkts.sort(key=lambda m: abs(float(json.loads(m.get('outcomePrices','[0]'))[0]) - 0.5))
        frontier = price_mkts[0]
        yes_pct = round(float(json.loads(frontier.get('outcomePrices','[0]'))[0]) * 100, 1)
        results.append((vol24, vol, ev.get('title','')[:55], frontier.get('question','')[:60], yes_pct, slug))
    else:
        # 非价格类：直接取第一个市场
        if markets:
            m0 = markets[0]
            prices = json.loads(m0.get('outcomePrices','[0,0]'))
            yes_pct = round(float(prices[0]) * 100, 1)
            results.append((vol24, vol, ev.get('title','')[:55], m0.get('question','')[:60], yes_pct, slug))

results.sort(key=lambda x: -x[0])
for vol24, vol, title, frontier_q, yes_pct, slug in results[:6]:
    print(f'{title}')
    print(f'  前沿: {frontier_q}: Yes={yes_pct}%')
    print(f'  vol24h=\${round(vol24/1e3):,}k 总vol=\${round(vol/1e6,1)}M | https://polymarket.com/event/{slug}')
" 2>/dev/null || echo "polymarket_crypto_unavailable"
```

## 输出格式

```markdown
## 🌍 加密宏观脉搏 · YYYY-MM-DD HH:MM UTC

### 1. 市场情绪（Fear & Greed）
| 今日 | 昨日 | 7日均值 | 近7日趋势 |
|------|------|---------|----------|
| XX（Extreme Fear/Fear/Neutral/Greed/Extreme Greed）| XX | XX | ↗/↘/→ |

→ **情绪判断**：当前处于 X 阶段，[历史含义/行动含义]

### 1.5 BTC ETF 资金流向（机构买卖力）
连续方向：↗ 连续X天净流入 / ↘ X天净流出 / 震荡
近7日汇总（USD）：+$X亿 / -$X亿
主导基金：IBIT / FBTC / 其他
→ **ETF判断**：机构 [持续增持/减持/观望]

### 2. 市场结构（BTC 统治率 + 山寨季）
- BTC 统治率：X.X%（1周变化：±Xpp）
- ETH 统治率：X.X%
- 总市值：$X.XXT（24h ±X%）
- 山寨季状态：**[BTC Season / Altcoin Season / 碎片化轮动 / 均衡区]**

→ **结构判断**：[1 句话，说明对板块轮动的含义]

### 2.5 BTC 链上信号
| 指标 | 当前读数 | 区间参考 | 判断 |
|------|---------|---------|------|
| MVRV Z-Score | X.X（来源） | <0底部 / >7顶部 | 底部区/中性/过热 |
| 交易所净流向 | 净流入/出 | — | 卖压/囤币 |
→ **链上判断**：[超卖底部/中性/过热顶部]

### 3. 链上杠杆（Hyperliquid 采样）
| 标的 | funding APR | 拥挤信号 |
|------|------------|---------|
| BTC  | X.X%  | ✅/⚠️/🚨 |
| ETH  | X.X%  | ... |
| SOL  | X.X%  | ... |
| 市场均值 | X.X% | ... |

→ **杠杆总结**：市场整体 [轻度/中等/重度] [多头/空头/均衡]偏向

### 4. 宏观联动
[若本会话已有 tradfi-macro 报告：引用其"利率"+ "风险判断"两行结论，**并引用 Section 2.5 近期数据意外方向（NFP/CPI 超预期 → 降息预期推迟 → 对 BTC 负面；弱于预期 → 降息预期提前 → 对 BTC 正面）**，追加 1 句"对加密的特定影响"]
[否则：综合 Step 4b Polymarket 数据 + Tavily 2-3 句，**利率概率必须来自 Step 4b Polymarket（全年加息%/0次降息%），不得用 Tavily 文章中的描述性说法替代**；补充：若有近期 NFP/CPI 意外则说明方向 + BTC 与 SPX 相关性（机构化后 r > 0.6）]

**近期数据 Surprise**（若本会话已有 tradfi-macro Section 2.5 → 直接引用，跳过此块）：
| 数据 | 发布日 | 实际 | 预期 | Surprise |
|------|--------|------|------|---------|
| CPI  | MM/DD  | X.X% | X.X% | 超预期🔴 / 符合 / 低于🟢 |
| NFP  | MM/DD  | XXXk | XXXk | ... |
| PCE  | MM/DD  | X.X% | X.X% | ... |
→ 近期通胀/就业 [超预期/符合/弱于] 预期 → Fed 加息风险 [上升/持平/下降] → 对 BTC [偏空/中性/偏多]

**利率预期修正**（每次必填，数字来自 Step 4b，不得靠 Tavily 描述估算）：
全年加息概率：X%（Polymarket）| 0次降息概率：X% | 下次FOMC：见 Section 5

### 5. 前瞻事件 + 加密 Polymarket
（来自 event-calendar + 加密专项过滤）
**宏观节点**（FOMC/CPI/NFP）：
| 日期 | 事件 | 市场预期 |
|------|------|---------|
| MM/DD | FOMC | 暂停 X% / 降25bp X% |
| MM/DD | CPI  | 预期 X.X% |

**加密 Polymarket Top 3**（vol24 ≥ $50k）：
| 市场 | 概率 | vol24 | 链接 |
|------|------|-------|------|

### 📌 加密宏观背景小结
| 维度 | 当前状态 |
|------|---------|
| 市场情绪 | Extreme Fear/Fear/Neutral/Greed/Extreme Greed（XX分） |
| 市场结构 | BTC Season / Altcoin Season / 碎片化 |
| 链上杠杆 | 轻/中等/重度 多头/空头/均衡 拥挤 |
| BTC ETF流向 | 增持/减持/观望 |
| 链上信号 | 底部区/中性/过热（MVRV X.X） |
| 前瞻事件 | 下次重大事件 · 距今X天 |
| 近期数据意外 | CPI/NFP [超预期🔴/符合/弱于🟢] → Fed 加息风险 [上升/持平/下降] |
| 利率预期修正 | 全年加息 X% / 0次降息 X%（Polymarket） |
| 宏观联动 | Risk-on / Risk-off / 中性 |
| **对个币分析的含义** | [1句：高 Beta 机会 / 防守 / 等待宏观拐点 / 选择性做多赛道龙头] |
```

## 写缓存（Step 4 输出完毕后，覆盖写）

**第一步**：先建目录：

```bash
mkdir -p ~/.stock-skills/cache
```

**第二步**：用 **Write** 工具写入 `~/.stock-skills/cache/crypto-macro-latest.json`，`timestamp` 固定填占位符 `__NOW__`（不要填实际时间，下一步会自动替换）：

```json
{
  "timestamp": "__NOW__",
  "ttl_hours": 4,
  "summary": "上方 📌 加密宏观背景小结 完整 markdown 表格文本（换行符转义为 \\n，双引号转义为 \\\"）"
}
```

`summary` 字段：从 `| 维度 | 当前状态 |` 到最后 `| 对个币分析的含义 | ... |` 行，原样 JSON 字符串编码。

**第三步**：立刻运行以下命令把 `__NOW__` 替换为真实时间（必须执行，否则缓存时间戳错误）：

```bash
python3 -c "
import json, os
from datetime import datetime
p = os.path.expanduser('~/.stock-skills/cache/crypto-macro-latest.json')
d = json.loads(open(p).read())
d['timestamp'] = datetime.now().isoformat(timespec='seconds')
open(p, 'w').write(json.dumps(d, ensure_ascii=False, indent=2))
print('cache written:', d['timestamp'])
"
```

## 降级规则

| 数据源 | 失败处理 |
|--------|---------|
| alternative.me | 标 ❌，跳过 Fear & Greed，继续其余维度 |
| CryptoCompare global | 自动降级 CoinGecko DNS 绕过；两者均失败 → Tavily 补 "BTC dominance today crypto market cap"，标注来源 |
| hyperliquid-perps | 标 N/A，跳过链上杠杆维度 |
| ETF 流向 Tavily | 标 ❌，跳过 Section 1.5 |
| 链上信号 Tavily | 标 ❌，跳过 Section 2.5 |
| event-calendar | 标 ❌，Section 5 仅显示加密 Polymarket |
| 加密 Polymarket | 标 N/A，Section 5 仅显示宏观节点 |
| Fed 全年利率 Polymarket | 标 N/A，Section 4 利率预期修正行留空 |
| Tavily | 标 ❌，跳过宏观联动 |

任何单源失败不影响其他维度。三源全失败时输出"加密宏观数据不可用"，不编数字。

## 调用约束

**被 `crypto-analyzer` 调用时**：输出背景小结后**立即**继续七维度分析，不停等用户确认。

**被 `trading-debate` 调用时（加密标的）**：输出背景小结后标注 `[crypto-macro 数据时点: YYYY-MM-DD HH:MM UTC]`，供 Druckenmiller 引用。

## 协作关系

```
用户直接问 "币圈情绪/山寨季/加密宏观"
  → crypto-macro（独立输出完整四节报告）

crypto-analyzer
  → crypto-macro（维度 0 前置：每次分析前先建立宏观底色）

crypto-scanner
  → crypto-macro（L0 大盘门控补充：判断整体市场是否适合扫热点）

trading-debate（加密标的）
  → crypto-macro（Druckenmiller 宏观数据来源）
```
