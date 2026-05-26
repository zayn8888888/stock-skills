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

## 数据工具

### 行情数据（futuapi）
```bash
python3 skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
python3 skills/futuapi/scripts/quote/get_stock_info.py <CODE> --json
```

### 财务与基本面数据（分层数据源）

**优先级**：Futu 结构化接口 → Tavily 搜索兜底。

#### 层 1：Futu 结构化接口（并行执行，需 OpenD）
```python
import futu as ft
ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)

# 财务三大表（⚠️ 返回 key 是 report_list，不是 statement_list）
ret, data = ctx.get_financials_statements('<CODE>', num=8)
reports = data.get('report_list', [])   # 每条含 yoy / qoq，直接可用

ret2, vdata = ctx.get_valuation_detail('<CODE>')
# vdata['trend']['valuation_percentile'] 历史百分位 | ['forward_value'] 前瞻 PE
# vdata['profit_growth_rate'] 盈利 vs 市值增速对比

ret3, sdata = ctx.get_shareholders_overview('<CODE>')   # 股东持股结构
ret4, ddata = ctx.get_corporate_actions_dividends('<CODE>')  # 分红历史
ctx.close()
```
**降层条件**：`report_list` 为空（A 股常见）或 OpenD 不可用 → 执行层 2

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

在四步分析**开始前**，先调用 `futu-stock-digest` skill 扫描近 7 天新闻（无需 OpenD），识别以下红旗信号：

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
| **Step 1 商业模式** | 靠什么赚钱？谁付钱？ | 收入来源 / 成本结构 / 毛利率 |
| **Step 2 护城河** | 竞争优势是什么？能持续多久？ | 5 类护城河 / ROIC 验证 / 反驳问题 |
| **Step 3 财务验证** | 数字是否支撑护城河叙述？ | 毛利率 / ROIC / 收入稳定性 / FCF 转化率 |
| **Step 4 估值** | 当前价格是便宜、合理还是昂贵？ | P/E 相对估值 / FCF 收益率 / 反向 DCF |

## 执行流程

1. **识别代码**：中文名/英文简称 → 富途完整代码
2. **新闻快扫**：调用 `futu-stock-digest`，识别红旗信号
3. **并行拉取数据**：Futu 行情 + 财务三大表（或 Tavily 5 条）**同时发出**
4. **检查数据质量**：PE 异常？FCF 有一次性项目？新闻红旗与静态分析矛盾？
5. **填充四步框架**：按 Step 1→4 顺序，每步结论有数据支撑，与新闻红旗交叉对照
6. **输出报告**：按下方模板，证伪视角，"近期重要事件"不可省略

## 输出格式

```markdown
## 📋 <公司名>（<CODE>）基本面研究报告 · <日期>
**分析结论（一句话）**：[公司是什么、护城河强弱、当前估值水平]
**数据来源**：[Futu 结构化 / Tavily 搜索]

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
```

## 常见会计陷阱速查

| 陷阱 | 场景 | 处理 |
|------|------|------|
| 商誉膨胀 ROIC | 并购历史丰富（MSFT / MA） | 同时报告含/不含商誉两个口径 |
| FCF 一次性波动 | 税务和解、资产出售、重组 | 识别并调整，用 3 年均值正常化 |
| PE 失真 | 亏损股、周期底部、大额减值 | 改用 EV/EBITDA 或 P/FCF |
| 高分红侵蚀内生价值 | 分红率 > FCF | 问"分红是否可持续" |
| 收入增长靠并购 | 有机增长 vs 收购增长 | 查 organic revenue growth |
