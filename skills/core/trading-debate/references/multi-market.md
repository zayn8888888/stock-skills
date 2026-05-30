# v0.5 多市场混排基准选择

v0.4 组合层 PM 假设候选标的同市场（要么全美股、要么全港股）。v0.5 解决跨市场组合：
- 候选含 NVDA + 700 + 茅台时，**用什么基准做相对收益评估**？
- 不同市场的**交易时段、汇率、流动性**怎么对齐？
- alpha 怎么算？SPY 对中概股没意义，HSI 对美国半导体没意义。

## 设计动机

ai-hedge-fund 默认美股市场（SPY 基准），单市场。
TradingAgents 单标的辩论，无组合层，无基准选择问题。
本 skill v0.4 的相关性矩阵和组合层 PM 已支持单市场组合，但跨市场会出现**基准混乱 + 交易时段错位 + 汇率风险被忽略**三大问题。

v0.5 显式解决。

## 三大问题与解法

### 问题 1：基准选择

**单市场情况**（v0.4 已处理）：
- 全美股 → SPY
- 全港股 → HSI（或恒生科技 HSTECH，看候选行业偏向）
- 全 A 股 → 沪深 300

**跨市场情况**（v0.5 新增）：

按候选标的的**市值加权**选混合基准：

```
weights = {ticker: market_cap_pct for ticker in candidates}

if 美股权重 ≥ 70%:
    primary_benchmark = SPY
    secondary_benchmark = 各港股 / A 股的本地基准（用于本地标的反思）

elif 港股权重 ≥ 70%:
    primary_benchmark = HSI
    secondary_benchmark = ...

else:  # 真正混合
    primary_benchmark = "MSCI ACWI"（全球大盘，需 Tavily 拉数据）
    secondary_benchmark = "美股部分 vs SPY, 港股部分 vs HSI" 分开标注
```

**Why 市值加权而不是等权**：避免一只大盘股拖偏小盘股的本地基准对比。

### 问题 2：交易时段对齐

不同市场的**收盘时间（北京时间）**：
- 美股：04:00 / 05:00（夏令时 / 冬令时）
- 港股：16:00
- A 股：15:00

跨市场组合的**重大问题**：用收盘价计算"当日表现"时，三个市场的"当日"不是同一个时刻。

**解法**：固定使用北京时间次日 09:00 之前**最近的各市场收盘价**作为"当日数据时点"。
- 港股 / A 股用当日收盘
- 美股用前一交易日收盘（因为美股 04:00 收盘时北京已凌晨）

具体实现：

```python
def aligned_close_prices(date_bj):  # 北京时间日期
    return {
        "US": get_close_at(prev_us_trading_day(date_bj)),  # 美股前一日收盘
        "HK": get_close_at(date_bj),                        # 港股当日收盘
        "CN": get_close_at(date_bj),                        # A 股当日收盘
    }
```

并在共享报告头部明确标注：

```
data_timestamp: 2026-05-14 (BJ)
us_close_basis: 2026-05-13 16:00 ET  ← 注意：美股是前一交易日
hk_close_basis: 2026-05-14 16:00 BJ
cn_close_basis: 2026-05-14 15:00 BJ
```

### 问题 3：汇率风险

跨市场组合的**隐性风险**：USD/HKD 联系汇率虽稳定（7.75-7.85），但 USD/CNY 浮动 + CNH/CNY 价差实质会侵蚀回报。

**解法**：组合层 PM 输出时**显式标注汇率风险敞口**：

```json
{
  "fx_exposure": {
    "USD_pct": 60,
    "HKD_pct": 30,
    "CNY_pct": 10
  },
  "fx_risk_warning": "美元强势周期下美股仓位 60% 汇率敞口（对人民币计价投资者）"
}
```

并提供两种 alpha 计算口径：
- **本币口径**：美股 alpha 用 SPY、港股 alpha 用 HSI、A 股 alpha 用沪深 300
- **统一计价口径**：所有标的回报折成人民币（用决策日 + 当前 USD/CNY 中间价），与"沪深 300 全收益指数"比较

报告中**两个口径都给**，由用户根据自己的真实计价币种选择。

## 跨市场组合层 PM Prompt 增补

```
（在 v0.4 portfolio-layer.md 的 P3 PM prompt 基础上加：）

【跨市场约束】（仅当候选含 ≥ 2 个市场时生效）：
- 基准选择策略已确定为：{primary_benchmark}（{选择理由}）
- 交易时段对齐说明：{us_close_basis / hk_close_basis / cn_close_basis}
- 汇率敞口必须计算：USD / HKD / CNY 各自仓位百分比
- 汇率风险警示：{当前主要汇率趋势 — 强 / 弱 / 横盘}

【输出额外字段】（在 v0.4 portfolio_actions / total_turnover_pct 等基础上加）：
{
  "primary_benchmark": "SPY | HSI | 沪深 300 | MSCI ACWI",
  "benchmark_selection_reason": "<2 句话说明为何选这个>",
  "fx_exposure": {"USD_pct": ..., "HKD_pct": ..., "CNY_pct": ...},
  "fx_risk_warning": "<1-2 句话>",
  "alpha_calculation_modes": {
    "local_currency": "美股部分 vs SPY, 港股部分 vs HSI, A 股部分 vs 沪深 300",
    "unified_cny": "全部折人民币 vs 沪深 300 全收益"
  }
}
```

## 与 v0.3 / v0.4 的联动

### 与 v0.3（反思）联动

v0.3 反思的 alpha 计算需明确口径。v0.5 之后：
- 单市场决策 → 用本地基准（保持向后兼容）
- 跨市场组合决策 → 反思时同时记录两种口径的 alpha，让用户/AI 都看到差异
- 反思 prompt 增补："当前 alpha (本币口径) {X}，alpha (人民币口径) {Y}，若两者差距 > 5%，必须在反思中提到汇率影响"

### 与 v0.4（组合层）联动

v0.4 的相关性矩阵在跨市场情况下需调整：
- **不能直接用本币日收益做相关性**（交易时段不同会导致虚假相关性）
- **必须用对齐后的同时点收益**（按上文 problem 2 的对齐规则）
- 在相关性矩阵下方加一行说明："本相关性基于北京时间对齐的次日 09:00 前收盘数据"

## 自检（v0.5 实现时）

- [ ] 候选标的市值加权计算是否真做了，不是凭直觉选 primary_benchmark
- [ ] 交易时段对齐是否在共享报告头部明确标注了三个市场的 close_basis
- [ ] 汇率敞口是否真算了 USD/HKD/CNY 三个百分比，不是只标"美元为主"
- [ ] alpha 是否真给了两种口径，不是只给本币口径
- [ ] 相关性矩阵是否用了对齐数据，不是 raw 日收益

## 不允许的偷懒模式

- ❌ 跨市场组合默认用 SPY 当基准（覆盖率不足时极度误导）
- ❌ "data_timestamp: 2026-05-14"不标注三市场各自的 close_basis
- ❌ 汇率风险只用"美元为主"一句话糊弄
- ❌ alpha 只给本币口径（对人民币计价用户失真）
- ❌ 相关性矩阵用未对齐的数据（虚假高相关性）

## 实现优先级

`v0.5.0`（最小可用）：
- 基准选择策略（市值加权）
- 交易时段对齐
- 汇率敞口标注

`v0.5.1`（增强）：
- 双 alpha 口径计算
- 相关性矩阵对齐数据
- 反思 prompt 联动汇率口径
