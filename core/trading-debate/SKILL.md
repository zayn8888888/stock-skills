---
name: trading-debate
description: 多 agent 辩论决策助手。忠实复刻 TradingAgents (TauricResearch) 的 LangGraph 七阶段流程 + 借鉴 ai-hedge-fund (virattt) 的大师风格 agent，对 stock-analyzer / stock-fundamentals / hyperliquid-perps（链上 funding 拥挤度）已有数据做"分析师采集 → Bull/Bear 多轮辩论 → Research Manager 裁定 → Trader 出 proposal → Risk 三方辩论（含链上拥挤红线硬约束） → Portfolio Manager 最终决策（拥挤降档规则） → 复盘锚点"七阶段编排，输出含 5 档评级、信心度、入场价、止损位、仓位指引的结构化报告。触发场景：(1) 用户已对某股做完单维分析后追问"该不该买 / 仓位多少 / 风险点在哪 / 现在能上车吗"；(2) 用户明确说"做一次多空辩论 / 给我个交易决策 / TradingAgents 风格分析 / 模拟对冲基金讨论 / Bull vs Bear / 用巴菲特视角看看"；(3) 用户从"分析"转向"行动决策"。不适用于：纯指数/板块讨论（用 market-scanner）、未先做基础分析的冷启动（先调 stock-analyzer）、量化策略回测、A 股盘中逐笔策略。
---

# 多 agent 辩论决策

## 设计源流

本 skill **架构忠实于以下两个开源项目**，仅复刻其编排范式，不引入其代码或外部数据源：

- **TauricResearch/TradingAgents**（LangGraph + 多角色辩论）：流程主干（七阶段）、5 档评级、Risk 三方辩论
- **virattt/ai-hedge-fund**（投资大师 signal 集合）：可选大师风格 agent（巴菲特 / 林奇 / Burry / Druckenmiller / Munger 等）

详细架构说明见 `references/framework-reference.md`（已在执行前必读块加载）。

## 执行前必读（收到任务后第一步，不与任何阶段并行）

```bash
Read references/framework-reference.md    # 七阶段架构完整说明（TradingAgents 对照）
Read references/master-styles.md          # 7 个大师 agent 完整 prompt 模板（v0.2）
Read references/role-prompts.md           # Bull/Bear/Risk/RM/Trader/PM 角色 prompt 细节
Read references/reflection.md             # 阶段 8 决策存档 + 历史召回完整规范（v0.3）
Read references/portfolio-layer.md        # 阶段 P1-P4 多标的组合层完整规范（v0.4）
Read references/cross-ticker-lessons.md   # 阶段 L1 跨标的反思教训聚合完整规范（v0.5）
Read references/multi-market.md           # 阶段 M1 跨市场基准选择完整规范（v0.5）
```

## 核心原则

1. **不引入新数据源**：只编排现有 skill（stock-analyzer / event-calendar / stock-fundamentals / stock-valuation）的输出
2. **辩论必须对话式**：Bull/Bear/Risk 三方等都要**直接回应对方上一轮论点**，禁止各说各话
3. **多轮往返**：默认配置 — Bull/Bear 1 轮（=2 次发言），Risk 3 方 1 轮（=3 次发言）；用户可指定 `--debate-rounds 2` 加深
4. **5 档评级**（PortfolioRating）：Buy / Overweight / Hold / Underweight / Sell — 不允许自创档位
5. **角色独立判断**：每个角色只看到上一轮输出 + 共享数据，禁止互相抄
6. **不出绝对买卖指令**：Portfolio Manager 输出 5 档评级 + executive summary + investment thesis + price target，不是"买入"硬命令
7. **数据时点必须标清**：所有论据后注明"数据来自 stock-analyzer @YYYY-MM-DD HH:MM"

## 前置依赖

### 基础依赖（所有模式必须）

| skill | 必须 | 用途 | 对应 TradingAgents 的 |
|------|-----|------|---------------------|
| `stock-analyzer` | ✅ | 提供 9 维度结构化数据 | market_analyst + fundamentals_analyst + news_analyst + sentiment_analyst |
| `event-calendar` | ✅ | 提供未来 N 天催化 / 黑天鹅清单 | （TradingAgents 没有，本 skill 增强） |

### 条件依赖（按启用大师 / 模式动态升级）

启用阶段 1 大师团时，**根据启用的大师，下表中"条件性必须"的 skill 升级为强制必调**——大师 checklist 严重依赖这些 skill 的输出，缺数据会被迫"编"或含糊给 neutral，违反"数据先行"原则。

| 启用的大师 | `stock-fundamentals` | `stock-valuation` | 原因 |
|----------|---------------------|-------------------|------|
| **Warren Buffett** | ✅ 必须 | 可选 | 护城河判断 / ROE / 管理层质量需 fundamentals 的商业模式段 |
| **Charlie Munger** | ✅ 必须 | 可选 | ROIC（不是 ROE）+ 反向失败路径需 fundamentals 业务深挖 |
| **Peter Lynch** | ✅ 必须 | ✅ 必须 | 六分类需 fundamentals + PEG 需 valuation 的成长率 |
| **Michael Burry** | 可选 | ✅ 必须 | 深度价值需 NCAV / 清算价值，valuation 计算 |
| **Stanley Druckenmiller** | 可选 | 可选 | 宏观顺势仅依赖 stock-analyzer 资金流 + event-calendar |
| **Aswath Damodaran** | 可选 | ✅ 必须 | DCF 三法是核心输入，无 valuation 直接没法跑 |
| **Bill Ackman** | ✅ 必须 | 可选 | 业务质量 + 治理瑕疵需 fundamentals 商业模式段 |

**默认套餐**（用户未指定时启用 Buffett + Lynch + Druckenmiller）→ 自动触发 fundamentals + valuation 双必须。

### 冷启动检查（**含条件依赖检查**）

用户提到的股票若没在当前会话跑过 `stock-analyzer`，先调一次再开始辩论。**且**：
- 阶段 1 启用大师团时，按上表查"条件性必须"清单，**逐个 skill 显式调用**
- 如果某个条件依赖 skill 没装（用户的环境里没有），明确告知用户"X 大师视角因缺 Y skill 无法启用，跳过该大师或换其他大师"——**不允许**让该大师含糊给信号

**不允许直接拍脑袋辩论。**

## 执行流程（七阶段）

完整 prompt 模板见 `references/role-prompts.md`（已在执行前必读块加载）。本节只列流程骨架。

### 阶段 0a：启动前 skill 确认（**新增硬约束 — 防止默认套餐偷懒**）

进入阶段 0 之前**必须用 `AskUserQuestion` 工具**做一次启动确认，避免出现"默认启用了 Buffett 但没调 stock-fundamentals 还硬给信号"这类偷懒。

#### 步骤 0：持有期 / 投资视角确认（**新增前置问题，步骤 1 之前**）

用 `AskUserQuestion` 先问一个问题：**「您的投资视角是？」**

| 选项 | 含义 | 对后续流程的影响 |
|------|------|----------------|
| **短线 / 事件驱动（≤ 8 周）** | 财报 / 政策 / 技术催化驱动 | 大师推荐表**排除 Buffett / Munger**（持仓期不匹配）；止损距离收紧至 ATR×1.5 以内；fundamentals 权重降低 |
| **中线（2-6 个月）** | 趋势 + 基本面共振 | 现有逻辑不变（默认） |
| **长线（1 年+）** | 价值回归 / 护城河复利 | stock-fundamentals **强制必调**；止损允许宽至 ATR×3；Buffett / Munger 优先推荐 |

> 用户未回答时默认「中线」，但必须在共享报告头部标注「默认中线视角」。

#### 步骤 1：基于标的特征**动态推荐**大师组合

不要无脑套用"Buffett + Lynch + Druckenmiller"默认套餐。先看 stock-analyzer 已有的快速指标，**并结合步骤 0 的持有期**，按下表挑：

| 标的特征 | 推荐大师组合 | 不推荐 |
|---------|-----------|-------|
| PE > 80x **或** 历史新高位 **或** AI/概念股 | **Burry + Damodaran + Druckenmiller**（泡沫识别 + DCF 锚 + 趋势） | Buffett（自己都会说"超出能力圈"，浪费角色） |
| 大盘消费 / 金融 / 铁路 / 长期持有视角 | **Buffett + Munger + Lynch** | Burry（无 deep value 机会） |
| 暴跌股 / turnaround / 烟蒂 | **Burry + Lynch + Munger** | Druckenmiller（无趋势可顺） |
| 宏观主导（FOMC/美元/HY spread 大动） | **Druckenmiller + Damodaran** + 1 个基本面派 | — |
| 有具体催化（spin-off / CEO 换届 / 重组） | **Ackman + Lynch + Damodaran** | — |
| 信息不足无法判断 | 询问用户偏好，**禁止**直接用默认套餐 | — |

#### 步骤 2：列出**必调 skill 清单**给用户确认

按选定大师组合，按 SKILL.md 条件依赖表查出每个大师对应的强依赖 skill，**用 AskUserQuestion 列出全清单**，让用户从下面选项中显式选择：

- **(A) 全调**（推荐）— 接受 token / 时间成本，保证大师视角不偷工
- **(B) 跳过缺数据的大师** — 例：用户没装 stock-valuation → Burry / Damodaran 跳过，只跑 Druckenmiller
- **(C) 换大师组合** — 用户改选不依赖缺失 skill 的大师
- **(D) 不跑大师团** — 直接进 Bull/Bear（适合用户只想要快速决策的场景）

#### 步骤 3：用户选择后才能进入阶段 0

❌ **严禁**：未做阶段 0a 直接套默认套餐 + 用 stock-analyzer 维度 3 / 公开 consensus 当 fundamentals 代理跑大师 prompt
❌ **严禁**：用户选了 (B) 但仍把缺数据的大师"含糊给 neutral 信号"——必须真跳过，共享报告标 `<master>: skipped (missing <skill>)`

#### 步骤 4：**锁定必调 skill 清单**（**新增硬阻断 — 防止"降级为有限版"偷懒**）

用户选完后，agent **必须**输出一段格式严格的"本次必调 skill 清单"，并在文末重复用户选项。这一段是后续阶段 0 的**唯一权威来源**，禁止口头修改：

```markdown
### 本次必调 skill 清单（阶段 0a 锁定，后续禁止变更）

用户选项：[A 全调 / B 跳过缺数据大师 / C 换大师 / D 不跑大师团]
启用大师：[列出大师名]
时间视角：[长线 / 中短线]

必调 skill（按下方顺序逐个 Skill() 加载，缺一不可）：
1. stock-analyzer       — 基础九维度（任何选项都必调）
                         ※ 调用它会自动触发以下子 skill，不要单独 Skill() 加载：
                           - futu-news-search / futu-comment-sentiment（维度 7 新闻）
                           - futu-capital-anomaly / hyperliquid-perps（维度 4 资金/链上 funding）
                           - futu-derivatives-anomaly（维度 8 期权 Step 0 快通道）
2. event-calendar       — 前瞻 14 天事件（任何选项都必调）
3. stock-fundamentals   — [若启用 Buffett/Munger/Lynch/Ackman 必调；否则可选]
4. stock-valuation      — [若启用 Lynch/Burry/Damodaran 必调；否则可选]

合计：[2 / 3 / 4] 个 skill（取决于启用的大师）
```

❌ **严禁**：跳过此步骤直接进数据采集
❌ **严禁**：清单输出后口头说"实际上 X skill 数据已包含在 Y 里，可以省略"——这是 SKILL 已知偷懒套路
✅ **正确做法**：清单一旦输出，阶段 0 批次 1 必须**逐个**Skill() 加载所有列出的 skill，**不允许少**

### 阶段 0：分析师层 — 数据采集（**强制硬约束**）

**这是阶段中最容易被 LLM 偷懒省略的环节**。明确规则：

#### 并行执行硬规则（**最关键的性能优化**）

阶段 0 涉及多个 skill / 多个 API 调用，**必须最大化并行**。否则 5 个 skill 串行 = 5 倍等待时间。

**并行原则**：

1. **skill 加载只能串行**（Skill 工具本身限制），但 skill 加载完成后的实际工具调用必须并行
2. **同一类工具的多次调用必须用单条消息批量发**：
   - ✅ 正确：一条消息里同时发 4 个 Bash 调用（拉 snapshot / kline / capital-flow / capital-distribution）
   - ❌ 错误：一条消息发 1 个 Bash → 等结果 → 下一条消息再发 1 个
3. **不同 skill 的独立 API 调用也要并行**：
   - 例：`futu-derivatives-anomaly` 的 Python 脚本 + `event-calendar` 的 Finnhub curl + `tavily_search` 4 条新闻 → 这些之间无依赖，**全部塞进单条消息**并行触发
4. **依赖链才串行**：只有当步骤 B 真的需要步骤 A 的输出时才串行（例：拉 owner_plate 拿到板块 code → 才能拉 plate_stock 同行）
5. **最长串行链不应超过 3 跳**：Skill 加载 → 数据并行采集 → （可选）依赖型二次查询

**自检**：阶段 0 完成后回看主对话——若发现连续 5+ 条消息每条只调 1 个工具，说明偷懒了，下次必须批量。

#### 阶段 0 入口：**门槛检查（hard gate）**

在跑批次 1 加载 skill 之前，agent 必须能回答："阶段 0a 步骤 4 锁定的必调 skill 清单是什么？"

- ✅ 能引用清单 → 批次 1 必须**逐个**Skill() 加载清单里**全部** skill，一个不漏
- ❌ 引用不到清单 → 阶段 0a 没做完，**回到阶段 0a 重做**，禁止跳

#### 推荐的并行批次结构

> ⚠️ 下面"批次 1"是**模板格式**，实际加载哪些 skill 由阶段 0a 步骤 4 锁定的清单决定。**不要照抄默认套餐**——示例只为展示批次结构，不是 skill 列表。

```
批次 1（按阶段 0a 锁定清单顺序加载所有 skill，注册到上下文）：
  Skill(<清单第 1 个>) → Skill(<清单第 2 个>) → ... → Skill(<清单第 N 个>)
  ※ 这一批必然串行，但只是 skill 注册，不实际拉数据

批次 2（单条消息内 N 路并行拉数据）：
  ‖ Bash: get_snapshot.py
  ‖ Bash: get_kline.py 60d
  ‖ Bash: get_stock_info.py
  ‖ Bash: get_capital_flow.py
  ‖ Bash: get_capital_distribution.py
  ‖ Bash: get_owner_plate.py
  ‖ Bash: handle_derivatives_anomaly.py
  ‖ Bash: finnhub earnings + economic calendar curl
  ‖ Bash: polymarket curl
  ‖ curl: futu-news-search 中文 + 英文 (2 路)
  ‖ tavily_search × 3-4 个查询

批次 3（依赖批次 2 输出的二次查询）：
  ‖ Bash: get_plate_stock.py（用批次 2 拿到的板块 code）
  ‖ tavily_search（用批次 2 发现的关键事件作 follow-up）
```

#### 必须做的事

1. **必须显式调用 `stock-analyzer` skill** — 用 `Skill` 工具触发，**不允许**：
   - ❌ 凭训练数据/常识/印象拍脑袋写论据
   - ❌ 只调几个 futu 子 skill（capital-anomaly / technical-anomaly 等）就当数据已采集——它们只覆盖 stock-analyzer 九维度的子集
   - ❌ 直接用上文已有的旧分析报告而不验证时点（行情快照 > 4 小时旧必须重跑）
   - ❌ 用 `mcp__plugin_tavily-web-search` 单源新闻替代 stock-analyzer
2. **必须显式调用 `event-calendar` skill** — 拿未来 30 天该标的相关事件（财报/政策/宏观）。**不允许**用"最近新闻"代替前瞻事件。
3. **若启用阶段 1 大师团**，按"条件依赖"表查每个大师对应的强制 skill，**逐个显式调用**：
   - Buffett / Munger / Ackman → 调 `stock-fundamentals`
   - Lynch → 调 `stock-fundamentals` + `stock-valuation`
   - Burry / Damodaran → 调 `stock-valuation`
   - 不允许"启用 Buffett 视角但不调 stock-fundamentals"（大师会编 ROE / 护城河）
4. **数据时点必须记录** — 在共享报告头部写明 `data_timestamp: YYYY-MM-DD HH:MM`，所有后续角色引用数据必须挂这个时点。

#### 时效性硬规则

| 场景 | 行情数据时效阈值 | 处理 |
|------|----------------|------|
| 盘中（美股 21:30-04:00 / 港股 09:30-16:00 北京时间） | > 4 小时 | **必须重调 stock-analyzer** |
| 盘后 / 周末 | > 1 个交易日 | 必须重调 |
| 新闻与情绪（维度 7） | > 24 小时 | 必须重调 |
| event-calendar | > 24 小时 | 必须重调 |

#### 冷启动 vs 续接

- **冷启动**（用户首次提到该标的）：必跑两个 skill，**不允许跳过**
- **续接**（同会话内 stock-analyzer 已跑且数据未过时效）：复用，但**必须在共享报告里标注"复用 X 时点的 stock-analyzer 输出"**——不能假装是本次新跑的

#### 共享报告格式（输出给后续所有角色）

```
{
  "data_timestamp": "<YYYY-MM-DD HH:MM>",
  "data_source": "stock-analyzer (fresh) | stock-analyzer (reused from <timestamp>) | partial",
  "market_report":        "<stock-analyzer 维度 1+2 摘要>",
  "fundamentals_report":  "<stock-analyzer 维度 3 + (可选) stock-fundamentals>",
  "capital_report":       "<stock-analyzer 维度 4+5；含 hyperliquid-perps 链上 funding/OI/premium（美股/美元资产标的；港股除 BABA 外应标'流动性不足'；A 股应标'链上无镜像'）>",
  "peers_report":         "<stock-analyzer 维度 6>",
  "news_report":          "<stock-analyzer 维度 7>",
  "derivatives_report":   "<stock-analyzer 维度 8 (美股/港股) | 'N/A: 本市场无期权' (A 股)>",
  "events_report":        "<event-calendar 输出>",
  "data_gaps":            "<列出所有'数据不可用'的项及原因 — 必须包含：(1) 跳过的维度；(2) 启用大师团但未调的条件依赖 skill；(3) 已知 bug 跳过的工具。不允许把 missing skill 只写在 data_source 里藏起来>"
}
```

#### 自检（阶段 0 完成前必须能回答）

- [ ] **阶段 0a 步骤 4 锁定的必调 skill 清单的每一个，都已 Skill() 调用过？**（清单 2-4 个 = 实际调用 2-4 个，少一个就是偷懒）
- [ ] `stock-analyzer` skill 是否真的被 Skill 工具调用过？（不是只读了它的 SKILL.md）
- [ ] `event-calendar` skill 是否真的被 Skill 工具调用过？
- [ ] `stock-analyzer` 维度 4 是否真的拉到了 `hyperliquid-perps` 的 lookup 输出？（美股/美元资产；港股仅 BABA；A 股豁免——若没拉到要在 data_gaps 写明原因，不能藏）
- [ ] **若启用大师团**：按"条件依赖"表查到的每个 skill 是否真的调用过？（启用 Buffett 但没调 stock-fundamentals = 偷懒）
- [ ] 共享报告里 `data_timestamp` 是否填了？
- [ ] 如果是续接复用，`data_source` 字段是否标了"reused from"？
- [ ] `data_gaps` 是否列出了所有缺失维度？（不允许藏起来）
- [ ] 若启用大师团，是否核对了每个大师的"条件性必须 skill"是否真有数据传入其 prompt？（数据传入失败时该大师必须改为"跳过"，不允许含糊给 neutral）
- [ ] **stock-analyzer 内部子 skill 是否全部已调用？** 检查：`futu-technical-anomaly`（维度 2）/ `futu-capital-anomaly`（维度 4）/ `futu-stock-digest`（维度 7b）/ `futu-news-search`（维度 7c）— 若 `data_gaps` 里出现"子 skill 未逐个触发"字样，立即停下回到 stock-analyzer 对应维度补调，不允许带着 data_gaps 继续辩论
- [ ] `news_report` 字段是否包含来自 `futu-stock-digest` 的方向判断（bullish/bearish/neutral），而非仅 Tavily 搜索结果？

**任何一条没做到，停下来补齐，禁止进入阶段 1**。

#### 已知偷懒套路与禁用措辞（**新增 — 当出现以下信号时停下补调**）

LLM 在 trading-debate 流程中最常见的偷懒套路：

| 偷懒措辞（出现即偷懒） | 正确做法 |
|---|---|
| "数据足够，直接进入分析与辩论" | 检查阶段 0a 清单 vs 实际调用记录，差一个补一个 |
| "X 视角降级为'基于已有数据的有限版'" | 该大师必须 `skipped (missing <skill>)`，不允许有限版 |
| "用 stock-analyzer 维度 3 当 fundamentals 用" | 跳过该大师，不允许代理 |
| "stock-fundamentals/stock-valuation 未独立 Skill 触发" | **立即** Skill() 调用补齐，不是写在 caveat 里就算了 |
| "已有公开 consensus / Tavily 搜索结果可以替代" | 跳过该大师，不允许代理 |
| "数据采集时间紧 / token 预算" | 用户选了 A 全调 = 已接受成本，agent 无权代为缩减 |
| "futu-stock-digest / futu-news-search / futu-capital-anomaly / futu-technical-anomaly：stock-analyzer 子 skill 未逐个触发" | 立即停下，对 stock-analyzer 补调缺失的子 skill（`Skill()` 调用），不允许把"未触发"写进 `data_gaps` 继续辩论 |

**触发条件**：
- agent 在阶段 0 任何输出里包含"降级"、"有限版"、"代理"、"省略"、"足够直接进入"等词 → 停下，回看阶段 0a 清单，补调遗漏 skill
- 共享报告 `data_gaps` 字段出现"X skill 未调用，但用 Y 数据近似" → 立即停下补调
- 大师评分输出但其条件依赖 skill 没在调用记录里 → 该大师改 skipped

**这一节是阶段 0 偷懒的最后防线**。Skill 已经在阶段 0a 锁清单 + 入口门槛检查 + 自检清单三道防线之后，加这一节是因为 LLM 仍可能用措辞绕过——出现禁用措辞 = 自动失败。

### 阶段 1（可选）：大师风格 agent 团（致敬 ai-hedge-fund）

**默认不跑**。用户明确要求"用 X 视角"或"凑齐对冲基金团队"或"模拟 Buffett 怎么看 / Burry 怎么看"时启用。

**完整 prompt 模板见 `references/master-styles.md`**（已在执行前必读块加载）。

#### 内置大师与适用场景

| 大师 | 风格定位 | 何时启用 |
|------|--------|---------|
| **Warren Buffett** | 价值 + 护城河 + 安全边际 | 大盘股、消费/金融/铁路、长期持有视角 |
| **Charlie Munger** | 反向思维 + 心智模式 + ROIC | 复杂业务想避坑、判断管理层质量 |
| **Peter Lynch** | 成长六分类 + PEG | 中盘成长股、turnaround、cyclical |
| **Michael Burry** | 深度价值 + 做空识别 | 暴跌股翻烟蒂 / 泡沫期识别空头 |
| **Stanley Druckenmiller** | 宏观顺势 + 趋势确认 | 当前宏观环境主导（FOMC/美元/HY spread）时 |
| **Aswath Damodaran** | DCF 叙事 + 隐含增速 | 估值贵贱争议大、需要严格 DCF 锚 |
| **Bill Ackman** | 集中持仓 + 公司治理 | 有具体催化（spin-off / 管理层换届）时 |

#### 调用约束

- **每个大师 agent 用 ai-hedge-fund 风格 4 段式 prompt**（角色定位 + Checklist + Signal Rules + Confidence Scale 0-100）
- 输出统一信号 schema：`{signal: bullish/bearish/neutral, confidence: 0-100, reasoning, time_horizon: "<具体期限>"}`
  - `time_horizon` 示例：Druckenmiller → `"3-6 周趋势"`；Buffett → `"3 年价值回归"`；Lynch → `"6-18 个月成长"`
  - **此字段必填**，不允许留空或填"不确定"
- 推荐启用数量：**1-4 个**（>4 个噪音过大）
- 用户没指定时默认套餐：**Buffett + Lynch + Druckenmiller**（价值 / 成长 / 宏观三视角）

#### 注入下游

- 大师信号在**阶段 2** 作为 Bull/Bear 的**弹药**：
  - Bull 必须点名响应 ≥ 2 个 bullish 信号 + 反驳 ≥ 1 个 bearish 信号
  - Bear 同理镜像
- 信号一致性指标：若 N 个大师中 bullish:bearish ≥ 4:2，**Research Manager** 阶段在 rationale 里注明"大师团一致性高"作为加权因子
- **时间视角冲突处理**：若各大师 `time_horizon` 不同（如 Druckenmiller "3 周"vs Buffett "3 年"），PM 汇总时**禁止直接平均**，必须在 `investment_thesis` 里显式说明「本次决策以 X 视角为主，Y 视角信号作参考，原因：...」
- **大师信号不直接参与阶段 6 PM 最终决策**（决策权归 PM）

### 阶段 2：Bull / Bear 多轮辩论（researchers）

默认 1 轮 = 2 次发言（Bull → Bear），可配 2-3 轮。

**Bull Researcher**：
- 第一轮：基于阶段 0 数据 + 阶段 1 大师信号（如有），构建 ≥3 条利多论据
- 第二轮起：必须**正面反驳 Bear 上一轮的至少 2 条论据**
- 风格：对话式，禁止罗列数据

**Bear Researcher**：
- 同 Bull 镜像，反向构建利空论据
- 必须反驳 Bull 上一轮论点

**轮次终止条件**：`count >= 2 × debate_rounds`（对应 TradingAgents conditional_logic）

### 阶段 3：Research Manager — 裁判 + 投资计划

读完整 Bull/Bear 辩论历史，输出结构化 ResearchPlan：

```
{
  "recommendation": "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell",
  "rationale": "<2-4 句对话式总结，明确说哪些论据胜出>",
  "strategic_actions": "<给 Trader 的具体执行指引，含仓位建议>"
}
```

**强制约束**：Hold 仅当双方论据真正旗鼓相当时使用，否则必须站队。

### 阶段 4：Trader — 交易 proposal

基于 ResearchPlan 输出结构化 TraderProposal：

```
{
  "action": "Buy" | "Hold" | "Sell",
  "reasoning": "<2-4 句，锚定分析师报告 + research plan>",
  "entry_price": <float, 报价币种>,
  "stop_loss": <float>,
  "position_sizing": "<数字% of portfolio，必须附计算过程，见下方公式>",
  "fundamental_exit_triggers": [
    "<基本面止损条件 1，例：核心业务毛利率连续 2 季下滑 >3pp>",
    "<基本面止损条件 2，例：FCF/净利润 < 0.6 连续 2 季>",
    "<基本面止损条件 3，例：CEO/CFO 非计划离职>"
  ]
}
```

**`position_sizing` 必须附两步计算过程**（不允许只写一个百分比数字）：

```
步骤 1 — 绝对上限（drawdown 约束）：
  max_position = 组合目标最大回撤容忍度 / 止损距离百分比
  默认组合最大回撤 = 15%（用户未指定时）
  止损距离 = |entry_price - stop_loss| / entry_price
  示例：15% / 8% = 1.875% → 取整为 2%

步骤 2 — 波动率调整（多标的组合时适用）：
  ATR_pct = 近 14 日 ATR / 现价（已有 K 线可计算）
  adjusted = base_weight × (1 / ATR_pct) / avg(1 / ATR_pct of all positions)
  高波动股自动降权，低波动股自动升权

最终仓位 = min(步骤 1 上限, 步骤 2 调整值)
单标的场景：直接用步骤 1 结果，不做步骤 2
```

末尾必须有 `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` 一行（与 TradingAgents 兼容）。

**评级-行动偏离强制说明（新增）**：

当 Trader action 与 RM recommendation 方向不一致时（如 RM Underweight 但 Trader 仍提议 Buy），**不强制重跑，但 reasoning 字段必须显式回答以下三问**：

1. **为什么偏离评级**：具体的短期催化是什么？与评级所指的中长期判断是否时间维度不同？
2. **如果评级方向正确，止损能否保护**：若中长期偏空的判断实现（如财报miss、业绩继续下滑），止损是否能在跳空情况下仍然有效？
3. **赔率是否合理**：用具体数字说明——最大收益 vs 最大亏损的比例。

> 背景：Underweight 是相对判断（持仓低于基准），不等于"绝对不能买"。投行内部"Underweight + 近期超配特定催化"是常见操作。但偏离评级买入必须有明确逻辑，不能用"仓位小"一句话带过。PDD 案例的问题是第2问没有回答（止损无法防财报跳空），而不是偏离评级本身错了。

### 阶段 5：Risk 三方辩论（risk_mgmt debators）

默认 1 轮 = 3 次发言（Aggressive → Conservative → Neutral），可配 2 轮。

**Aggressive Analyst**：
- 推动激进仓位 / 高赔率，挑战 Conservative 的过度谨慎
- 论据来自 Trader proposal + 共享报告

**Conservative Analyst**：
- 强调下行保护 / 流动性 / 黑天鹅，挑战 Aggressive 的高风险盲点

**Neutral Analyst**：
- 平衡两极，指出双方论据中数据支撑薄弱的地方

**轮次终止条件**：`count >= 3 × risk_rounds`

#### 财报二元事件硬规则（新增）

当 `events_report` 中存在**距今 ≤ 5 个交易日**的财报事件时，Risk 阶段强制触发以下流程：

**Conservative Analyst 必须完成 IV-implied 止损有效性验证**：

```
IV-implied 预期波动幅度 = 现价 × ATM IV × √(最近到期日天数 / 365)
（数据来源：derivatives_report 中的 ATM IV；若无期权数据，改用近 30 日历史波动率 HV 替代，并标注"使用 HV 近似"）

对比 Trader 的 stop_loss 距离：
  stop_loss 距离 = |entry_price - stop_loss| / entry_price

若 IV-implied 幅度 > stop_loss 距离：
  → 必须输出：
    "⚠️ 止损可能失效：市场定价的预期波动（IV-implied = X%）超过止损保护距离（Y%）。
     财报跳空可能直接越过止损，建议：(1) 财报前不入场，或 (2) 改用最大亏损有限的期权多头代替股票多头。"
```

**Aggressive 必须正面回应**：不能仅凭估值低或大单信号驳斥，必须给出**为何期权 IV 高估了下行风险**的具体数据（如"近4季度财报后实际波动均小于 IV-implied"）。

> 用 IV 而非"预估 EPS miss 幅度"的原因：期权市场已经对财报不确定性定价，IV-implied move 是可计算的真实数据。要求 Conservative 预测"EPS 差 X% 时跌 Y%"会导致 LLM 幻觉。PDD 案例：IV 60%，7天到期，IV-implied = $93.60 × 60% × √(7/365) ≈ $7.75，而 stop_loss 距离仅 $3.10（3.3%）—— 如果当时跑这个计算，Conservative 会发现止损根本不够用。

#### 链上 funding 拥挤度硬规则（**新增 — 美股 / 美元资产必读**）

阶段 0 共享报告 `capital_report` 中含 hyperliquid-perps 链上 funding 数据时，Risk 三方**必须**依下表读取并表态——禁止"不引用就跳过"：

| 24h avg funding APR（绝对值） | 等级 | 三方义务 |
|---|---|---|
| `> 100%` | **🔴 拥挤红线** | Conservative **必须**把"链上拥挤交易反向 squeeze 风险"列为头号下行风险并量化（"funding APR avg X%，> 100% 红线，与 Trader 入场方向同向 = 警惕反向轧空"）；Aggressive **必须**正面回应——给出"为什么仍激进"的具体反驳（不能回避） |
| `50% ~ 100%` | 🟡 拥挤预警 | Aggressive 与 Conservative 都要引用此数字。Aggressive 可继续推动激进仓位但要注明"funding 偏热但未到红线"；Conservative 必须将其作为缩仓论据之一 |
| `≤ 50%` | 🟢 中性 | 不构成额外约束，但 Neutral 应在综合段提一句"链上 funding 中性，未给出额外信号" |

**港股 / A 股豁免**：若 capital_report 中链上数据写"流动性不足"或"链上无镜像"，本规则**整体跳过**，三方都不得用链上数据辅证。

**禁止行为**：
- ❌ Aggressive 在 funding 红线下仍推 Buy 满仓而**不显式回应** funding 拥挤（必须有反驳论据，例如"看 max APR 是单小时极值非稳定状态"或"24h 已开始回落"）
- ❌ Conservative 在 funding 中性时仍硬把"链上拥挤"当头号风险（找不到的论据要承认找不到）
- ❌ 三方任何一方说"链上数据不重要"——可以反驳数据强度，但不能整体否认

### 阶段 6：Portfolio Manager — 最终决策

读完整 Risk 辩论历史 + Trader proposal + Research plan，输出最终 PortfolioDecision：

```
{
  "rating": "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell",
  "executive_summary": "<2-4 句行动计划：入场策略 + 仓位 + 关键风险位 + 时间窗口>",
  "investment_thesis": "<详细推理，锚定辩论中的具体证据>",
  "price_target": <float, 可选>
}
```

PM 评级**可以与 Trader 的 action 不一致**——Risk 辩论可能让 PM 收敛仓位（例如 Trader Buy → PM Overweight），这是正常的。

**参数漂移记录硬规则**：PM 若覆盖 Trader 的 `entry_price` / `stop_loss` / `position_sizing` 任一字段，**必须**在 `investment_thesis` 里显式写一行 `参数漂移：Trader 原 stop_loss=X USD → PM 改为 Y USD，依据：<Risk 哪一方哪条论据>`。否则用户复盘时无法判断决策路径，且容易把 Trader 的原始数字误当作最终数字。

**拥挤交易降档硬规则（新增）**：

若 Risk 阶段触达"🔴 拥挤红线"（24h avg funding APR 绝对值 > 100%）且 Aggressive 未能给出量化反驳（如"max APR 是单小时极值，已快速回落"），PM **必须**：

1. **降一档评级**：Buy → Overweight；Overweight → Hold；Hold → Underweight；Underweight 维持
2. **缩减仓位**：position_sizing 至少砍半
3. **在 `investment_thesis` 显式写一行**：`拥挤降档：funding APR 24h avg = X%（> 100% 红线），Aggressive 未给出量化反驳，依据 Conservative 论点 Y，评级 Buy→Overweight，仓位 N%→N/2%`

仅当 Aggressive 提供**数据驱动的反驳**（不是定性"未必拥挤"）时，PM 才可豁免降档，但仍需在 `investment_thesis` 里写"funding 红线达成但已豁免，依据 Aggressive 反驳：<具体数据>"。


### 阶段 7：复盘锚点（可选但推荐）

事前埋点 3 个观察指标，明确"3 个月后回看，看这几个数据判断当时决策对错"：
- 指标 1：决策依赖的核心事实（如"季度营收同比 ≥ 20%"）
- 指标 2：技术 / 资金面验证（如"P/C 比率回归 1.0"或"突破 200 日均线"）
- 指标 3：风险事件未触发（如"无新做空报告 / 监管处罚"）

**每个指标必须含明确的可验证日期 / 时间窗口硬规则**（以决策日 = D 为基准）：
- ❌ 不允许 "约 8 月" / "本季度" / "未来某天" 这类模糊措辞
- ✅ 必须形如 `D+90` 之前的 YYYY-MM-DD 区间，或绑定到具体已知事件（如"NVDA 5/20 财报后 30 日"）
- 若某指标依赖未排定日期的事件（财报 / 政策），必须写明"截至 D+90 该事件若未发生 → 视为失效，本指标作废"
- 用户 3 个月后回看时，这 3 个日期必须**都已可验证**——若 1 个仍未到达，说明锚点设计有缺陷，应当返工

### 阶段 8：决策存档 + 历史召回（v0.3 跨会话 Reflection）

**完整规范见 `references/reflection.md`**（已在执行前必读块加载）。两个动作：

**8a. 阶段 0 之前**（决策开始前）：
- **必须显式调用 `Glob` / `Read` 工具**检索当前会话的 Claude Code memory 目录（`~/.claude/projects/<会话编码目录>/memory/`），匹配 `trading-debate-decision-{ticker}-*.md` 文件
- ❌ 禁止凭印象说"我记得有 / 没有"——必须真读文件
- 命中且决策 ≥ 3 个月前但未反思 → 提示用户"是否先做反思再开新决策"
- 命中已反思的 → 把"教训"作为上下文注入阶段 6 PM prompt

**8b. 阶段 6 PM 完成后**（决策落地后）：
- **必须显式调用 `Write` 工具**写 memory 文件 `trading-debate-decision-{ticker}-{YYYYMMDD}.md`（type: project）
- **必须显式调用 `Edit` 工具**在 MEMORY.md 索引追加一行
- ❌ 禁止"承诺写但不真写"——主对话必须出现 Write / Edit 工具调用记录
- 标注"待 3 个月后反思"

**反思触发**（用户主动 / 自动）：
- 用户说"复盘 NVDA / 反思我对 X 的决策"
- 或下次相似分析时检测到超期未反思
- 反思时**必须真调富途 K 线 API** 拉决策日期到今天的实际行情，禁止编 raw_return / alpha
- 反思 prompt 照搬 TradingAgents（中文化）：2-4 句无 markdown，引用实际 alpha vs SPY/HSI/沪深 300

### 阶段 P1-P4：多标的组合层（v0.4，可选）

**完整规范见 `references/portfolio-layer.md`**（已在执行前必读块加载）。仅当用户明确提交多个候选标的时启用：

| 阶段 | 内容 | 硬约束 |
|-----|------|-------|
| P1 | 候选标的并行跑完整七阶段 | **每个标的必须独立调 stock-analyzer + event-calendar + 启用大师对应的条件依赖**；禁止"批量优化所以省略 Risk 三方" |
| P2 | 拉 60 日 K 线计算相关性矩阵 | **必须调 futuapi 的 `get_cur_kline` 拿真实数据**算 corr，禁止编相关系数 |
| P3 | **组合层 PM**：按 5 档评级 + 信心度排序 + 相关性折扣（>0.7 减半）+ 行业封顶 25% + 换手 ≤20% | 必须引用 P2 真实相关性数据 |
| P4 | 组合层复盘锚点（夏普比率 / 单股 ATR / 行业漂移） | ATR 必须从 P2 已拉的 K 线计算，禁止凭印象给 |

输出形如 `[{ticker, action: buy/trim/hold/sell, from_pct, to_pct, reasoning}, ...]`。

**P1 偷懒检测**：每个候选标的输出里都应该看到独立的 stock-analyzer / event-calendar 工具调用记录——若某标的的论据只引用其他标的的数据，是数据共享偷懒，必须重跑该标的的阶段 0-6。

### 阶段 L1：跨标的反思教训聚合（v0.5，自动）

**完整规范见 `references/cross-ticker-lessons.md`**（已在执行前必读块加载）。在阶段 8a（历史召回）时自动检查：

- **必须显式调用 `Glob` 工具**列出所有 `trading-debate-decision-*.md` 文件，**Read** 已反思的决策——禁止凭印象说"我记得有 N 条"
- 该 ticker 所属行业 / 主题已有 ≥ 3 条已反思决策 → 自动跑教训聚合
- 4 维度切片（行业 / 评级方向 / 信心度 / 大师团一致性）找出**模式级错误**
- 胜率公式必须一致（建议用：`alpha > 0` 算命中），4 个维度共用同一个公式
- 输出 `top_lessons`（可操作教训）注入阶段 6 PM prompt
- PM 必须明确"本次为何不会重蹈覆辙"或主动调降仓位 / 评级一档

用户主动触发：
- "我对半导体股的判断有什么模式问题"
- "复盘我所有 AI 概念股的决策"
- "我做空决策的胜率怎么样"

### 阶段 M1：跨市场基准选择（v0.5，自动）

**完整规范见 `references/multi-market.md`**（已在执行前必读块加载）。仅当组合候选含 ≥ 2 个市场（美 / 港 / A 股）时自动启用：

| 问题 | 解法 |
|-----|------|
| 基准选择 | 按市值加权——单市场 ≥70% 用本地基准（SPY/HSI/沪深 300）；真混合用 MSCI ACWI |
| 交易时段对齐 | 北京时间对齐——美股用前一交易日收盘 / 港股 A 股用当日收盘 |
| 汇率风险 | 显式标注 USD/HKD/CNY 仓位百分比 + 当前汇率趋势警示 |
| alpha 口径 | 双口径输出——本币（美股 vs SPY 等）+ 人民币统一（vs 沪深 300 全收益） |

相关性矩阵（v0.4 P2）必须升级为**对齐数据**计算，避免交易时段不同造成虚假相关性。

---

## 输出契约（写报告前自检）

- [ ] **阶段 0a 自检**：是否用 AskUserQuestion 让用户确认大师组合 + 必调 skill 清单？（默认套餐自动启用 = 违规）
- [ ] **阶段 0 自检全部通过**（stock-analyzer + event-calendar 真的调用过、data_timestamp 已填、data_gaps 已列）
- [ ] **启用大师团时**：每个大师对应的条件依赖 skill 真的调用过；缺数据的大师真的"跳过"（不允许含糊给 neutral）
- [ ] **data_gaps 完整性**：所有跳过的大师 / 缺失的 skill / 已知 bug 跳过的工具是否都列在 data_gaps（不允许只藏在 data_source 里）
- [ ] 阶段 0-6 全部跑完，无静默略过（阶段 1 / 7 可选但要明确说"未启用"）
- [ ] Bull/Bear 至少完成 1 轮（2 次发言），第二次发言起包含明确反驳
- [ ] Research Manager 输出 5 档评级（不是 6 档自创）
- [ ] Trader 输出含 entry_price / stop_loss / position_sizing 三项
- [ ] Risk 三方都发言，每个角色都直接回应了至少一位对方
- [ ] PM 最终评级 + executive_summary + investment_thesis 都有
- [ ] **启用 v0.3 反思**：阶段 8a 真的 Glob/Read 了 memory，阶段 8b 真的 Write 了决策存档
- [ ] **启用 v0.4 组合层**：每个候选标的的 stock-analyzer 调用都有记录，相关性矩阵基于真实 K 线
- [ ] **启用 v0.5 教训聚合**：真的 Read 了 ≥ 3 条已反思决策，4 维度切片胜率公式一致
- [ ] 所有数据点标了来源 skill + 时点
- [ ] 末尾有 DISCLAIMER

## 不允许的偷懒模式

### 启动层（阶段 0a）

- ❌ **跳过 AskUserQuestion 直接套默认套餐**（Buffett+Lynch+Druckenmiller 在很多场景是错的，例：高 PE / AI 概念股应换 Burry+Damodaran）
- ❌ **大师组合不基于标的特征**（不看 PE / 是否新高 / 行业属性就硬选大师 = 偷懒）
- ❌ **启用了某大师但不调其条件依赖 skill**（例：启用 Buffett 但不调 stock-fundamentals → 用 stock-analyzer 维度 3 凑合 = 偷懒）

### 数据采集层（阶段 0）

- ❌ **未调用 stock-analyzer 直接开始辩论**（最常见偷懒，必须显式 Skill 触发）
- ❌ **凭训练数据/常识写论据**（"NVDA 应该 PE 大概 40x 左右..."——禁止，必须现拉数据）
- ❌ **只调几个 futu 子 skill 就当数据已采集**（capital-anomaly + technical-anomaly 不等于 stock-analyzer）
- ❌ **复用旧报告但不标 timestamp**（隐瞒数据陈旧度）
- ❌ **跳过 event-calendar**（用"最近新闻"假装是前瞻事件）
- ❌ **用 Tavily 单源新闻替代 stock-analyzer 维度 7**（覆盖度差太多）
- ❌ **缺失的 skill / 跳过的大师只写在 data_source 不写 data_gaps**（藏起来 = 偷懒）
- ❌ **每条消息只发 1 个工具调用让本可并行的请求被串行化**（10 个独立 Bash 串行 = 10 倍等待，必须批量；自检：阶段 0 主对话出现 5+ 条连续只调 1 个工具的消息 = 违规）

### 辩论与决策层（阶段 2-6）

- ❌ Bull/Bear 各说各话不互相反驳（违反"对话式辩论"原则）
- ❌ Risk 只跑 1 个角色（必须三方都到场）
- ❌ **RM Underweight/Sell + Trader Buy 但 reasoning 未回答三问**（偏离评级买入必须显式说明催化、止损有效性、赔率，否则是无根据的反向押注）
- ❌ **财报在 5 日内但 Risk 未建模严重 miss 情景**（Conservative 必须给出跳空风险评估）
- ❌ **财报在 5 日内但 Conservative 未完成 IV-implied 止损有效性验证**（期权卖方参考见 stock-analyzer 维度 8）
- ❌ 跳过 Trader proposal 直接到 PM 决策
- ❌ Trader 不给具体止损价，只写"破位止损"
- ❌ PM 评级写"看个人风险偏好"——必须从 5 档中选一档
- ❌ PM 改了 Trader 的 entry/stop_loss/position_sizing 但不在 investment_thesis 里写"参数漂移"行
- ❌ 复盘锚点写"约 8 月" / "未来某天" / "本季度"——必须给出 D+90 之前的具体 YYYY-MM-DD 或绑定具体已知事件
- ❌ 直接拿 stock-analyzer 的"综合研判"复制粘贴当 PM 输出（违反"独立判断"原则）

## 不适用场景

- 纯指数 / 板块讨论 → market-scanner
- 没有任何数据基础就直接辩论 → 先 stock-analyzer
- 量化策略回测 / 多因子模型 → 不在本 skill 能力范围
- A 股盘中逐笔策略 → 数据源限制，不支持
- 跨股票组合优化 → 见阶段 P1-P4（v0.4 已支持，明确触发）

## 版本路线图

- **v0.1**：单标的，七阶段，TradingAgents 完整主干 + ai-hedge-fund 占位接口
- **v0.2**：✅ 7 个大师 agent prompt 模板（`references/master-styles.md`）；信号聚合规则注入 Bull/Bear 阶段
- **v0.3**（当前）：✅ 跨会话 Reflection（`references/reflection.md`）；阶段 8 决策存档 + 历史召回；3 月窗口反思 prompt
- **v0.4**（当前）：✅ 多标的组合层 PM（`references/portfolio-layer.md`）；阶段 P1-P4；相关性矩阵 + 行业封顶 + 换手控制
- **v0.5**（当前）：✅ 跨标的反思教训聚合（`references/cross-ticker-lessons.md`）—— 阶段 L1，4 维度切片找模式级错误；✅ 跨市场基准选择（`references/multi-market.md`）—— 阶段 M1，市值加权基准 + 交易时段对齐 + 汇率敞口 + 双 alpha 口径
- **v0.6**（路线图）：实盘交易接入（与 futuapi 下单 skill 联动，PM 决策一键转 paper trade 单）；策略回测层（用历史决策日期 backtrace 验证 PM 实际胜率）

---

> **DISCLAIMER**：本 skill 输出仅为基于公开数据的多角色推演，不构成投资建议。最终决策由用户独立承担，且不应将单次辩论结论作为长期持仓依据。LangGraph + 多 agent 辩论会放大 LLM 的过度自信偏差，请把"信心度"读作"模型自评"而非"市场赔率"。
