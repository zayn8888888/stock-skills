# v0.4 多标的组合层 Portfolio Manager

把 ai-hedge-fund 的"跨标的 Portfolio 优化"落地。区别于 v0.1-v0.3 的单标的 PM——这一层在所有候选标的各自跑完七阶段后，在**组合维度**做最终仓位分配。

## 设计动机

单标的 trading-debate 输出"NVDA Overweight 5-6%"，但用户实际持仓是组合：
- 已持 AAPL 8% / TSLA 4% / 现金 30%
- 想加 NVDA，问题是：5% 还是 8%？要不要先减 AAPL？要不要换 TSLA 给 NVDA？
- 这些是**组合层**问题，单标的辩论解不了

ai-hedge-fund 的 `portfolio_manager.py` 看 17 个大师对每只标的的信号 + risk_manager 的仓位上限 + 当前持仓 → 输出**最终交易动作**（buy/sell/short/cover + shares）。本 skill v0.4 借鉴此思路，但简化为**仓位百分比建议**（不直接出股数，因为不接交易）。

## 触发场景

用户输入形如：
- "我想用 trading-debate 排序：NVDA / AAPL / TSLA / GOOG 哪个该加仓"
- "帮我做组合优化，候选 [NVDA, 700, 9988]"
- "现在持仓 [AAPL 8%, TSLA 4%, 现金 30%]，trading-debate 看看怎么调"

## 执行流程

### 阶段 P1：批量执行单标的辩论（并行）

对候选清单中每只标的，**独立**跑完整七阶段，产出：

```json
{
  "ticker": "US.NVDA",
  "pm_decision": {
    "rating": "Overweight",
    "executive_summary": "...",
    "investment_thesis": "...",
    "price_target": 260.00
  },
  "trader_proposal": {
    "entry_price": 215, "stop_loss": 198, "position_sizing": "5-7%"
  },
  "master_signals_summary": {"bullish": 3, "bearish": 1, "neutral": 2},
  "data_timestamp": "2026-05-14 09:49"
}
```

**强制约束**：
- 每只标的的七阶段都不能跳——不允许"批量优化所以省略 Risk 三方辩论"
- 数据时点必须对齐（所有标的同一时刻拉数据，差距 < 30 分钟）
- 失败标的明确标注，不静默丢弃

### 阶段 P2：相关性矩阵采集

借鉴 ai-hedge-fund risk_manager.py 第 78-85 行：

```python
# 对所有候选标的 + 现有持仓，拉 60 日日 K 线
# 计算 daily returns 矩阵 → 相关性矩阵
returns_df = pd.DataFrame({ticker: prices.pct_change() for ticker in all_tickers})
correlation_matrix = returns_df.corr()
```

输出：

```
相关性矩阵（60 日）：
        NVDA   AAPL   TSLA   GOOG
NVDA    1.00   0.62   0.55   0.70
AAPL    0.62   1.00   0.48   0.81
TSLA    0.55   0.48   1.00   0.42
GOOG    0.70   0.81   0.42   1.00
```

**用途**：
- 高相关（> 0.7）的标的，组合中只能选一个或减半仓位
- 低相关（< 0.3）的标的可分散持仓

### 阶段 P3：Portfolio Manager 跨标的辩论

**新角色：组合层 PM**（区别于单标的 PM）。

输入：
- 候选标的的单标的 PM 决策包（来自 P1）
- 相关性矩阵（来自 P2）
- 用户当前持仓（如有）+ 现金比例
- 总组合限制（默认：单标的 ≤ 10%，单行业 ≤ 25%，现金 ≥ 10%）

Prompt 模板：

```
你是组合层投资经理，需要把多个候选标的的单标的决策汇总为组合层动作。

候选标的决策：
{tickers_decisions_json}

相关性矩阵：
{correlation_matrix}

当前持仓：
{current_portfolio}

总组合约束：
- 单标的上限：10%
- 单行业上限：25%
- 现金下限：10%
- 单交易日总换手 ≤ 20%（避免过度交易）

【决策规则】：
1. **优先级排序**：按单标的 PM 评级（Buy > Overweight > Hold > Underweight > Sell）+ 信心度排序
2. **相关性折扣**：若两个候选 60 日相关性 > 0.7，只保留评级更高的或减半两者仓位
3. **行业封顶**：超过单行业 25% 的部分必须削减
4. **资金来源**：新增仓位的现金来自
   - 现有 Underweight / Sell 标的的减仓（优先）
   - 现金池
   - 不允许卖出 Buy / Overweight 标的换其他 Buy / Overweight（避免过度调仓）
5. **不操作选项**：如果换仓收益不显著（净 alpha < 5% 预期），明确建议"维持原组合"

输出结构：
{
  "portfolio_actions": [
    {
      "ticker": "US.NVDA",
      "action": "buy",
      "from_position_pct": 0,
      "to_position_pct": 5,
      "reasoning": "<引用单标的 PM 评级 + 相关性 + 资金来源>"
    },
    {
      "ticker": "US.AAPL",
      "action": "trim",
      "from_position_pct": 8,
      "to_position_pct": 5,
      "reasoning": "<...>"
    }
  ],
  "total_turnover_pct": <0-100>,
  "post_trade_cash_pct": <0-100>,
  "rationale": "<2-4 句组合层逻辑>",
  "risk_warnings": ["<必须列出的组合层风险点>"]
}
```

### 阶段 P4：组合层复盘锚点

事前埋点 3 个组合层指标（区别于单标的的 3 指标）：

| # | 组合层指标 | 阈值 | 不达成应对 |
|---|-----------|------|----------|
| 1 | 组合 3 月夏普比率 ≥ 基准 | 计算 portfolio_return / portfolio_vol | 低于基准 → 重新评估调仓逻辑 |
| 2 | 单标的最大回撤 ≤ 行业 ATR × 1.5 | NVDA 10%、AAPL 5% 等 | 超 → 触发个股止损 |
| 3 | 行业集中度未漂移 | 单行业仍 ≤ 25% | 超 → 强制再平衡 |

## 不允许的偷懒模式

- ❌ 跳过相关性矩阵直接出仓位（高相关风险被掩盖）
- ❌ 单标的批量执行时偷懒省略 Risk 三方
- ❌ 组合层 PM 推荐"全部 Buy 5%"（规避真正的取舍决策）
- ❌ 未计算总换手率就输出（可能 50%+ 换手不可执行）
- ❌ 不引用相关性数据就说"建议分散"

## 与 ai-hedge-fund 的差异

| 维度 | ai-hedge-fund | 本 skill v0.4 |
|------|---------------|---------------|
| 输出粒度 | 具体股数（buy 100 shares） | 仓位百分比（5%）|
| 信号源 | 17 个大师独立投票 | 7 个大师 + Bull/Bear/Risk 多角色辩论 |
| 相关性矩阵 | ✅ | ✅ 借鉴 |
| 行业封顶 | 不显式 | ✅ 默认 25% |
| 换手控制 | 不显式 | ✅ 默认 20% |
| 现金管理 | ✅ | ✅ 默认下限 10% |

## 实现检查点

`v0.4.0`（最小可用）：
- 候选 ≤ 5 个标的
- 相关性矩阵
- 组合层 PM
- 组合层复盘锚点

`v0.4.1`（增强）：
- 候选 6-10 个标的（性能优化：master agents 信号缓存复用）
- 多市场组合（美 + 港混排，需基准选择处理）
- 与 v0.3 reflection 联动：组合层 lessons 汇总
