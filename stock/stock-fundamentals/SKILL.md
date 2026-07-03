---
name: stock-fundamentals
description: 自下而上基本面研究助手。对单只股票进行商业模式→护城河→财务验证→估值四步分析，输出结构化投资研究报告。触发场景：(1) 用户问"XXX 值不值得长期持有 / 适不适合做价值投资 / 这家公司护城河在哪 / 帮我做基本面尽调 / XXX 财务健康吗"；(2) 用户说"研究一下 XXX 的商业模式 / 看看 XXX 的盈利质量 / XXX 估值贵不贵 / 帮我评估 XXX 内在价值"；(3) 用户提到个股并想从长期价值视角理解公司。不适用于：短线技术分析、期权定价、资金流向判断（使用 stock-analyzer skill）、纯指数/板块研究。
---

# 自下而上基本面研究

## 核心原则

1. **证伪优先**：每个正面结论都要主动寻找反驳证据，不替用户做投资决策
2. **区分事实与推断**：财务数据是事实，护城河强弱是判断，估值是模型——三者清晰分开
3. **会计陷阱警惕**：GAAP 数字不等于经济现实，调整口径必须说明
4. **苏格拉底式引导**：如果用户在学习基本面分析，通过提问引导推导，而非直接给答案

## 执行前必读（收到任务后第一步）

```bash
Read references/four-steps.md  # 四步分析框架完整细节（指标定义、判断标准、会计陷阱）
```

## 数据工具

### ⚡ Step 0：代码格式标准化（必做，**单独执行，不与任何其他调用并行**）

1. **将用户输入的 ticker 补全为富途格式**：
   - 纯英文字母 1-5 位 → `US.<TICKER>`（`AAPL` → `US.AAPL`）
   - 港股 → `HK.XXXXX`（5 位数字补零，如 `HK.00700`）
   - A 股 → `SH.XXXXXX`（沪）或 `SZ.XXXXXX`（深）

2. **单独运行一次快照验证**，成功后再启动所有并行调用：
   ```bash
   python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_snapshot.py <NORMALIZED_CODE> --json
   ```
   - ✅ 成功 → 后续所有调用统一使用 `<NORMALIZED_CODE>`
   - ❌ 格式错误 → 停止，向用户确认代码
   - ❌ 连接失败 → 停止，提示启动 OpenD

### ⚡ Step 0.5：近期异动与监管风险排查（必做，与行情数据并行）

**0.5a 近期价格异动检测**：拉 30 日 K 线，检查是否存在「单日绝对涨跌幅 > 15%」事件。

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_kline.py <NORMALIZED_CODE> --ktype 1d --num 30 --json
```

若命中：**暂停四步分析**，并行调查原因（拆股/股息 + Tavily `<公司名> <YYYY-MM-DD> 暴跌 OR 暴涨 OR 催化`），确认原因后在报告"近期重要事件"置顶标注，再继续分析。

**0.5b 监管执法专项搜索（强制，3 条并行，不可省略）**：

```
1. "<公司名> OR <TICKER> SEC enforcement penalty fine lawsuit <当前年份-1> OR <当前年份>"
2. "<公司名> OR <TICKER> CSRC OR SFC OR MAS OR FINRA regulatory penalty action"
3. "<公司名> OR <TICKER> compliance violation settlement regulatory probe"
```

- **命中** → 写入报告"近期重要事件"，标注金额/性质/业务影响比例（若可得），进入 Step 2 护城河侵蚀分析
- **未命中** → 报告中**禁止写"❌ 未发现监管处罚"**，必须写：`⚠️ 已执行 3 条监管专项搜索，未找到相关记录（不代表不存在；建议通过 SEC EDGAR / FINRA BrokerCheck / SFC 执法公告独立核查）`

### 行情数据（futuapi）

> **⚠️ 禁止对 futuapi 脚本输出做 `| python3 -c` 管道解析**——`--json` 模式输出两行（`True\n{JSON}`），`json.load(stdin)` 会报 `Extra data`；直接读脚本全量输出，从 `data[0]` 取字段。

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_snapshot.py <NORMALIZED_CODE> --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_stock_info.py <NORMALIZED_CODE> --json
```

### 财务与基本面数据（分层数据源）

**优先级**：Futu 结构化接口 → Tavily 搜索兜底。

#### 层 1：Futu 结构化接口（并行执行，需 OpenD）
```bash
# 财务三大表（A 股返回 report_list=[]，降层 2 Tavily）
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_financials_statements.py <NORMALIZED_CODE> --num 8 --json
# 估值分位数（全市场含 A 股）
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_valuation_detail.py <NORMALIZED_CODE> --json
# 股东持股（A 股报错，仅港美股）
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_shareholders_overview.py <NORMALIZED_CODE> --json
# 分红历史（全市场含 A 股）
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_corporate_actions_dividends.py <NORMALIZED_CODE> --json
```
JSON 字段提取要点：
- 财务三大表 → `report_list[]`，每条含 `yoy / qoq`
- 估值 → `trend.valuation_percentile`（历史百分位）/ `trend.forward_value`（前瞻 PE）/ `profit_growth_rate`（盈利 vs 市值增速）
**各接口 A 股支持情况**：

| 接口 | A 股 | 降级 |
|------|------|------|
| `get_financials_statements` | ❌ 空列表 | → 层 2 Tavily 补财务数据 |
| `get_valuation_detail` | ✅ 可用 | — |
| `get_shareholders_overview` | ❌ 明确报错 | A 股跳过，Tavily 补股东结构 |
| `get_corporate_actions_dividends` | ✅ 可用 | — |

**OpenD 不可用** → 整个层 1 跳过，执行层 2

#### 层 2：Tavily 搜索兜底（层 1 无数据时，并行）
```
1. "<公司名> revenue gross margin net margin trend 2022 2023 2024"
2. "<公司名> ROIC return on invested capital free cash flow annual"
3. "<公司名> business model how does it make money moat competitive advantage"
4. "<公司名> PE ratio historical valuation fair value 2024 2025"
5. "<公司名> risks competition threats bear case"
```
报告"数据来源"行注明使用层级（`Futu 结构化` / `Tavily 搜索`）。

### 近期新闻动态（futu-stock-digest）

在四步分析**开始前**，先调 `Skill(skill="futu-stock-digest")` 顺序执行（扫描近 7 天新闻），识别以下红旗信号：

| 信号类型 | 影响维度 |
|---------|---------|
| 监管处罚 / 罚款 | Step 2 护城河 |
| 重大并购 / 剥离 | Step 3 财务验证（商誉 / ROIC） |
| 竞争对手重大突破 | Step 2 护城河侵蚀 |
| 管理层异动 | 综合结论风险部分 |
| 盈利预警 / 上调 | Step 4 估值（更新正常化 FCF） |

## 四步分析框架

完整细节（指标定义、判断标准、会计陷阱）见 [references/four-steps.md](references/four-steps.md)。

| 步骤 | 核心问题 | 关键指标 |
|------|---------|---------|
| **Step 1 商业模式** | 靠什么赚钱？谁付钱？单位经济学健康吗？ | 收入来源 / 成本结构 / 毛利率 / 单位经济学指标 |
| **Step 2 护城河** | 竞争优势是什么？能持续多久？ | 5 类护城河 / ROIC 验证 / 反驳问题 |
| **Step 3 财务验证** | 数字是否支撑护城河叙述？ | 毛利率 / ROIC / 收入稳定性 / FCF 转化率 |
| **Step 4 估值** | 当前价格是便宜、合理还是昂贵？ | P/E 相对估值 / FCF 收益率 / 反向 DCF |

## 执行流程

1. **识别代码**：中文名/英文简称 → 富途完整代码（Step 0 格式标准化 + 快照验证）
2. **异动与监管排查**（Step 0.5，与步骤 3 并行）：K 线异动检测 + 3 条 Tavily 监管专项搜索
3. **批次 A 并行拉取数据**：Futu 行情 + 财务三大表（或 Tavily 5 条）**同时发出**（Bash 脚本 + Tavily 可同批）
4. **新闻快扫**（步骤 3 完成后顺序执行）：`Skill(skill="futu-stock-digest")` 顺序调用（分析 <CODE> 近 7 天新闻，返回方向判断和红旗信号列表），识别红旗信号（与步骤 2 结论汇合）
   - Skill 返回结构化内容 → ✅ 继续；失败 → Tavily 7 天新闻搜索降级
5. **检查数据质量**：PE 异常？FCF 有一次性项目？新闻红旗与静态分析矛盾？
6. **填充四步框架**：按 Step 1→4 顺序，每步结论有数据支撑，与步骤 2/4 红旗交叉对照；Step 1 完成商业模式识别后，按类型展开单位经济学（见下方）
7. **输出报告**：按下方模板，证伪视角，"近期重要事件"不可省略，"数据覆盖范围"必须填写

## 单位经济学分支（Step 1 商业模式识别类型后展开）

按商业模式类型选对应分支计算；**数据未公开时跳过，不估算**，标注「单位经济学：数据未披露，跳过」。

| 类型 | 核心指标 | 红旗阈值 |
|------|---------|---------|
| **SaaS / 订阅制** | LTV / CAC（若公司披露）；Net Revenue Retention (NRR) | LTV/CAC < 3 = 增长不可持续；NRR < 100% = 客户在流失 |
| **平台 / 双边市场** | Take Rate 近 3 年趋势；GMV 增速 vs 收入增速 | Take Rate↑ + GMV↓ = 在抽干生态；收入增速 >> GMV = 靠提价非有机增长 |
| **零售 / 餐饮** | 同店销售增速 (SSS)；坪效同比 vs 租金涨幅 | SSS 连续 2 年负增长；坪效增速 < 租金涨幅 = 单位盈利在收缩 |
| **SaaS 销售效率** | Magic Number = 季度新增 ARR / 上季度 S&M 费用 | Magic Number < 0.5 = 销售效率低，烧钱扩张不可持续 |
| **其他 / 数据未公开** | — | 跳过，标注原因 |

## ⚠️ 输出即止规则

四步分析数据及新闻快扫全部在 context 后，**立即**以 `## 📋 <公司名>` 或报告模板对应标题开头写正文。禁止 `echo` / `python print` 等"准备输出"工具调用。
报告输出完成后，**立即**调用 `Skill(skill="ticker-journal")` → write 存档（来源 `stock-fundamentals`，评级 `纯分析`，见下方「分析存档」）。

## 输出格式

```markdown
## 📋 <公司名>（<CODE>）基本面研究报告 · <日期>
**分析结论（一句话）**：[公司是什么、护城河强弱、当前估值水平]

**📊 数据覆盖范围**（分析边界一目了然）：

| 维度 | 来源 | 状态 |
|------|------|------|
| 行情快照 | Futu OpenAPI | ✅/❌ |
| 财务三大表 | Futu OpenAPI / Tavily | ✅/❌/接口未返回 |
| 估值百分位 | Futu OpenAPI | ✅/❌ |
| 股东结构 | Futu OpenAPI / Tavily | ✅/❌ |
| 分红历史 | Futu OpenAPI | ✅/❌ |
| 近期新闻（7天） | futu-stock-digest | ✅/❌ |
| 监管执法专项搜索 | Tavily（3条查询） | ✅已搜索/❌未执行 |
| 现金流量表 | — | ✅/❌/接口未返回 |
| 管理层电话会全文 | — | ✅/❌/未获取 |

### 1. 商业模式
### 2. 护城河（类型 / 宽窄评级 / 关键证据 / 主要威胁）
### 3. 财务验证

| 指标 | 数值 | 行业对比 | 信号 |
|------|------|---------|------|
| 毛利率 | | | |
| ROIC（含商誉） | | | |
| ROIC（剔除商誉） | | | |
| 收入增速（5年均值）| | | |
| FCF 转化率 | | | |

### 4. 估值

| 指标 | 当前值 | 历史均值 | 历史区间 |
|------|--------|---------|---------|
| TTM P/E | | | |
| Forward P/E（Futu 前瞻 PE）| | | |
| FCF Yield | | | |

**PE 百分位**（Futu `valuation_percentile`）：X% 分位 → [低估区 / 合理 / 高估区]
**安全边际**：当前价格 $XX，目标买点区间 $XX–$XX

### 📰 近期重要事件（futu-stock-digest）
| 时间 | 事件 | 影响 | 影响维度 |

### 💡 综合结论
- **多头逻辑**：- **空头逻辑**：- **近期催化剂**：- **风险提示**：
- **行动建议**：[持有 / 观察等待买点 / 深入研究 X 点再决定]（不给买卖指令）

### 🚨 卖出监控触发条件（持有期间定期检查）
- **基本面止损**：① 护城河侵蚀（核心业务毛利率连续 2 季下滑 >3pp，或主要客户流失公告）；② 盈利质量恶化（FCF/净利润 < 0.6 连续 2 季）；③ 管理层非计划重大变动（CEO/CFO 离职）；④ 竞争格局突变（主要竞争对手重大技术突破 / 颠覆性替代品出现）
- **机会成本换仓**：仅适用于组合视角——当其他候选标的综合评级高出本标的 ≥ 2 档时，触发相对吸引力复审
- **价格止损**：见 trading-debate Trader 的 `stop_loss`（技术破位止损，非本 skill 管辖）
```

## 常见会计陷阱速查

| 陷阱 | 场景 | 处理 |
|------|------|------|
| 商誉膨胀 ROIC | 并购历史丰富（MSFT / MA） | 同时报告含/不含商誉两个口径 |
| FCF 一次性波动 | 税务和解、资产出售、重组 | 识别并调整，用 3 年均值正常化 |
| PE 失真 | 亏损股、周期底部、大额减值 | 改用 EV/EBITDA 或 P/FCF |
| 高分红侵蚀内生价值 | 分红率 > FCF | 问"分红是否可持续" |
| 收入增长靠并购 | 有机增长 vs 收购增长 | 查 organic revenue growth |

## 分析存档（自动，输出报告后立即执行）

四步基本面报告输出完成后，**立即**调用 `Skill(skill="ticker-journal")` → write 操作：

- 来源标记为 `stock-fundamentals`，评级填 `纯分析`
- **完整四步报告**写入 `~/.stock-skills/reports/{TICKER}/`（通过 `write.py --report-file`）
- 同天其他 skill 已写档的条目禁止覆盖，各自独立区块
- 价格/估值字段从报告中的"估值三维结论"提取（DCF中枢 / 加权中枢 / 安全边际买点）
- 核心催化 = 护城河来源；核心风险 = 护城河侵蚀触发条件
- 字段从刚输出的报告中提取，禁止重新调用 API

## futuapi 脚本调用注意

**禁止用 `| python3 -c` 管道解析脚本输出**：`--json` 模式输出两行（`True\n{JSON}`），`json.load(stdin)` 会报 `Extra data`。直接读脚本全量输出，从 `data[0]` 取字段即可。
