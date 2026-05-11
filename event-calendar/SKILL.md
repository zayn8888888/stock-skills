---
name: event-calendar
description: 前瞻事件日历助手。聚合三个数据源——Finnhub（美国经济数据释放日历 + 美股财报日历）、Polymarket（高流动性宏观市场隐含概率）、Tavily（中港政策与行业事件文本搜索），输出未来 N 天结构化事件清单，含日期、事件名、市场预期、市场押注概率、信源链接。触发场景：(1) 用户问"未来一周/一个月有什么大事 / FOMC 何时开会 / 降息概率多少 / CPI 何时发布 / 财报日历 / 美股财报日 / NVDA 什么时候出财报"；(2) 用户问"政策预期 / 关税预期 / 降息预期 / 押注 / Polymarket / 选举概率 / 衰退概率"；(3) 被 market-scanner 在「催化」「产业链外推」环节调用，被 stock-analyzer 作为「事件日历」维度调用。不适用于：历史事件回溯（用 stock-analyzer 维度 7）、实时盘中事件推送、A 股本土经济日历（Finnhub 不覆盖，仅靠 Tavily 兜底）。
---

# 前瞻事件日历

## 核心原则

1. **未来不预测，市场预期可引用**：本 skill 不预测事件结果，只列出"市场预期值/共识值/隐含概率"，并清楚标注来自哪个数据源（Finnhub estimate / Polymarket implied probability / Tavily 新闻引用）
2. **数据缺失显式标注**：任何一个数据源不可用，输出仍要跑通——剩余两源照常给数据，不可用的源单独标"⚠️ 不可用 + 原因"
3. **时区统一**：日期一律按 **UTC** 输出，对中港用户额外标 HKT（UTC+8），美股盘前/盘后标 EST（UTC-5/-4 按夏令时）
4. **流动性门槛**：Polymarket 市场必须满足 **24h volume ≥ \$50,000** 才采用，否则价格不能代表共识
5. **不出买卖指令**：日历是输入，不是结论；最终决策权交给用户

## 前置依赖

### 必需

- `curl` / `jq`（macOS/Linux 自带或 `brew install jq` / `apt install jq`）
- `mcp__plugin_tavily-web-search_tavily-web-search__tavily_search`（中港政策兜底搜索）

### 可选

- **Finnhub API key**：用于美国经济数据 + 美股财报日历。免费版 60 calls/min。
  - 申请：<https://finnhub.io/register>
  - 配置：`export FINNHUB_API_KEY=xxxxxx`，**首选写入 `~/.zshenv`**（zsh non-interactive 也读，对 Claude Code Bash 工具生效），其次 `~/.zshrc` / `~/.bashrc`（仅交互 shell 读，本 skill 已对这类文件做兜底加载）
  - 未配置时本 skill 仅返回 Polymarket + Tavily 数据，并在输出顶部标注 `⚠️ Finnhub 未配置`

### Key 检查命令（**重要**：Claude Code Bash 工具是 non-interactive non-login shell，默认不读 `~/.zshrc`）

每次调用本 skill 前**先跑一次**这段——它会先尝试从用户 rc 文件中提取 key，再判断是否真的未配置：

```bash
# Step 1：直接从 rc 文件 grep export 行（避开 sourcing zsh-only 语法的兼容性问题）
if [ -z "${FINNHUB_API_KEY:-}" ]; then
  for rc in ~/.zshenv ~/.zshrc ~/.bash_profile ~/.bashrc ~/.profile; do
    [ -f "$rc" ] || continue
    KEY=$(grep -E '^[[:space:]]*export[[:space:]]+FINNHUB_API_KEY=' "$rc" 2>/dev/null \
          | tail -1 \
          | sed -E 's/^[[:space:]]*export[[:space:]]+FINNHUB_API_KEY=[[:space:]]*//; s/^["'"'"']//; s/["'"'"'][[:space:]]*$//')
    if [ -n "$KEY" ]; then
      export FINNHUB_API_KEY="$KEY"
      break
    fi
  done
fi

# Step 2：仍为空才确认是真没配
if [ -z "${FINNHUB_API_KEY:-}" ]; then
  echo "⚠️ FINNHUB_API_KEY 未设置 — 美国经济日历与美股财报日历不可用"
  echo "  申请：https://finnhub.io/register"
  echo "  配置：export FINNHUB_API_KEY=xxxxxx，首选写入 ~/.zshenv（non-interactive shell 也生效）"
fi
```

⛔ **禁止简化为 `if [ -z "$FINNHUB_API_KEY" ]; then echo 未配置`** —— Claude Code Bash 工具默认不 source `~/.zshrc`，会把已配置的 key 误报为未配置。Step 1 的 rc 文件 grep 是必须的兜底。

🔒 **安全提醒**：Step 1 的 grep 只读取本地文件、不外发。但**不要在对话里直接 echo $FINNHUB_API_KEY** 或 `cat ~/.zshrc | grep KEY`——key 一旦进入对话日志就视为泄露，需 <https://finnhub.io/dashboard> 旋转。

## 标准输入

调用方（用户或其它 skill）需要给出：

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `from` | 否 | 今天 | UTC 日期 `YYYY-MM-DD` |
| `to` | 否 | 今天 + 14 天 | UTC 日期 |
| `symbols` | 否 | 空 | 关心的标的列表，影响 Finnhub `/calendar/earnings?symbol=...` 是否单独拉某只票 |
| `region` | 否 | `US` | `US` / `HK` / `BOTH`，影响 Tavily 搜索关键词与是否启用港股财报兜底 |

### 窗口外关键政策决议白名单（重要）

主表默认按 `from` ~ `to` 严格筛选，但**以下几类决议属于"窗口外但市场必看"**，只要发生在 `to + 30 天`内就**允许进主表**，并在事件名后追加 `（窗口外但关键）`标记：

- FOMC 利率决议 + SEP / 点阵图（Fed）
- ECB 利率决议（欧央行）
- BOJ 货币政策会议（日银）
- PBOC LPR 报价（每月 20 号）
- HKMA 议息

**不进白名单的越界事件**（如越界的财报、二级经济数据、PMI Flash 等）：
- 不进主表
- 进「📌 窗口外预告」小节，简表展示，仅作信息

判断逻辑伪代码：

```
if event.date in [from, to]:                    主表
elif event.type in 白名单 and event.date in [to, to+30d]:  主表 + 标"窗口外但关键"
elif event.date in [to, to+30d]:                窗口外预告小节
else:                                            丢弃
```

## 数据源 A：Finnhub

### A1. 全球经济数据日历

```bash
FROM=$(date -u +%Y-%m-%d)
TO=$(date -u -v+14d +%Y-%m-%d 2>/dev/null || date -u -d '+14 days' +%Y-%m-%d)

# 国家范围：US（美国）+ EA（欧元区）+ DE（德国）+ JP（日本）+ CN（中国）+ HK（香港）
# 不要只过滤 US——ECB/日银/中国 PMI 对全球资产定价同样关键
curl -sS "https://finnhub.io/api/v1/calendar/economic?from=${FROM}&to=${TO}&token=${FINNHUB_API_KEY}" \
  | jq '.economicCalendar[] | select(.country | IN("US","EA","DE","JP","CN","HK"))'
```

返回字段：`country / event / time / impact / actual / estimate / prev / unit`

**impact 字段含义**（Finnhub 自定义）：`high` = 大概率引发市场反应（如 CPI、非农、FOMC），`medium` = 二级数据（PCE、零售销售），`low` = 长尾数据（次要库存）。**只展示 high + medium，过滤 low**。

**衍生事件必须回看（避免上一版 bug）**：当返回结果包含 **Minutes / Reports / Summary of Economic Projections / Beige Book** 这类"会议后衍生事件"时，必须在该行下方加一行回看说明，标注**原始事件日期**。否则用户会误以为系统漏列了原始决议：

```
| 05-20 18:00 | FOMC Minutes | 货币政策 | — | finnhub |
|             | ↳ 原始决议 5/7 已发布（保持 4.25-4.50%；下次会议 6/17-6/18） | | | |
```

**全球宏观节点必抓清单**（即便 country 没命中，也通过 Tavily 兜底确认日期）：

| 事件 | 频率 | 影响范围 |
|------|------|---------|
| FOMC Rate Decision | 8 次/年 | 全球风险资产 |
| ECB Rate Decision | 6 周/次 | EUR + 全球流动性 |
| BOJ Policy Meeting | 8 次/年 | JPY + 套息交易 |
| PBOC LPR 报价 | 每月 20 号 | A 股 + HK |
| HKMA 议息 | 跟随 FOMC 后第 2 日 | HK |
| US CPI / Core PCE | 月度 | 全市场 |
| US 非农就业 | 月度第一个周五 | 全市场 |
| 中国 PMI（官方+财新） | 月度 | A 股 + 港股 |

### A2. 美股财报日历

```bash
# 全市场未来 14 天财报
curl -sS "https://finnhub.io/api/v1/calendar/earnings?from=${FROM}&to=${TO}&token=${FINNHUB_API_KEY}" \
  | jq '.earningsCalendar[] | {date, symbol, hour, epsEstimate, revenueEstimate}'

# 单只票（如果调用方传 symbols）
curl -sS "https://finnhub.io/api/v1/calendar/earnings?from=${FROM}&to=${TO}&symbol=NVDA&token=${FINNHUB_API_KEY}" \
  | jq '.earningsCalendar[]'
```

`hour` 字段：`bmo` = before market open（盘前），`amc` = after market close（盘后），`dmh` = during market hours（盘中，少见）。

**财报日历过滤规则**：
- 全市场场景：只保留 EPS estimate ≥ \$0.5 或 revenue ≥ \$1B 的票（避开小票噪声）
- 单票场景：直接返回，不过滤

**数字格式硬规则（避免上一版 bug）**：
- ⛔ **禁止省略前导整数位**：`12876543000` 必须写成 `12.9B`，**不许写 `.88B` / `2.88B` / `12876.5M`**——前导数字一旦丢，读者会差一个数量级
- ✅ Revenue 统一精度：`X.XB`（≥ 1B）/ `XXXM`（< 1B）；EPS 保留 2 位小数
- ✅ 货币单位**必须显式标**：USD / CNY / HKD（中概股 BABA/PDD/BIDU/NTES 等用 CNY，FUTU 港股用 HKD），缺货币单位 = 数据无效
- ✅ 同一行多个数字时（共识 EPS / Rev），用斜杠分隔且**显式带单位**：`EPS 1.06 USD / Rev 12.9B USD`
- ⛔ **禁止把多个标的的 EPS/Rev 数字串在一格里**——例如不许 `2.97 / .99B；5.00 / .41B` 这种紧凑写法（人眼根本对不上是 DELL 还是 COST）。如果一定要并排展示，每个标的独立成行

### A3. 限流与错误处理

- 免费版 60 calls/min，本 skill 单次调用最多 3 次（经济日历 1 次 + 财报日历 1-2 次），完全够用
- HTTP 401 → key 无效，提示用户检查 `FINNHUB_API_KEY`
- HTTP 429 → 限流，sleep 60s 后重试一次
- 网络错误 → 标"Finnhub 暂不可用"，继续跑 Polymarket + Tavily

## 数据源 B：Polymarket

### B1. 拉取活跃市场

```bash
curl -sS "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=100&order=volume24hr&ascending=false" \
  | jq '.[] | select(.volumeNum > 50000) | {question, slug, endDate, volumeNum, outcomes, outcomePrices, description}'
```

关键字段：

| 字段 | 含义 |
|------|------|
| `question` | 市场标题，例如 "Will the Fed cut rates by 25bps in May?" |
| `outcomes` | `["Yes", "No"]` 数组 |
| `outcomePrices` | 与 outcomes 对齐的价格数组，0-1 之间，**这就是市场隐含概率** |
| `volumeNum` | 累计成交量（USD） |
| `endDate` | 市场结算日期（ISO 8601） |
| `slug` | 用于拼出 URL：`https://polymarket.com/event/{slug}` |

### B2. 分类与过滤

Claude 读取每条市场的 `question + description`，按以下分类映射，**只保留前四类**：

| 分类 | 关键词识别 | 例子 |
|------|----------|------|
| 货币政策 | Fed, FOMC, rate cut, rate hike, basis points, BOE, ECB, BOJ | "Fed cuts rates 25bps in May" |
| 经济数据 | CPI, inflation, recession, unemployment, GDP, jobs report | "US recession in 2026" |
| 行业/产业政策 | tariff, ban, regulation, antitrust, executive order, SEC, FTC | "Trump raises China tariffs by July" |
| 地缘 | war, ceasefire, Taiwan, North Korea, sanctions | "Russia-Ukraine ceasefire by Q3" |
| ❌ 过滤掉 | 体育、娱乐、Crypto coin price target、明星八卦 | — |

### B3. 输出格式与流动性门槛（**硬规则**）

**流动性门槛**（**禁止自行收紧到 $1M / $5M / $10M**——会把 Fed/CPI 中等流动性市场全部筛掉；**也禁止把低流动性市场塞进 Top 5**）：

| 24h vol 区间 | 主表（Top 5） | 附加可关注 / 备选 |
|------------|--------------|------------------|
| < $50k | ❌ 不采纳 | ❌ 不采纳 |
| $50k - $200k | ❌ **不许进 Top 5** | ✅ 进「附加可关注」小节，标"低流动性参考" |
| > $200k | ✅ 主表 Top 5 | — |

**Top 5 主表必须满足**：每条 vol > $200k；不满足条数即便 < 5 也允许（"Top N" 而非硬凑 5）。如果窗口内 vol > $200k 的市场不足 5 条，主表只列实际条数，不要为凑数把低流动性市场拉上来。

**链接强制**：Polymarket slug **必须**输出为完整可点 URL，**不允许用 `link` / `url` / `slug` 等文字占位**：

```
https://polymarket.com/event/<slug>
```

**单条市场标准输出**：

```
- [货币政策] Fed cuts 25bps in May 2026: Yes 73% / No 27% (vol $2.3M, 截止 2026-05-15)
  https://polymarket.com/event/fed-cuts-25bps-may-2026
```

**Top 5 主表必须包含的列**：分类 / 市场标题（完整不缩写）/ Yes-No 价 / 24h vol（带 $ 和单位）/ 截止日期 / **完整 URL**。任何一列缺失 = 数据无效。

## 数据源 C：Tavily（中港政策与行业事件兜底）

适用于 Finnhub 不覆盖的场景：

- 中国央行 / HKMA 利率会议
- 中港行业政策（"AI 大模型监管"、"新能源补贴"、"医药集采"）
- 重要经济数据释放（社融、PMI、出口、地产销售）

### C1. 默认关键词组（region = HK 或 BOTH 时启用）

并行调用 4 条 Tavily 查询（参考 `references/query-templates.md` 完整模板）：

```
Q1: "PBOC rate decision next meeting" OR "中国人民银行 利率决议 下次"
Q2: "HKMA policy meeting schedule" OR "香港金管局 议息"
Q3: "China economic data release calendar next week" (限近 7 天)
Q4: "中港 政策 监管 新闻" (限近 3 天，配 region 关键词)
```

### C2. 调用示例

```
mcp__plugin_tavily-web-search_tavily-web-search__tavily_search(
  query="PBOC rate decision next meeting May 2026",
  max_results=5,
  topic="news",
  days=7
)
```

### C3. 结果筛选

只采纳同时满足以下条件的结果：

1. URL 含日期或日期出现在 `published_date`
2. 内容明确提到一个**未来日期**（not 过去式）
3. 来源可信（路透 / Bloomberg / 财新 / 21 财经 / 香港金管局官方等优先）

不满足的结果列入"参考线索"区，不进主表。

## 整合输出 schema

按时间升序合并三源结果，统一为下表。详细模板见 `references/report-template.md`：

```markdown
## 📅 前瞻事件日历 · {FROM} 至 {TO} · 数据时点 {now UTC}

> 数据源：Finnhub {✅/❌} · Polymarket {✅/❌} · Tavily {✅/❌}
> 时区：日期默认 UTC，括号内标注 HKT（UTC+8）/EST

| 日期(UTC) | 事件 | 类型 | 影响标的 | 市场预期 / 隐含概率 | 信源 |
|-----------|------|------|---------|-------------------|------|
| 2026-05-13 (HKT 05-13) | NVDA Q1 FY27 财报 (amc) | 财报 | US.NVDA | EPS $0.74 / Rev $43.2B (Finnhub consensus) | finnhub |
| 2026-05-15 (HKT 05-16) | FOMC 利率决议 | 货币政策 | US 全市场 | 降息 25bp 73% (Polymarket vol $2.3M) | polymarket + finnhub |
| 2026-05-20 | 中国 LPR 报价 | 货币政策 | HK / 港股通 | LPR 1Y 维持 3.1% (财新预期) | tavily |

### Polymarket 高流动性宏观押注 Top 5
（同上格式，但保留 question 全文 + slug 链接）

### 参考线索（未确认日期，仅作信息）
- ...
```

## 调用接口（被其它 skill 调用时）

### market-scanner 调用

market-scanner 在 L4「催化」维度和 L5 产业链外推时调用本 skill：

```
任务：扫 US 板块未来 14 天催化
输入：from=今天, to=今天+14, region=US
要本 skill 给：经济日历 + 涉及 Top 板块成分股的财报日历 + Polymarket 宏观押注
```

输出格式见上文整合 schema。

### stock-analyzer 调用

stock-analyzer 在维度 9「事件日历」调用本 skill：

```
任务：列出 NVDA 未来 14 天事件
输入：from=今天, to=今天+14, symbols=[NVDA], region=US
要本 skill 给：NVDA 财报日 + 影响 NVDA 的宏观节点（FOMC / CPI / 中美关税相关 Polymarket 市场）
```

宏观节点筛选规则：所有美股 = FOMC + CPI + 非农 + 关税相关 Polymarket；中概股额外加 PBOC + 中美贸易；半导体额外加芯片出口管制相关 Polymarket / Tavily。

## 失败模式与降级

| 场景 | 行为 |
|------|------|
| `FINNHUB_API_KEY` 未设置 | 跳过数据源 A，标注顶部"⚠️ Finnhub 未配置"，继续 B + C |
| Finnhub 401 / 网络错误 | 同上 |
| Polymarket Gamma API 5xx | 跳过 B，标注"⚠️ Polymarket API 暂不可用"，继续 A + C |
| Tavily 无结果 | C 区域显示"未检索到符合条件的政策日程"，不影响 A + B |
| 三源全部失败 | 输出"⚠️ 三个数据源全部不可用，无法生成日历"，不强行编内容 |

## 输出原则（重申）

1. 每条事件必须能追溯到信源链接，**不编日期、不编共识值**
2. 估计值与实际值不混用——`actual` 字段为空就标"待发布"，不要写预测数字
3. Polymarket 隐含概率永远附带 24h volume，让读者自己判断流动性是否足够
4. 时间窗口默认 14 天；用户明确说"下个月""下季度"再扩到 30 / 90 天
5. 不出买卖指令，不写"建议关注 / 利好 / 利空"——这是事件清单，不是判断
