---
name: tradfi-macro
description: Use when needing traditional finance macro backdrop for stock/FX/commodity analysis. Symptoms: user asks about current macro environment, VIX level, dollar trend, Fed stance, China macro (PBOC/CNY/northbound flow), risk-on/risk-off, "宏观怎样", "市场情绪", "美元在涨吗", "降息概率", "北向资金", "大盘背景". Called by trading-debate for Druckenmiller data.
---

# 传统金融宏观脉搏

当前宏观环境快照：美国风险偏好 / 美元走势 / 利率 / 中国宏观，为美股、港股、A 股、大宗商品分析提供背景底色。

## 核心原则

1. **API 数值优先，Tavily 限定性质面**：VIX / 利率用 Futu API（`US..VIX` / `US..TNX` / `US..TYX`，均双点格式）拿精确数字；DXY 不在富途行情，改走 Tavily query 6 专项取值（标 `[来源: Tavily]`）；其余 Tavily 只搜 Fed / PBOC 的政策口风（定性）
2. **数据来源标注**：每个数字注明来源，不编数字
3. **给宏观判断，不只给数字**：最终必须输出 Risk-on / Risk-off / 中性 + 主驱动因子

## 执行流程

### Step 0：读缓存（优先，命中则跳过 Step 1-3）

```bash
python3 -c "
import json, os
from datetime import datetime
p = os.path.expanduser('~/.stock-skills/cache/tradfi-macro-latest.json')
try:
    d = json.loads(open(p).read())
    age = (datetime.now() - datetime.fromisoformat(d['timestamp'])).total_seconds() / 3600
    print('HIT' if age < d.get('ttl_hours', 8) else 'EXPIRED', d.get('timestamp',''), f'{age:.1f}h', sep='|')
except:
    print('MISS||')
" 2>/dev/null || echo "MISS||"
```

- `HIT|...`：直接展示缓存 `summary` 字段内容，标注 `[缓存 YYYY-MM-DD HH:MM，X.Xh 前，TTL 4h]`，**跳过 Step 1-3，直接输出背景小结**
- `EXPIRED|...` 或 `MISS|...`：继续 Step 1 全量拉取

### Step 1：Futu 行情快照（并行，主数据源，需 OpenD）

三个标的同批并行（DXY 不在富途行情，改走 Step 2 Tavily 专项 query；VIX/TNX/TYX 均使用双点格式 `US..TICKER`）：

```bash
SCRIPTS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/futuapi/scripts/quote"
python3 "$SCRIPTS/get_snapshot.py" US..VIX --json 2>/dev/null   # 标普500波动率指数
python3 "$SCRIPTS/get_snapshot.py" US..TNX --json 2>/dev/null   # 10Y Treasury yield
python3 "$SCRIPTS/get_snapshot.py" US..TYX --json 2>/dev/null   # 30Y Treasury yield
```

提取字段：`last_price`（当前值）、`change_rate`（周涨跌幅%，用于相对变化判断）、`prev_close_price`。

**FedWatch（与快照并行，下次会议的利率区间概率）**：这是 CME 利率概率，不是预测市场。全年降息次数分布仍用 Step 2 的 Polymarket。

```bash
python3 "$SCRIPTS/get_fed_watch_target_rate.py" --json
python3 "$SCRIPTS/get_fed_watch_dot_plot.py" --json
```

`get_fed_watch_target_rate` 取最近一次会议的 `meeting_date`、`target_range`、`probability`。`get_fed_watch_dot_plot` 取当年 `median_rate` 与 `current_rate`。脚本报错或 OpenD 未连接时，这两项标 N/A，不改用富途事件合约。

**⚠️ OpenD 未连接**：行情快照和 FedWatch 全部标 ❌。VIX / TNX / TYX 走 Step 2 Tavily 兜底（标 `[来源: Tavily]`）。FedWatch 标 N/A。

### Step 2：Tavily（定性）并行

> **年份动态替换**：下列 query 中 `{YEAR}` 替换为当前年份，`{MONTH}` 替换为当前月份英文名（Jan/Feb/…）。

**Tavily**（days=7）：

```
query 1: "Federal Reserve FOMC policy statement hawkish dovish {YEAR}"
query 2: "PBOC China LPR yuan CNY policy {YEAR}"
query 3: "央行 降准 降息 LPR 货币政策 {YEAR}"
```

A/HK 标的追加（days=2）：

```
query 4: "北向资金 沪深港通 净流入 今日"
```

数据 Surprise（通用，days=14）：

```
query 5: "US CPI PCE NFP jobs actual vs expected economic data surprise {MONTH} {YEAR}"
```

DXY 当前值（通用，days=2，**DXY 不在 Futu 行情，此 query 必做**）：

```
query 6: "US dollar index DXY current level today forex {YEAR}"
```

从 query 6 提取：当前 DXY 值（约 XXX.X）+ 近 1 周方向（走强/走弱/震荡）。标 `[来源: Tavily]`。

**Polymarket 全年利率前景**（与 Tavily 并行，bash）：

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

# 全年加息概率：按 series_slug 拉（跨年稳定系列，取第一条 active）
hike_events = fetch('https://gamma-api.polymarket.com/events?series_slug=fed-rate-hike&closed=false&limit=5') or []
for ev in hike_events:
    m = (ev.get('markets') or [{}])[0]
    prices = json.loads(m.get('outcomePrices') or '[0,0]')
    vol = float(ev.get('volume') or 0)
    print(f'全年加息概率: Yes={round(float(prices[0])*100,1)}% No={round(float(prices[1])*100,1)}% | 题目: {ev.get(\"title\",\"\")[:50]} | 总vol \${round(vol):,}')
    break

# 全年降息次数：按 tag_slug=fed-rates 拉，过滤含 'how many' + 当年
cuts_events = fetch(f'https://gamma-api.polymarket.com/events?tag_slug=fed-rates&closed=false&limit=20') or []
for ev in cuts_events:
    if 'how many' not in ev.get('title','').lower() or year not in ev.get('title',''):
        continue
    vol = float(ev.get('volume') or 0)
    print(f'全年降息次数分布({year}, 总vol \${round(vol):,}):')
    for m in (ev.get('markets') or [])[:6]:
        prices = json.loads(m.get('outcomePrices') or '[0,0]')
        label = m.get('question','')[:55]
        print(f'  {label}: {round(float(prices[0])*100,1)}%')
    break
" 2>/dev/null || echo "polymarket_annual_rate_unavailable"
```

### Step 2.5：调用 event-calendar（串行，Step 2 完成后）

```
调用 event-calendar skill：
  from=today
  to=today+21
  region=US（美股标的）/ BOTH（含港股/A股，触发 PBOC+HKMA）

取出：
  ① 经济日历高影响事件：FOMC / CPI / NFP 日期 + 市场预期值
  ② Polymarket 宏观 Top 3（vol24 > $200k），含降息概率

event-calendar 输出为压缩格式（只取上述两项，不展开完整4节报告）
```

### Step 3：内联综合判断（Step 1-2 完成后，不调 API）

**VIX 判断（绝对水位 + 相对变化双轨）**：

```
绝对水位：
  < 15   极低波动（过度乐观，历史高风险区）
  15-20  正常偏低（risk-on）
  20-25  警惕区
  25-30  恐惧（risk-off）
  > 30   极度恐惧（系统性风险信号）

相对变化（优先级高于绝对水位）：
  VIX 1周涨幅 > +30% → Risk-off 升级，不论绝对水位多低
  VIX 1周涨幅 > +50% → 急性风险事件，强制 Risk-off
```

**DXY 方向含义**：

```
近1周 change_rate > +1%  → 美元走强 → EM / 港股 / 大宗承压
近1周 change_rate < -1%  → 美元走弱 → EM / 港股 / 大宗受益
其余                      → 震荡
```

**利率（TNX 10Y yield）**：

```
TNX < 4.0%   宽松预期主导
TNX 4.0-4.5% 中性区
TNX > 4.5%   偏紧，高利率压制估值
```

**2s10s 利差辅助参考（非决策主因）**：

2s10s = TNX（10Y）- 2Y yield（Tavily 兜底）

```
> 50bp   正常曲线
0-50bp   趋平，衰退预期升温（辅助信号，单独不构成 Risk-off）
< 0      倒挂（历史先行指标，但 2022-2024 已证伪一次，权重降低，仅作参考）
```

**综合判断**：

```
Risk-on：VIX 绝对低位 + 无相对急升 + DXY 弱/震荡 + TNX 稳定/下行 + Fed 偏鸽
Risk-off：VIX 1周+30%以上 OR VIX > 25 + DXY 强势 + TNX 快速上行 + Fed 鹰派
中性：信号不一致，或各维度中间区间
主驱动因子：列出触发判断的 1-2 个关键指标
```

## 输出格式

```markdown
## 🏦 宏观脉搏 · YYYY-MM-DD HH:MM HKT

### 1. 美国风险偏好
| 指标 | 当前值 | 1周变化 | 信号 |
|------|--------|---------|------|
| VIX  | XX.X [来源] | ±X% | 恐惧/警惕/中性/乐观 |
| DXY  | XXX.X [来源] | ±X% | 强势/弱势/震荡 |

→ **风险判断**：[Risk-on / Risk-off / 中性]，主驱动：[X]

### 2. 利率
- 10Y 美债（TNX）：X.XX%（1周 ±Xbp）[来源]
- 30Y 美债（TYX）：X.XX%（参考）
- 2s10s 利差：约 ±XXbp（[正常/趋平/倒挂]，辅助参考）
- 下次 FOMC：[日期，来自 Section 5 event-calendar]，本次会议：见 Section 5

**全年利率前景（Polymarket）**：
| 市场 | 概率 | 总成交量 |
|------|------|---------|
| 全年加息（任意时点） | Yes X% / No X% | $XM |
| 0次降息 | X% | — |
| 1次降息 | X% | — |
| 2次降息 | X% | — |
| 3次降息 | X% | — |

→ **利率信号**：[1 句话：全年利率路径 + 对估值的影响，重点说明加息/降息概率主导方向]

### 2.5 近期数据 Surprise（过去 14 天）
| 数据 | 发布日 | 实际 | 预期 | Surprise |
|------|--------|------|------|---------|
| CPI  | MM/DD  | X.X% | X.X% | 超预期🔴 / 符合 / 低于🟢 |
| NFP  | MM/DD  | XXXk | XXXk | ... |
| PCE  | MM/DD  | X.X% | X.X% | ... |

→ **数据意外方向**：近期整体 [好于/符合/弱于] 预期 → Fed 降息压力 [上升/下降/中性]

### 3. Fed 立场（Tavily）
[1-2 句：最近 Fed 官员发言或会议纪要的关键口风，注明来源媒体]

### 4. 中国宏观（A/HK 标的时展开）
- PBOC 立场：[宽松/收紧/观望]，最近动作：[X]（Tavily 来源）
- CNY/USD：约 X.XX，[升值/贬值趋势]
- 北向资金：近期 [净流入/净流出 约 X 亿]（days=2 Tavily）

→ **A/HK 含义**：[1 句话]

### 5. 前瞻事件日历（来自 event-calendar）
| 日期 | 事件 | 市场预期 / 押注概率 |
|------|------|-------------------|
| MM/DD | FOMC | FedWatch：区间 X-Y 概率 Z%（点阵中值 A%） |
| MM/DD | CPI  | 预期 X.X%（富途日历 consensus） |
| MM/DD | NFP  | 预期 XXXk（富途日历 consensus） |

**Polymarket 宏观押注 Top 3**（vol24 > $200k）：
| 市场 | Yes/No | vol24 | 链接 |
|------|--------|-------|------|

### 📌 宏观背景小结
| 维度 | 当前状态 |
|------|---------|
| 美国风险偏好 | Risk-on / Risk-off / 中性（VIX: XX，1周 ±X%） |
| 美元 | 强势 / 弱势 / 震荡（DXY: XXX，1周 ±X%） |
| 利率 | 宽松 / 收紧 / 正常（TNX: X.XX%，下次会议 FedWatch 最高概率区间 X-Y Z%；全年降息次数分布见 Polymarket） |
| 近期数据意外 | 好于/符合/弱于 预期（CPI: X.X% vs X.X%） |
| 中国宏观 | 宽松 / 收紧 / 观望 / N/A |
| **综合宏观判断** | [Risk-on/Risk-off/中性] + [主驱动] |
| **下次大事件** | [来自 event-calendar] · 距今 X 天 · 下次会议利率区间 [FedWatch] |
| **含义** | [1-2 句：当前宏观对哪类资产顺风/逆风] |

数据时点：YYYY-MM-DD HH:MM HKT
```

## 降级规则

| 场景 | 处理 |
|------|------|
| DXY | 不在富途行情，**始终走 Step 2 query 6 Tavily**，标 `[来源: Tavily]` |
| OpenD 未连接 / Futu 全失败 | VIX / TNX / TYX 走 Tavily 补数值（days=2），标 `[来源: Tavily]` |
| FedWatch 脚本失败 | 下次会议利率区间标 N/A。全年降息次数仍看 Polymarket |
| Polymarket 不可用 | 全年降息次数分布标 N/A。下次会议概率仍用 FedWatch |
| Tavily 无结果 | 对应维度标 ⚠️，不编数字 |
| 非 A/HK 标的 | 维度 4 标 N/A，跳过 query 3/4 |
| event-calendar 不可用 | Section 5 标"⚠️ event-calendar 不可用"；利率节加息/降息/不变概率从 Polymarket 原始查询补跑（备用 bash 脚本：`curl -s "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=500&order=volume24hr&ascending=false" \| python3 -c "import json,sys; [print(round(float(m.get('volume24hr') or 0)),m['question'][:80],m.get('outcomePrices','')) for m in json.load(sys.stdin) if any(w in m.get('question','').lower() for w in ['fed','fomc','rate cut','rate hike','increase interest','decrease interest','basis point'])]" 2>/dev/null \| sort -rn \| head -10`；汇总展示：加息概率=所有 increase/hike Yes 之和，降息概率=所有 decrease/cut Yes 之和，不变=no change Yes） |

## 写缓存（Step 3 输出完毕后，覆盖写）

**第一步**：先建目录：

```bash
mkdir -p ~/.stock-skills/cache
```

**第二步**：用 **Write** 工具写入 `~/.stock-skills/cache/tradfi-macro-latest.json`，`timestamp` 固定填占位符 `__NOW__`（不要填实际时间，下一步会自动替换）：

```json
{
  "timestamp": "__NOW__",
  "ttl_hours": 8,
  "summary": "上方 📌 宏观背景小结 完整 markdown 表格文本（换行符转义为 \\n，双引号转义为 \\\"）"
}
```

`summary` 字段：从 `| 维度 | 当前状态 |` 到最后 `| 含义 | ... |` 行，原样 JSON 字符串编码。

**第三步**：立刻运行以下命令把 `__NOW__` 替换为真实时间（必须执行，否则缓存时间戳错误）：

```bash
python3 -c "
import json, os
from datetime import datetime
p = os.path.expanduser('~/.stock-skills/cache/tradfi-macro-latest.json')
d = json.loads(open(p).read())
d['timestamp'] = datetime.now().isoformat(timespec='seconds')
open(p, 'w').write(json.dumps(d, ensure_ascii=False, indent=2))
print('cache written:', d['timestamp'])
"
```

**被调用方（stock-analyzer / market-scanner）压缩输出时**：同样写缓存，`summary` 仅取背景小结表格那几行。

## 调用约束

**被 `trading-debate` 调用时（Druckenmiller）**：输出完整四节 + 背景小结，标注数据时点，立即继续辩论流程。event-calendar 在 Step 2.5 内部调用，输出一并纳入报告，**不需要** trading-debate 再单独调用 event-calendar。

**被 `stock-analyzer` / `market-scanner` 调用时**：仅输出背景小结表格（压缩格式）。

## 协作关系

```
用户直接问宏观 → tradfi-macro（独立完整输出）
trading-debate  → tradfi-macro（Druckenmiller @ 股票/FX/商品标的）
stock-analyzer  → tradfi-macro（维度 0，A/HK 必做，美股全景时执行）
market-scanner  → tradfi-macro（大盘门控，压缩输出）
```
