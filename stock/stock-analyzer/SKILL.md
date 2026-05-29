---
name: stock-analyzer
description: 个股多维分析助手。基于富途 OpenAPI 实时行情数据 + Tavily 新闻搜索 + event-calendar 事件日历 + hyperliquid-perps 链上永续镜像（美股 / 美元资产维度 4 资金面追加），对单只股票做行情、技术、估值、资金（含链上 funding）、盘口、同行、新闻（回看）、期权链、事件日历（前瞻）九个维度的综合分析，输出结构化分析报告。触发场景：(1) 用户要求"分析 XXX / XXX 怎么样 / XXX 值不值得买 / 帮我看看 XXX"；(2) 用户问"XXX 为什么涨/跌 / 能不能抄底 / 要不要加仓减仓 / 现在是利空出尽了吗 / 机构在赌什么方向"；(3) 用户提到个股并想了解基本面/技术面/衍生品综合情况。不适用于：纯指数/板块分析、宏观研究、纯财报深度解读。
---

# 个股多维分析

## 核心原则

1. **数据先行，结论在后**：每个判断必须有具体数据支撑，不编造、不夸大
2. **多空并陈，不做单边**：同时列出利多 / 利空 / 风险，帮用户建立完整决策框架
3. **拒绝迎合语气**：即使用户倾向某方向，也要客观列出反驳论据
4. **不出买卖指令**：只提供分析框架和数据，最终决策权交给用户
5. **标注数据时效**：行情数据标清时点，新闻/公告标清日期

## 前置依赖

富途 OpenAPI（需 OpenD）脚本集安装在 `~/.claude/skills/futuapi/scripts/`，命令→SDK 对照表见 [references/sdk-setup.md](references/sdk-setup.md)。

## 执行前必读（收到任务后第一步，不与任何分析并行）

```bash
Read references/methodology.md          # 各维度判断逻辑
Read references/metrics-interpretation.md  # 指标解读与常见陷阱
Read references/report-template.md     # 完整报告模板
```

## 执行契约

**硬约束，不满足不出报告**：

1. **九个维度全部覆盖**——核心维度全量展开，非核心维度可压缩为一行结论。维度 1-7 必做；维度 8 对美股/港股必做，A 股明确标注"本市场无期权，跳过"（也算覆盖）；维度 9 必做，event-calendar 未安装时降级并标注
2. **能并行的工具一次性并行调用**，数据齐全后统一输出报告。**并行批次仅放同质、低风险调用**（如同时拉 5 只同行快照）；参数未验证或可能出错的调用单独一批，不与其他调用混排，防止连锁 cancel
3. **核心维度调用报错必须重跑（最多 3 次，3 次后标注原因继续）**；非核心维度报错标注 ❌ 跳过并从 Tavily 补一行；维度 8 对 A 股可以是一行"本市场不支持期权，跳过"（也算覆盖）；禁止用"订阅限制"/"执行中"/"无镜像"等模糊话术替代未真正执行的调用
4. **每个维度结尾加数据完整性自检**：列出本维度所有工具 + 调用结果（✅成功 / ❌失败原因 / ⏭️跳过原因）
5. **每张表、每段精细数据必须标来源**：格式 `[来源: 脚本名]` 或 `[来源: Tavily "<关键词>"]`；缺来源标签的数字禁止出现在报告中
6. **输出前必须 `Read references/checklist.md` 逐项自检，不满足不出报告**

## 分析流程（九维度）

### ⚡ Step 0：代码格式标准化（必做，**单独执行，不与任何其他调用并行**）

> **这是最常见的连锁失败根因**：用裸 ticker 调脚本会报格式错误，同批其余调用全部 cancel。

1. **将用户输入的 ticker 补全为富途格式**（在脑子里做，不需要调工具）：
   - 纯英文字母 1-5 位 → `US.<TICKER>`（`FUTU` → `US.FUTU`，`NVDA` → `US.NVDA`）
   - 港股 → `HK.XXXXX`（5 位数字补零，小米 `01810` → `HK.01810`）
   - A 股 → `SH.XXXXXX`（沪）或 `SZ.XXXXXX`（深）

2. **单独运行一次快照验证**，确认代码格式和 OpenD 连通性后再展开所有并行：
   ```bash
   python3 ~/.claude/skills/futuapi/scripts/quote/get_snapshot.py <NORMALIZED_CODE> --json
   ```
   - ✅ 成功 → 后续所有调用统一使用 `<NORMALIZED_CODE>`
   - ❌ 报格式错误 → 停止，向用户确认代码
   - ❌ 连接失败 → 停止，提示启动 OpenD

### Step 0.5：意图路由（必做，代码验证通过后执行）

判断用户意图，选择执行路径：

| 触发词 | 路径 |
|--------|------|
| "分析 / 帮我看看 / 怎么样" | **全景分析**：九维度全量 + 标准综合研判 |
| "能买吗 / 该加仓 / 该减仓 / 现在上车" | **决策导向**：九维度全量 + 综合研判升级为加权版（含核心矛盾权重 + 置信度 + 证伪条件 + 有效期） |
| "估值贵吗 / 技术面怎样 / 资金在进还是出" | **单点深挖**：只跑相关 2-3 维度 + 同行对比 |

意图不明时默认全景分析。

### 维度 1：基础行情（必做）
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
```
提取：现价 / 开盘 / 最高 / 最低 / 昨收 / 成交量 / 成交额 / 涨跌幅 / 振幅。

**盘前/盘后/夜盘（美股专属，有数据时必须展示）**：JSON 里出现 `pre_price` / `after_price` / `overnight_price` 字段（非零）时，逐段列出价格、涨跌幅、高低点、成交量。A 股/港股无这些字段，跳过即可。

### 维度 2：技术走势（必做）
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_kline.py <CODE> --ktype 1d --num 30 --json
```

拿到 K 线后，**先执行异动强制扫描，再做常规分析**：

> **⚠️ 异动强制扫描**：检查近 30 日是否存在「单日绝对涨跌幅 > 15% 且量比 > 5x」事件。若有：
> 1. **暂停后续所有维度**，并行调用：
>    - `get_corporate_actions_stock_splits.py <CODE> --json`（排除拆股）
>    - `get_corporate_actions_dividends.py <CODE> --json`（排除特别股息）
>    - Tavily：`<公司中文名> <YYYY-MM-DD> 暴跌 OR 暴涨 OR 催化`（days=14）
> 2. 调查结论写入报告后，**继续执行剩余维度**；所有后续维度（估值/资金/技术）的数字均须显式标注"含断层日 \<日期\>"并附调查结论。

常规分析重点：近 30 日高低点 / 当前相对位置 / 是否破位 / 量价配合 / 短期均线关系。**必须调用** `Skill("futu-technical-anomaly")` 拿量化技术信号清单，与人工解读交叉校验（不可用 Python K 线脚本替代，不可省略）。

**相对强度（与常规分析并行拉取基准 K 线）**：

按市场选择基准代码——美股用 `US.SPY`（若 `get_owner_plate` 板块含 Technology / Semiconductor，改用 `US.QQQ`）；A 股用 `SH.000300`；港股用 `HK.HSI`。

```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_kline.py <BENCHMARK_CODE> --ktype 1d --num 30 --json
```

计算并输出三行（放在维度 2 末尾，紧凑格式）：

```
📐 相对强度（5日）
  vs 基准（SPY/000300/HSI）：股票 ±X.X% / 基准 ±X.X% → 超额 ±X.Xpp
  vs 板块（维度 6 数据）：  股票 ±X.X% / 板块 ±X.X% → 超额 ±X.Xpp
  个股 Alpha ≈ ±X.Xpp（市场 + 行业 Beta 已剥离）
  → 信号：[Alpha>+2pp：个股主导上涨] [Alpha 0±2pp：Beta 驱动] [Alpha<-2pp：跑输板块]
```

板块数据复用维度 6 已拉的同行涨跌幅中位数；基准 K 线是此处唯一额外调用。

### 维度 3：估值与基本面（必做）

**Step A**：`python3 ~/.claude/skills/futuapi/scripts/quote/get_stock_info.py <CODE> --json`  
提取：PE-TTM / PB / 股息率 / 总市值 / 流通市值 / 52 周高低 / 换手率。

**Step B（并行，需 OpenD）**：
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_valuation_detail.py <CODE> --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_research_rating_summary.py <CODE> --json
```
读取要点：
- `get_valuation_detail` JSON → `data.trend.valuation_percentile`（历史百分位）/ `data.trend.forward_value`（前瞻 PE）
- `get_research_rating_summary` JSON → `inst_rating_summary_list`（机构评级列表）
**降级规则**：
- `get_valuation_detail`：全市场可用（含 A 股），OpenD 不可用时跳过
- `get_research_rating_summary`：A 股不确定，失败时跳过，Tavily 补 `"<公司名> 分析师评级 目标价"`
- OpenD 完全不可用 → 整个 Step B 跳过，Tavily 补 `"<公司名> PE ratio analyst rating consensus"`

输出要点：PE 百分位（<0.2 低估 / >0.8 高估）/ 前瞻 vs 当前 PE 折溢价 / 同板块 PE 排名 / 分析师买卖持有比例。

### 维度 4：资金流向（必做）
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_capital_flow.py <CODE> --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_capital_distribution.py <CODE> --json
```
**必须调用** `Skill("futu-capital-anomaly")`（港股买卖经纪商榜 + 卖空异动，不可用 get_capital_flow.py 替代，不可省略）。

**美股标的额外调用 `hyperliquid-perps` skill**（链上 24/7 多空偏向）：OI ≥ 1M USD 正常引用；< 100k 跳过。funding APR > +100% = 极度多头拥挤，< -100% = 极度空头拥挤。港股除 BABA 外 OI < 100k，A 股无镜像，均跳过。

### 维度 5：盘口与成交（必做）
```bash
python3 ~/.claude/skills/futuapi/scripts/subscribe/subscribe.py <CODE> --types ORDER_BOOK TICKER
python3 ~/.claude/skills/futuapi/scripts/quote/get_orderbook.py <CODE> --num 10 --json
```
重点：买卖盘深度对比 / 近 30 笔成交方向占比 / 大单集中度。

**流动性评估**（用快照已有字段，无额外 API）：

```
日均成交额 = get_snapshot turnover 字段（当日）
计划仓位金额 = 用户持仓上限（若未提供，默认按组合 5% 估算）

冲击成本预警：if 计划仓位金额 / 日均成交额 > 3%
  → ⚠️ 冲击成本风险：建仓量约占日均成交 X%，建议分 2-3 日分批建仓

买卖价差预警（港股）：if (卖一价 - 买一价) / 现价 > 1%
  → ⚠️ 流动性溢价：实际买入成本高于报价约 X bp

港股小票额外标注：if 日均成交额 < HK$2000 万
  → ⚠️ 港股小票：大仓位冲击成本显著，参考价差≈X bp
```

### 维度 6：同行对比（必做）
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_owner_plate.py <CODE> --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_plate_stock.py <PLATE_CODE> --limit 20 --json
```
选 2-3 家业务相近、市值相近的同行，对比 PE-TTM / PB / 股息率 / 当日涨跌幅。

### 维度 7：公告与事件（回看，必做）

五个子模块顺序执行：

**7a 结构化公告（两级，非全部必做）**

**Tier 1（必做，并行）**：
```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_corporate_actions_dividends.py <CODE> --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_corporate_actions_stock_splits.py <CODE> --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_research_rating_summary.py <CODE> --json
```

**Tier 2（有触发线索才做）**：触发线索来自维度 2 的异动强制扫描结论：
- 维度 2 发现 K 线异动 + 无拆股/股息解释 → 查 `get_corporate_actions_buybacks.py`（是否有回购支撑）
- Tavily / news-search 报道高管减持 → 查 `get_insider_trade_list.py`
- Tavily / news-search 报道持股变动 → 查 `get_shareholders_holding_changes.py`

维度 2 → 维度 7 传导：维度 2 的异动调查结论必须在维度 7 开始前可用（通过上下文传递，不要重跑 Tavily）。维度 2 未触发异动 → Tier 2 三个脚本全部标注"无触发线索，跳过"。

A 股注意：`get_research_rating_summary` / `get_insider_trade_list` / `get_shareholders_holding_changes` 可能不支持，失败直接标 ❌，不走 fallback 链。

**7b AI 新闻解读（`futu-stock-digest` skill，必做）**
拿结构化结论：方向判断（bullish/bearish/neutral）+ 关键信号摘要，供后续综合研判消费。

**7c 原始新闻（`futu-news-search` skill，必做）**
补全原始链接列表，供溯源防 hallucination；关键词用**中文公司名**；零返回走 fallback 链。

**7d 软新闻（Tavily，必做）**
并行至少 2 条：`<公司名> 调查 做空 short report`（days=60）+ `<公司名> analyst rating downgrade upgrade`。

**7e 社区情绪（`futu-comment-sentiment` skill，可选）**
注意已知 keyword bug；调用后须做对照测试，命中 bug 切 Tavily 雪球替代。

价格异动 ≥5% 必做反向追溯；报告末尾必须列"未发现"显式证伪。

**维度 7 开始前必须 `Read references/news-search.md`**（fallback 链、futu-comment-sentiment bug 处理、歧义词对策、反向追溯模板均在此）。

### 维度 8：期权链（美股/港股必做，无期权市场明确标注跳过）

**两阶段强制流程**：

**阶段一**：先调 `futu-derivatives-anomaly` skill（快通道）。

**阶段二**：以下任一情形**必须立即走 Step 1-3 完整扫描**（取到期日 → 取期权链 → 批量订阅拉 OI/IV/Greeks），不得降级到 Tavily：
- 快通道返回任何错误码（含 -12301 DATA_UNAVAILABLE）
- 快通道返回"无异常"但用户追问机构布局/对冲流
- 出现单一 strike 极端堆积疑虑

扫描范围由数据决定（港股 ±20%，美股 ±15% 起步）；每批 ≤12 合约；必须用 `get_stock_quote.py` 不是 `get_snapshot.py`。禁止用"订阅限制"/"数据截断"等话术替代未真正执行的 Step 1-3 调用。

**维度 8 开始前必须 `Read references/options-chain.md`**（Step 1-3 完整命令、到期日选择策略、核心指标、单一 strike 极端堆积识别、财报临近时的 IV-implied 预期波动幅度计算均在此）。

### 维度 9：事件日历（前瞻，必做）

调用 `event-calendar` skill：`from=今天, to=今天+14天, symbols=[<CODE>], region=US/HK/BOTH`。未安装时 Tavily 单源降级并标注。宏观节点按标的属性筛选（半导体加芯片出口管制、中概股加 PBOC + 中美贸易等）。

## ⚠️ 输出前子 skill 完整性自检（所有维度执行完毕后、输出报告前必做）

填写以下表格。⛔ 的行必须**立即补调**，补调完成后标 ✅，才能继续输出报告：

| 维度 | 必调 skill | 状态 | 合法 N/A 条件 |
|------|-----------|------|--------------|
| 维度 2 | `futu-technical-anomaly` | □ ✅ / ⛔ | 无（必须调用） |
| 维度 4 | `futu-capital-anomaly` | □ ✅ / ⛔ | 无（必须调用） |
| 维度 4 | `hyperliquid-perps` | □ ✅ / N/A | A 股标的、港股（BABA 除外）可 N/A |
| 维度 7b | `futu-stock-digest` | □ ✅ / ⛔ | 无（必须调用） |
| 维度 7c | `futu-news-search` | □ ✅ / ⛔ | 无（必须调用） |
| 维度 8 | `futu-derivatives-anomaly` | □ ✅ / N/A | OI < 100k 或无期权市场可 N/A；A 股必须 N/A |

**禁止措辞**（出现即停止，立刻补调，不得继续输出）：
- "因时间约束跳过"
- "已用 Python 脚本获取了等效数据"
- "已有 Tavily 结果，无需调 skill"
- "数据充足，子 skill 不必要"
- "X skill 未逐个触发"（哪怕写在 data_gaps 里也算偷懒，必须补调）

## 输出格式

> **时间戳规则**：行情时点同时标 HKT 和 ET（HKT−12h=EDT / HKT−13h=EST）。盘前/盘中/盘后按 ET 判断：盘前 ET 04:00–09:30 / 盘中 ET 09:30–16:00 / 盘后 ET 16:00–20:00 / 美股休市 ET 20:00–04:00。

```markdown
## 📊 <名称>(<CODE>) 多维分析 · YYYY-MM-DD HH:MM HKT（ET HH:MM，<盘前/盘中/盘后/美股休市>）

### 1. 行情速览  ### 2. 技术面  ### 3. 估值水平
### 4. 资金面   ### 5. 盘口情绪  ### 6. 同行对比
### 7. 新闻与事件（回看）  ### 8. 期权链  ### 9. 事件日历（前瞻 14 天）

### 💡 综合研判
- **利多**：  - **利空**：  - **风险提示**：  - **关键信号**（等待什么信号确认拐点）：
```

## 常见陷阱速查

- **PE 失真**：周期股底部 PE 反而高；亏损股无 PE
- **资金流向仅参考**：单日净流入不等于后续上涨，看 3-5 日趋势
- **链上 funding ≠ 趋势预测**：反映当下拥挤度，需与现货资金流结合
- **港股链上镜像流动性不足**：除 BABA 外 OI < 100k，不要引用 funding 数字
- **盘口可伪造**：大额挂单需结合逐笔成交验证
- **期权 OI ≠ 方向**：高 Put OI 可能是机构买保险；判方向看新开仓方向和 IV skew
- **期权 Max Pain 非因果**：远离到期日参考价值很低

## 什么时候答"不确定"

- OpenD 未连接 / API 调用失败
- 数据明显异常（PE 负值、成交量为 0）
- 预测性问题（"明天会涨吗"）

## 输出调性

- 克制中性，不用"强烈推荐"、"必涨"、"肯定跌"
- 金额用"亿/万"口径，百分比保留 1-2 位小数
- 关键数据用粗体/表格强化，避免大段文字
- 用户只追问某一维度时展开该维度，否则按九维度全景输出
