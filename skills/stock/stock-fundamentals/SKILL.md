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

## 数据获取流程

### Step 0：识别 ticker 与 market

将用户输入转换为 `ticker` + `market` 参数：
- 纯英文字母 1-5 位 → `ticker: "<TICKER>", market: "US"`（如 `AAPL` → `ticker: "AAPL", market: "US"`）
- 港股 5 位数字 → `ticker: "0XXXX", market: "HK"`（如 `00700` → `ticker: "00700", market: "HK"`）
- A 股沪市 → `ticker: "6XXXXX", market: "SH"`
- A 股深市 → `ticker: "0XXXXX" / "3XXXXX", market: "SZ"`

先单独调用 `get_quote_snapshot` 验证代码是否有效，成功后再启动后续并行调用。

### 行情数据

```
get_quote_snapshot({ ticker, market })
get_company_info({ ticker, market })
```

### 财务与基本面数据（分层数据源）

**优先级**：capability tools 结构化接口 → Tavily 搜索兜底。

#### 层 1：结构化接口（并行执行）

```
# 财务三大表（A 股返回 report_list=[]，降层 2 Tavily）
get_financial_statements({ ticker, market, params: { num: 8 } })

# 估值分位数（全市场含 A 股）
get_valuation_detail({ ticker, market })

# 股东持股（A 股报错，仅港美股）
get_shareholders_overview({ ticker, market })

# 分红历史（全市场含 A 股）
get_corporate_dividends({ ticker, market })
```

JSON 字段提取要点：
- 财务三大表 → `report_list[]`，每条含 `yoy / qoq`
- 估值 → `trend.valuation_percentile`（历史百分位）/ `trend.forward_value`（前瞻 PE）/ `profit_growth_rate`（盈利 vs 市值增速）

**各接口 A 股支持情况**：

| 接口 | A 股 | 降级 |
|------|------|------|
| `get_financial_statements` | 空列表 | → 层 2 Tavily 补财务数据 |
| `get_valuation_detail` | 可用 | — |
| `get_shareholders_overview` | 明确报错 | A 股跳过，Tavily 补股东结构 |
| `get_corporate_dividends` | 可用 | — |

#### 层 2：Tavily 搜索兜底（层 1 无数据时，并行）

```
1. "<公司名> revenue gross margin net margin trend 2022 2023 2024"
2. "<公司名> ROIC return on invested capital free cash flow annual"
3. "<公司名> business model how does it make money moat competitive advantage"
4. "<公司名> PE ratio historical valuation fair value 2024 2025"
5. "<公司名> risks competition threats bear case"
```

报告"数据来源"行注明使用层级（`结构化接口` / `Tavily 搜索`）。

### 近期新闻动态（futu-stock-digest — 可选增强）

在四步分析**开始前**，先调用 `futu-stock-digest` skill 扫描近 7 天新闻，识别以下红旗信号：

| 信号类型 | 影响维度 |
|---------|---------|
| 监管处罚 / 罚款 | Step 2 护城河 |
| 重大并购 / 剥离 | Step 3 财务验证（商誉 / ROIC） |
| 竞争对手重大突破 | Step 2 护城河侵蚀 |
| 管理层异动 | 综合结论风险部分 |
| 盈利预警 / 上调 | Step 4 估值（更新正常化 FCF） |

> `futu-stock-digest` 为可选增强 skill。若不可用，使用 Tavily MCP 搜索近 7 天新闻作为替代。

## 四步分析框架

完整细节（指标定义、判断标准、会计陷阱）见 [references/four-steps.md](references/four-steps.md)。

| 步骤 | 核心问题 | 关键指标 |
|------|---------|---------|
| **Step 1 商业模式** | 靠什么赚钱？谁付钱？单位经济学健康吗？ | 收入来源 / 成本结构 / 毛利率 / 单位经济学指标 |
| **Step 2 护城河** | 竞争优势是什么？能持续多久？ | 5 类护城河 / ROIC 验证 / 反驳问题 |
| **Step 3 财务验证** | 数字是否支撑护城河叙述？ | 毛利率 / ROIC / 收入稳定性 / FCF 转化率 |
| **Step 4 估值** | 当前价格是便宜、合理还是昂贵？ | P/E 相对估值 / FCF 收益率 / 反向 DCF |

## 执行流程

1. **识别代码**：中文名/英文简称 → `ticker` + `market` 参数
2. **新闻快扫**：调用 `futu-stock-digest`（可选），识别红旗信号；不可用时用 Tavily 搜索替代
3. **并行拉取数据**：行情快照 + 财务三大表（或 Tavily 5 条）**同时发出**
4. **检查数据质量**：PE 异常？FCF 有一次性项目？新闻红旗与静态分析矛盾？
5. **填充四步框架**：按 Step 1→4 顺序，每步结论有数据支撑，与新闻红旗交叉对照；Step 1 完成商业模式识别后，按类型展开单位经济学（见下方）
6. **输出报告**：按下方模板，证伪视角，"近期重要事件"不可省略

## 单位经济学分支（Step 1 商业模式识别类型后展开）

按商业模式类型选对应分支计算；**数据未公开时跳过，不估算**，标注「单位经济学：数据未披露，跳过」。

| 类型 | 核心指标 | 红旗阈值 |
|------|---------|---------|
| **SaaS / 订阅制** | LTV / CAC（若公司披露）；Net Revenue Retention (NRR) | LTV/CAC < 3 = 增长不可持续；NRR < 100% = 客户在流失 |
| **平台 / 双边市场** | Take Rate 近 3 年趋势；GMV 增速 vs 收入增速 | Take Rate↑ + GMV↓ = 在抽干生态；收入增速 >> GMV = 靠提价非有机增长 |
| **零售 / 餐饮** | 同店销售增速 (SSS)；坪效同比 vs 租金涨幅 | SSS 连续 2 年负增长；坪效增速 < 租金涨幅 = 单位盈利在收缩 |
| **SaaS 销售效率** | Magic Number = 季度新增 ARR / 上季度 S&M 费用 | Magic Number < 0.5 = 销售效率低，烧钱扩张不可持续 |
| **其他 / 数据未公开** | — | 跳过，标注原因 |

## 输出格式

```markdown
## <公司名>（<CODE>）基本面研究报告 · <日期>
**分析结论（一句话）**：[公司是什么、护城河强弱、当前估值水平]
**数据来源**：[结构化接口 / Tavily 搜索]

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
| Forward P/E（前瞻 PE）| | | |
| FCF Yield | | | |

**PE 百分位**（`valuation_percentile`）：X% 分位 → [低估区 / 合理 / 高估区]
**安全边际**：当前价格 $XX，目标买点区间 $XX–$XX

### 近期重要事件（futu-stock-digest 或 Tavily）
| 时间 | 事件 | 影响 | 影响维度 |

### 综合结论
- **多头逻辑**：- **空头逻辑**：- **近期催化剂**：- **风险提示**：
- **行动建议**：[持有 / 观察等待买点 / 深入研究 X 点再决定]（不给买卖指令）

### 卖出监控触发条件（持有期间定期检查）
- **基本面止损**：① 护城河侵蚀（核心业务毛利率连续 2 季下滑 >3pp，或主要客户流失公告）；② 盈利质量恶化（FCF/净利润 < 0.6 连续 2 季）；③ 管理层非计划重大变动（CEO/CFO 离职）；④ 竞争格局突变（主要竞争对手重大技术突破 / 颠覆性替代品出现）
- **机会成本换仓**：仅适用于组合视角——当其他候选标的综合评级高出本标的 >= 2 档时，触发相对吸引力复审
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
