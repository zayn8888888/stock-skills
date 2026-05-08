---
name: stock-analyzer
description: 个股多维分析助手。基于富途 OpenAPI 实时行情数据 + Tavily 新闻搜索，对单只股票做行情、技术、估值、资金、盘口、同行、新闻、期权链八个维度的综合分析，输出结构化分析报告。触发场景：(1) 用户要求"分析 XXX / XXX 怎么样 / XXX 值不值得买 / 帮我看看 XXX"；(2) 用户问"XXX 为什么涨/跌 / 能不能抄底 / 要不要加仓减仓 / 现在是利空出尽了吗 / 机构在赌什么方向"；(3) 用户提到个股并想了解基本面/技术面/衍生品综合情况。不适用于：纯指数/板块分析、宏观研究、纯财报深度解读。
---

# 个股多维分析

## 核心原则

1. **数据先行，结论在后**：每个判断必须有具体数据支撑，不编造、不夸大
2. **多空并陈，不做单边**：同时列出利多 / 利空 / 风险，帮用户建立完整决策框架
3. **拒绝迎合语气**：即使用户倾向某方向（如"是不是利空出尽了"），也要客观列出反驳论据
4. **不出买卖指令**：只提供分析框架和数据，不说"建议买入/卖出"；最终决策权交给用户
5. **标注数据时效**：行情数据标清时点，新闻/公告标清日期，避免用户把旧信息当新信息

## 前置依赖

本 skill **依赖一个能调用富途 OpenAPI 的 skill / 脚本集**（例如社区 `futuapi` skill），自身不包含任何富途脚本。如果 OpenD 未运行，提示用户先启动 OpenD。脚本路径请替换为你本地实际安装位置（例如 `~/.claude/skills/futuapi/scripts/` 或 `skills/futuapi/scripts/`）。

如果用户给出的是中文名或英文简称（如"五粮液"、"JPM"），请映射为富途完整代码。富途代码格式：

- **港股**：`HK.XXXXX`（5 位数字补零，如 `HK.00700` 腾讯、`HK.09988` 阿里）
- **美股**：`US.TICKER`（如 `US.TSLA`、`US.NVDA`、`US.JPM`）
- **A 股沪市**：`SH.XXXXXX`（6 位，如 `SH.600519` 茅台）
- **A 股深市**：`SZ.XXXXXX`（6 位，如 `SZ.000858` 五粮液）
- **期权简写代码**：交给富途脚本 `resolve_option_code.py` 解析，不要手工拼
- **不确定代码时**用 Tavily 或 WebSearch 确认一次，不要猜错代码后继续往下拉数据

## 分析流程（八维度）

收集数据时**能并行的工具一次性并行调用**以节省时间。数据齐全后再统一输出报告。

### 维度 1：基础行情（必做）
```bash
python3 skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
```
提取：现价 / 开盘 / 最高 / 最低 / 昨收 / 成交量 / 成交额 / 涨跌幅 / 振幅。

### 维度 2：技术走势（必做）
```bash
python3 skills/futuapi/scripts/quote/get_kline.py <CODE> --ktype 1d --num 30 --json
```
重点：近 30 日高点 / 低点 / 当前相对位置 / 是否破位 / 量价配合 / 短期均线关系（5/10/20 日可自行计算）。

### 维度 3：估值与基本面（必做）
```bash
python3 skills/futuapi/scripts/quote/get_stock_info.py <CODE> --json
```
提取：PE-TTM / PB / 股息率 / 总市值 / 流通市值 / 52 周高低 / 换手率。

### 维度 4：资金流向（必做）
```bash
python3 skills/futuapi/scripts/quote/get_capital_flow.py <CODE> --json
python3 skills/futuapi/scripts/quote/get_capital_distribution.py <CODE> --json
```
重点：**主力资金**（超大单+大单）净流入/流出 / 当日分钟级资金变化趋势 / 散户接盘还是出货。

### 维度 5：盘口与成交（必做）
盘口和逐笔需要先订阅：
```bash
python3 skills/futuapi/scripts/subscribe/subscribe.py <CODE> --types ORDER_BOOK TICKER
python3 skills/futuapi/scripts/quote/get_orderbook.py <CODE> --num 10 --json
python3 skills/futuapi/scripts/quote/get_ticker.py <CODE> --num 30 --json
```
重点：买卖盘深度对比 / 近 30 笔成交方向占比 / 大单集中度。

### 维度 6：同行对比（推荐）
```bash
python3 skills/futuapi/scripts/quote/get_owner_plate.py <CODE> --json
python3 skills/futuapi/scripts/quote/get_plate_stock.py <PLATE_CODE> --limit 20 --json
```
从板块成分股中选 **2-3 家业务相近、市值相近** 的同行，对比 PE-TTM / PB / 股息率 / 当日涨跌幅。

### 维度 7：新闻与事件（推荐）

**核心原则**：单 query 必漏。Tavily 的 `news` topic 偏英文主流媒体，中文社交媒体、投资人言论、做空报告常在覆盖范围之外。要**并行覆盖四类信号源**，每类至少一条 query：

| 信号源 | 为什么要单独查 | query 取向 |
|--------|---------------|-----------|
| **官方动态** | 财报、公告、指引、回购、管理层 | 公司名双语 + 业务关键词，`news` topic |
| **投资人与社交媒体** | 知名持仓人喊话、雪球/X 热帖、散户关注度 | 公司中文名 + 「重仓 加仓 减持 喊话 sell put」等动作词，`general` topic |
| **监管与做空** | 诉讼、调查、停牌、做空报告、禁令 | 公司名 + 「调查 做空 short report 停牌」，`news` topic，days 拉长到 60 |
| **市场结构**（按市场可选） | 港股：南向/沽空/大行评级；美股：13F/分析师评级 | 代码 + 市场专属术语 |

**并行执行**：4 条 query 一次性并行调用，不要串行。

**关键词怎么选**：
- **投资人 / 做空机构名字不是白名单**，是「有谁在这只票上发过声」决定的。先用泛词搜一轮（「知名投资人 重仓 <公司名>」、「short report <公司名>」），看谁跳出来，再定向补查。硬编码名字列表在不同股票上会漏掉当下真正活跃的人。
- 若期权或资金维度出现异常（单 strike OI 极端堆积、大额大宗交易、异常沽空比），用**该异常数字或仓位量**作关键词反向搜——金额/仓位往往比名字更容易命中中文报道。

**报告里一定要单列的事件类型**：
- 财报关键数据、回购分红、指引修订、管理层变动
- 诉讼 / 调查 / 退市风险 / 关税或禁令
- 有名有姓的机构或个人新增/加仓/减仓/清仓 / 期权大额动作
- 空头报告 / 做空比率异常变化
- 港股：南向资金连续 N 日净流入/流出、沽空比率突破阈值
- 美股：13F 大幅增减持、主流投行评级变动

### 维度 8：期权链扫描（有期权市场的个股推荐，A 股跳过）

**触发条件**：美股 / 港股（HK/US 前缀）且正股支持期权；A 股 / 新加坡等无期权市场直接跳过并在报告中标注"本市场无期权，跳过"。

**步骤**：

```bash
# 8.1 取最近 1-2 个到期日（优先近月与次近月，避免长尾无流动性合约）
python3 skills/futuapi/scripts/quote/get_option_expiration_date.py <CODE> --json

# 8.2 取指定到期日范围的期权链
python3 skills/futuapi/scripts/quote/get_option_chain.py <CODE> --start <EXPIRY1> --end <EXPIRY2> --json
```

**筛选范围（重要）**：**默认值 ±10%/±15% 是不够的**。OI 堆积点经常落在深度 OTM（机构保护位、大额 sell-put 锚定价都在这里），默认窗口会直接漏掉。原则：**扫描范围由数据决定，不由默认值决定**。

1. **先拉整条链的 strike 列表**（`get_option_chain` 只返回代码 + strike，不含 OI）——这一步只看 strike 分布就能判断要扫多宽。港股建议至少 ±20%，美股 ±15% 起步；若 strike 稀疏（每档间隔 >5%），再放宽一档。
2. **分批订阅 + 快照**：单次订阅 ≤12 合约（超出触发"未知股票"错误），用 N 批覆盖完整范围。例如 30 个 strike × 2（C/P）= 60 个合约 → 分 5 批。
3. **先扫 Put 后扫 Call**：支撑位信号通常比阻力位更强（sell-put 集中度 > call 卖方动机），预算有限时先 Put。
4. **扫完看 OI 分布再决定要不要再扩**：如果最外档（±20% 边缘）OI 仍显著，说明市场关注位还在更远处，必须再加一批。反之若 OI 尾部归零就可以收手。

```bash
# 8.3 批量订阅并拉取期权完整数据（OI / IV / Greeks / 买卖盘）
# 分批，每批 ≤12 合约
python3 skills/futuapi/scripts/subscribe/subscribe.py <OPT1..OPT12> --types QUOTE
python3 skills/futuapi/scripts/quote/get_stock_quote.py <OPT1..OPT12> --json
# 重复，直到覆盖 ±20% 全范围
```

**重要**：期权数据**必须用 `get_stock_quote.py`**，不要用 `get_snapshot.py`。snapshot 对期权只返回 `last_price/bid/ask/volume/turnover`，**不含 OI/IV/Greeks**；stock_quote 才返回完整期权字段：`open_interest`（未平仓）/ `implied_volatility`（IV）/ `delta|gamma|theta|vega|rho`（希腊字母）/ `strike_price`（行权价）/ `expiry_date_distance`（距到期天数）/ `last_price` / `volume`。

**为什么非要扫宽**：当 OI 在深度 OTM 出现单点极端堆积时，如果窗口没覆盖到，P/C OI 比、Max OI、IV skew 全部会被带偏，结论可能完全反向。这种堆积可能来自（按常见度递减）：机构保护性对冲、知名投资人 sell-put 建仓、做市商围绕事件预留的库存。任何一类漏掉都会造成"结构性误读"。扫描成本远低于误判成本。

**核心判断指标**：

| 指标 | 计算 | 含义 |
|------|------|------|
| Put/Call OI 比 | Σ Put OI / Σ Call OI | >1 偏空持仓；<0.7 偏多持仓；注意长期结构性对冲会让港股指数 ETF 偏高 |
| Put/Call Vol 比 | 当日 Σ Put Vol / Σ Call Vol | 短期情绪，日内变化比 OI 更敏感 |
| Max OI 行权价 | OI 最大的 Call / Put strike | Call Max OI → 潜在阻力（卖方压盘动机）；Put Max OI → 潜在支撑 |
| 异常成交 | Vol / OI > 0.3 或 Vol > OI | 新开仓方向性押注，注意是否靠近财报/事件 |
| 买卖价差比 | (ask - bid) / mid | <5% 流动性良好；5-15% 一般；>15% 几乎无法交易，数据仅供参考 |
| IV Skew | 同到期日 OTM Put IV − OTM Call IV | 正 skew 越大 → 市场愿付更多保费对冲下行，尾部风险定价偏高 |
| ATM IV | ATM Call 与 Put 的 IV 均值 | 对比 HV（历史波动率）：IV > HV 预期波动扩大；IV < HV 预期平静 |
| Max Pain | 到期时所有期权买方总亏损最小的 strike | 到期日附近股价有向此收敛的统计倾向（非因果，只是结构） |

**质量门槛**（不满足则标注"数据不可信"）：

- 个券 OI = 0 且 Vol = 0 → 跳过，不要参与比例计算
- bid = 0 或 ask = 0 → 报价失效，剔除
- IV = 0 或 > 500% → 计算异常，剔除

**过滤与解读输出**：只给用户看 **Top 5 Call OI + Top 5 Put OI + 异常成交 Top 3**，不要把几十行原始数据倒出来。解读要把数字和股价位置挂钩：
- "Call Max OI 集中在 XXX（现价上方 X%），是主要阻力"
- "IV 24%，较 30 日 HV 18% 高 6pp，市场预期财报后波动显著"
- "Put/Call OI 比 1.4，偏空；但 Put OI 中 XXX 行权价占 45%，可能是机构保护性对冲而非方向性空头"

**单一 strike 极端堆积的识别与追查**：

- **识别标准（取任一）**：
  - 该 strike 的 OI 占同向（全 Call 或全 Put）总 OI 的 **>50%**，或
  - 该 strike 的 OI 是第二大 strike OI 的 **>3 倍**，或
  - 名义金额（OI × 行权价 × lot_size）达到该股流通市值的 **1% 以上**
- **lot_size 必查**：美股期权 1 张 = 100 股，港股 1 张一般 = 100 或 200 股（须从期权合约字段 `lot_size` 读取，不要猜），A 股场内股票期权 1 张 = 10000 股（ETF 期权 10000 份）。lot_size 算错名义金额会差一个数量级。
- **追查动作**：达到识别标准即视为"事件级"仓位，报告必须单独高亮。用当日相关新闻（大额期权、sell put、知名机构动作、做空报告等关键词 + 公司名/代码）反向搜索，挖出背后是谁、为什么、是否已公开表态。

## 输出格式

完整模板见 [references/report-template.md](references/report-template.md)，骨架如下：

```markdown
## 📊 <名称>(<CODE>) 多维分析 · YYYY-MM-DD HH:MM

### 1. 行情速览
### 2. 技术面
### 3. 估值水平
### 4. 资金面
### 5. 盘口情绪
### 6. 同行对比
### 7. 新闻与事件
### 8. 期权链（可选，无期权市场跳过）

### 💡 综合研判
- **利多**：...
- **利空**：...
- **风险提示**：...
- **关键信号**（等待什么信号确认拐点）：...
```

## 常见陷阱

详细解读见 [references/metrics-interpretation.md](references/metrics-interpretation.md)。速记要点：

- **PE 失真**：周期股底部 PE 反而高；会计差错更正后 PE 可能严重失真；亏损股无 PE
- **资金流向仅参考**：单日主力净流入不等于后续上涨，看 3-5 日趋势更可靠
- **盘口可伪造**：大额挂单可能是诱多/诱空，需结合逐笔成交方向验证
- **股息率陷阱**：高股息率可能是股价下跌推高的假象，要看历史分红稳定性
- **成交量零值**：非交易时段 / 停牌股 get_snapshot 会返回 0，不要误判为"无人成交"
- **期权 OI ≠ 方向**：高 Put OI 可能是机构买保险（bullish 对冲）而非看空；判断方向要看新开仓方向（Vol/OI）和 IV skew，单看 OI 容易误读
- **期权 Max Pain 非因果**：只是到期日大量 OI 集中时做市商对冲形成的统计倾向，远离到期日参考价值很低
- **港股期权流动性稀薄**：多数港股期权 bid-ask 价差 >20%，除腾讯/友邦/阿里等极少数标的，数据噪声大于信号

## 什么时候答"不确定"

明确告诉用户**无法判断**，不要硬凑：

- OpenD 未连接 / API 调用失败
- 数据明显异常（PE 负值、成交量为 0）
- 预测性问题（"明天会涨吗"、"一周后多少"）

## 输出调性

- 克制中性，不用"强烈推荐"、"必涨"、"肯定跌"等绝对化表述
- 金额用"亿/万"口径，百分比保留 1-2 位小数
- 关键数据用粗体 / 表格强化，避免大段文字
- 用户只追问某一维度时展开该维度，否则按七维度模板全景输出
