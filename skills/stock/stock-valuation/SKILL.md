---
name: stock-valuation
description: 股票定量估值计算器。接受股票名称或代码，用三种主流方法（DCF 现金流折现、P/E 相对估值、PEG 成长调整）计算合理估值区间，展示所有中间计算步骤，输出安全边际买点区间。触发场景：(1) 用户说"帮我算一下 XXX 的估值 / 估值区间 / 合理价格范围"；(2) 用户问"XXX 值多少钱 / XXX 现在贵不贵 / 估值怎么算的"；(3) 用户给出股票代码并明确想要 DCF / P/E / PEG 等估值计算；(4) 用户说"帮我用三种方法估一下 XXX"。不适用于：纯技术分析（用 stock-analyzer）、护城河/商业模式分析（用 stock-fundamentals）、板块研究。
---

# 股票三维估值计算

## 使命

把估值"黑盒"变成"玻璃盒"——每一个数字从哪里来、为什么这么算、假设是否合理，全部透明呈现。

## 参数说明

用户输入的股票代码需要拆分为 `ticker` 和 `market` 两个参数：
- 美股：`ticker: "AAPL"`, `market: "US"`
- 港股：`ticker: "00700"`, `market: "HK"`
- A 股沪市：`ticker: "600519"`, `market: "SH"`
- A 股深市：`ticker: "000001"`, `market: "SZ"`

## 执行前必读（确定 ticker/market 后立即执行）

```bash
Read references/calculation-methods.md   # DCF/PE/PEG 完整计算步骤、公式、敏感性分析
Read references/china-adr-pitfalls.md    # 中概股 ADR 专项陷阱（PDD/BABA/BIDU 等）
```

## Step 0.5：公司类型前置判断（在拉财务数据之前完成）

根据 `get_company_info` 返回的 `sector` 字段 + 财务特征，按以下优先级顺序匹配（前面匹配即停），决定后续估值模板：

| 条件 | 判定类型 | 估值模板 |
|------|---------|---------|
| sector 含 `Financial` / `Banks` / `Insurance` / `Brokerage` | **金融股** | P/B + ROE 剩余收益模型，DCF 权重 = 0，PEG 不适用 |
| sector 含 `Energy` / `Materials` / `Steel` / `Shipping` / `Chemicals`，**且** 近 3 年毛利率波动 > 15pp（从财务数据验证） | **周期股** | mid-cycle EPS × 5 年正常化 PE + EV/EBITDA，DCF 权重 = 0 |
| TTM EPS < 0（亏损） | **亏损成长股** | reverse DCF（算市值隐含的未来增速是否合理）+ P/S / EV/Revenue，正向 DCF 跳过 |
| 以上均不符合 | **正常盈利公司** | 现有默认权重：DCF 40% / P/E 35% / PEG 25% |

**模糊区处理**：sector 落在 Technology / Semiconductor 等交叉领域时，先看 EPS 是否为正，再看毛利率波动；最终由 LLM 根据商业模式特征判断——但须在报告中说明判断依据（如"NVDA 毛利率稳定 >70%、无明显周期性，判定为正常盈利公司而非周期股"）。

> 输出格式：在 Step 3 开头标注 `📋 公司类型：XXX 股 → 使用 XXX 模板`；金融股/周期股/亏损成长股需加 `⚠️` 警示。

## Step 1：并行拉取数据

#### 1a. 实时行情（当前价格 + PE）

```
get_quote_snapshot({ ticker: "<TICKER>", market: "<MARKET>" })
```

返回字段包含：`curPrice`（最新价）、`pe`（TTM PE）、`pb`、`marketCap`、`turnoverRate` 等。

#### 1b. 公司信息（用于 Step 0.5 行业判断）

```
get_company_info({ ticker: "<TICKER>", market: "<MARKET>" })
```

#### 1c. 财务数据（分层，优先 capability 工具 → 兜底 Tavily）

**层 1：结构化数据**（全市场可用）
```
# 财务报表（A 股可能返回空，降层 2）
get_financial_statements({ ticker: "<TICKER>", market: "<MARKET>", params: { num: 8 } })

# 估值详情（全市场含 A 股）
get_valuation_detail({ ticker: "<TICKER>", market: "<MARKET>" })
```

JSON 字段提取要点：
- 财务 → `report_list[].field_id`：`8048`(稀释EPS) / `8037`(净利润)；每条含 `yoy / qoq`
- 估值 → `trend.current_value / forward_value / average_value`（PE 当前/前瞻/均值）/ `trend.avg_minus_1_stddev / avg_plus_1_stddev`（均值 ±1σ）/ `trend.valuation_percentile`（当前 PE 百分位 0~1）

**降层规则**：
- `get_financial_statements`：A 股返回空 → 层 2 Tavily 补 FCF/EPS
- `get_valuation_detail`：A 股**可用**，继续执行（PE 百分位直接用）

**层 2：Tavily 兜底**（4 条并行）
```
查询 1：<公司名> annual free cash flow FCF 2022 2023 2024 site:macrotrends.net OR stockanalysis.com
查询 2：<公司名> EPS earnings per share TTM 2024 2025 estimate forward annual
查询 3：<公司名> historical PE ratio 5 year average low high range
查询 4：<公司名> revenue growth rate 3 year 5 year CAGR analyst estimate 2025 2026
```

## Step 2：整理 6 个核心变量

| 变量 | 说明 | 优先来源 |
|------|------|---------|
| `current_price` | 当前股价 | `get_quote_snapshot` → `curPrice` |
| `ttm_eps` | TTM 每股收益 | `get_financial_statements` → `report_list` field_id=8048 / Tavily |
| `eps_growth_rate` | 预期 EPS 增速 | 近 3 期 yoy 均值 + 分析师预测 |
| `fcf_ttm` | TTM 自由现金流 | `get_financial_statements` → `report_list` 经营CF-资本支出 / Tavily |
| `pe_range` | 历史 P/E 低/均/高 | `get_valuation_detail` → `trend` / Tavily |
| `shares_outstanding` | 流通股数量 | `get_quote_snapshot` 返回 |

**数据质量规则**：EPS 为负 → P/E 和 PEG 不适用，标注跳过；FCF 波动 > 30% → 取 3 年均值；缺失数据明确标注替代假设。

## Step 3：三种方法计算

> **前置：PE 历史分位结构变化检测**（仅正常盈利公司执行；金融/周期/亏损成长股已换模板，跳过）
>
> 从财务数据取近 3 年毛利率序列（或最新年 vs 3 年前对比）：
> - 若变化 **≤ 10pp**：历史 PE 分位正常使用
> - 若变化 **> 10pp**：输出 `⚠️ 商业模式结构变化（毛利率 3 年变化 Xpp），历史 PE 分位可能失效。本次 PE 历史分位权重降为 50%，行业相对 PE 权重升至 50%。`
>
> 典型案例：苹果 2015→2019 服务收入占比从 8% 升至 18%，PE 中枢从 12x 永久升至 25x，历史分位法持续"高估"提示但从未回归。

完整计算步骤、公式、敏感性分析见 [references/calculation-methods.md](references/calculation-methods.md)。

| 方法 | 逻辑 | 关键输入 |
|------|------|---------|
| **DCF 现金流折现** | 把未来 FCF 折算回今天 | fcf_ttm / eps_growth_rate / WACC |
| **P/E 相对估值** | 和自己历史 PE 比 | ttm_eps / pe_range（`get_valuation_detail` trend 或 Tavily） |
| **PEG 成长调整** | 增速校正后的真实估值 | ttm_eps / eps_growth_rate / 合理 PEG 区间 |

## Step 4：汇总 + 买点

默认权重 DCF 40% / P/E 35% / PEG 25%（可调，需说明）。差距 > 20% 时展示分歧原因。

```
安全边际买点（7折）= 综合中枢 × 0.70
强力买点（6折）= 综合中枢 × 0.60
```

## 输出格式

```markdown
## 📊 <公司名>（<TICKER>.<MARKET>）三维估值报告 · <日期>
**当前价格**：$XX  |  **当前 TTM PE**：XXx  |  **PE 百分位**：X%

### 📥 数据输入一览
| 指标 | 数值 | 数据来源 | 备注 |

### 方法一：DCF  →  DCF 估值区间：$XX — $XX（中枢 $XX）
### 方法二：P/E  →  P/E 估值区间：$XX — $XX（中枢 $XX）
### 方法三：PEG  →  PEG 估值区间：$XX — $XX（中枢 $XX）

### 🎯 综合结论
| 方法 | 悲观 | 中枢 | 乐观 | 权重 |
| DCF  |      |      |      | 40%  |
| P/E  |      |      |      | 35%  |
| PEG  |      |      |      | 25%  |
| **加权中枢** |  | **$XX** |  |  |

| 买点档位 | 价格 | 相对当前 |
| 强力买点（6折） | $XX | 需下跌 X% |
| 安全边际（7折） | $XX | 需下跌 X% |
| 合理中枢 | $XX | — |

> ⚠️ 本报告为估值模型计算结果，不构成投资建议。
```

## 中概股 / 中国 ADR

处理 PDD / BABA / BIDU 等标的时有专项陷阱（单位跳变 / 汇率时效 / VIE 折价）——见 [references/china-adr-pitfalls.md](references/china-adr-pitfalls.md)。

## 可选增强技能

以下技能可提供额外数据维度，均为可选增强，核心估值计算不依赖它们：

- **futu-technical-anomaly**：技术面异动检测（量价突破、均线交叉等）
- **futu-capital-anomaly**：资金面异动检测（大单净流入、主力资金异常等）
- **futu-news-search**：新闻搜索（利好/利空事件驱动）
- **futu-comment-sentiment**：市场评论情绪分析
- **futu-derivatives-anomaly**：衍生品异动检测（期权隐含波动率异常等）
- **futu-stock-digest**：个股综合摘要

核心数据已通过上方的 capability 工具（`get_quote_snapshot`、`get_valuation_detail`、`get_financial_statements` 等）完整覆盖。
