---
name: stock-valuation
description: 股票定量估值计算器。接受股票名称或代码，用三种主流方法（DCF 现金流折现、P/E 相对估值、PEG 成长调整）计算合理估值区间，展示所有中间计算步骤，输出安全边际买点区间。触发场景：(1) 用户说"帮我算一下 XXX 的估值 / 估值区间 / 合理价格范围"；(2) 用户问"XXX 值多少钱 / XXX 现在贵不贵 / 估值怎么算的"；(3) 用户给出股票代码并明确想要 DCF / P/E / PEG 等估值计算；(4) 用户说"帮我用三种方法估一下 XXX"。不适用于：纯技术分析（用 stock-analyzer）、护城河/商业模式分析（用 stock-fundamentals）、板块研究。
---

# 股票三维估值计算

## 使命

把估值"黑盒"变成"玻璃盒"——每一个数字从哪里来、为什么这么算、假设是否合理，全部透明呈现。

## Step 0：代码标准化

将用户输入映射为富途代码：美股 `US.AAPL` / 港股 `HK.00700` / A 股 `SH.600519`。

## Step 1：并行拉取数据

#### 1a. 富途行情（当前价格 + PE）
```bash
python3 skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
# 或 SDK：ctx.get_market_snapshot(['<CODE>'])
```

#### 1b. 财务数据（分层，优先 Futu → 兜底 Tavily）

**层 1：Futu 结构化**（美股/港股，需 OpenD）
```python
import futu as ft
ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)
ret, fdata = ctx.get_financials_statements('<CODE>', num=12)
# ⚠️ 返回类型是 dict，不是 DataFrame——禁止调 .to_dict() / .columns / .head()
# ⚠️ 返回 key 是 report_list，不是 statement_list；A股返回空列表，降层 2
reports = fdata.get('report_list', [])
# 每条含 field_id=8048(稀释EPS) / 8037(净利润) / yoy / qoq

ret2, vdata = ctx.get_valuation_detail('<CODE>')
# trend['current_value'/'forward_value'/'average_value'] PE 当前/前瞻/均值
# trend['avg_minus_1_stddev'/'avg_plus_1_stddev']        均值 ±1σ（历史低/高 PE 参考）
# trend['valuation_percentile']                          当前 PE 百分位（0~1）
ctx.close()
```
**降层规则**：
- `get_financials_statements`：A 股返回空 → 层 2 Tavily 补 FCF/EPS
- `get_valuation_detail`：A 股**可用**，继续执行（PE 百分位直接用）
- OpenD 不可用 → 整个层 1 跳过

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
| `current_price` | 当前股价 | 富途行情 |
| `ttm_eps` | TTM 每股收益 | Futu `report_list` field_id=8048 / Tavily |
| `eps_growth_rate` | 预期 EPS 增速 | 近 3 期 yoy 均值 + 分析师预测 |
| `fcf_ttm` | TTM 自由现金流 | Futu `report_list` 经营CF-资本支出 / Tavily |
| `pe_range` | 历史 P/E 低/均/高 | Futu `get_valuation_detail` trend / Tavily |
| `shares_outstanding` | 流通股数量 | 富途快照 |

**数据质量规则**：EPS 为负 → P/E 和 PEG 不适用，标注跳过；FCF 波动 > 30% → 取 3 年均值；缺失数据明确标注替代假设。

## Step 3：三种方法计算

完整计算步骤、公式、敏感性分析见 [references/calculation-methods.md](references/calculation-methods.md)。

| 方法 | 逻辑 | 关键输入 |
|------|------|---------|
| **DCF 现金流折现** | 把未来 FCF 折算回今天 | fcf_ttm / eps_growth_rate / WACC |
| **P/E 相对估值** | 和自己历史 PE 比 | ttm_eps / pe_range（Futu trend 或 Tavily） |
| **PEG 成长调整** | 增速校正后的真实估值 | ttm_eps / eps_growth_rate / 合理 PEG 区间 |

## Step 4：汇总 + 买点

默认权重 DCF 40% / P/E 35% / PEG 25%（可调，需说明）。差距 > 20% 时展示分歧原因。

```
安全边际买点（7折）= 综合中枢 × 0.70
强力买点（6折）= 综合中枢 × 0.60
```

## 输出格式

```markdown
## 📊 <公司名>（<CODE>）三维估值报告 · <日期>
**当前价格**：$XX  |  **当前 TTM PE**：XXx  |  **PE 百分位**：X%（Futu）

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

## 中概股 / 中国 ADR 专项陷阱

处理 PDD / BABA / BIDU / NTES / FUTU 等标的时，以下四类错误高频出现：

### 1. 分析师目标价 / EPS 单位跳变（CNY ↔ USD）

Barron's / MarketWatch / 雅虎财经等英文源对中概股的共识数据经常**隐式混用 CNY 和 USD**，且不标货币单位。

**识别规则（满足任一即标"单位可疑，需验证"）**：
- 分析师目标价比当前股价高出 500%+ → 大概率是 CNY 值
- EPS 前后两期数字跳变 5-8 倍（如 $11.96 → $82.80）→ 币种跳变，不是真实增长
- 同源数据里分析师目标价 vs 当前股价比值 ≈ 当前 USD/CNY 汇率（~7.2-7.3）→ 确认单位混用

**修正方法**：可疑数字 ÷ 当前 USD/CNY 汇率，看换算后是否与其他独立源吻合。独立交叉验证源：chartmill / macrotrends / stockanalysis（这些通常标注货币）。

### 2. 净现金 / 财务数据汇率时效性

中概股财报以 CNY 列报，换算 USD 时**必须用报告期对应的汇率**，不能用记忆值：

| 时段 | 参考 USD/CNY |
|------|-------------|
| 2024 年初 | ~7.10–7.20 |
| 2024 年底 | ~7.25–7.30 |
| 2025 年中 | ~7.15–7.25 |

偏差 0.3-0.4（如用 7.67 代替 7.30）对每股 DCF 影响约 2-3%，数字不大但汇率标注错误会误导读者。

### 3. DCF vs P/E 差距的 VIE 折价解释

对中国 ADR，DCF 估值系统性高于 P/E 估值（差距常达 40-80%），**根因不是上行空间，而是 VIE 结构折价**：

> DCF 框架假设 FCF 完全归属股东，但中国 ADR 的 VIE 结构下，境外投资者对 FCF 的实际请求权存在法律不确定性。市场通过压低 P/E 给这个"可达性折价"定价，而 DCF 模型没有内置此折价机制。

**正确表述**：方法差距 = VIE 折价本身，不是模型给出的"上行空间"。报告分歧分析必须点明这句话，否则用户会误把折价当套利机会。

**处理方式**：在 DCF 结果上主动施加 VIE 折扣系数（通常 15-30%），使三法收敛；或直接以 P/E 法为锚，DCF 作为上限参考。

### 4. EPS 增速的连带影响

若 EPS 源数据存在单位跳变（陷阱 1），用前后两期计算的增速会严重失真（如算出 +593%）。

**防御规则**：计算 EPS 增速前先验证两期数字的量级是否一致（相差 < 30% 为正常区间，相差 > 100% 先查单位）。
