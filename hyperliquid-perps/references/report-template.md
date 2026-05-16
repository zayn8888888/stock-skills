# 输出报告模板

> 本 skill 的标准输出格式。所有调用方（stock-analyzer / trading-debate / event-calendar / 直接用户提问）都按此模板呈现。

## ⚠️ 数字格式硬规则（**必须遵守**）

Claude Code 终端会把美元符号开头的数字（如 `美元符号125.8M`）当作 LaTeX inline math 渲染，导致两个美元符号之间的内容被吞（实测 `美元符号125.8M` 输出成 `.8M`）。

**解决方案**：所有货币数额一律用 **后缀** 表示，禁止用美元符号前缀。

| ❌ 禁止（美元符号前缀） | ✅ 推荐（USD 后缀） |
|---|---|
| `美元符号230.84` | `230.84 USD` 或 `mark 230.84` |
| `美元符号125.8M` | `125.8M USD` 或 `OI 125.8M` |
| `OI ≥ 美元符号1M` | `OI ≥ 1M USD` |
| `成交 美元符号96M` | `成交 96M USD` 或 `dayVlm 96M` |

> 表格中的 `美元符号` 仅用于文字说明，实际书写时使用 `\$` 字符。如果**一定要**在输出里出现 `\$` 前缀（比如引用第三方文档原文），必须用反引号包起来：`` `\$230.84` `` ——render 成 code 不会被 KaTeX 吃。

## 模板 A：单标的快照（最常用）

```markdown
# Hyperliquid 链上镜像 — {TICKER}

> 生成时间：{YYYY-MM-DD HH:MM UTC}（HKT {+8 时间}）
> 数据来源：Hyperliquid `/info`（公开端点，无 API key）

## 主镜像

- **合约**：`{coin}`（{dex} dex）
- **当前 mark**：{markPx} USD（24h {chgPct:+.2f}%）
- **oracle 偏差（premium）**：{premiumBp:+.1f} bp
- **流动性等级**：{✅ 可信 / ⚠️ 仅参考 / ⛔ 不要使用}
  - OI 名义敞口：{oiNotionalUsd:,.0f} USD
  - 24h 名义成交：{dayNtlVlmUsd:,.0f} USD

## 事件锚点（**调用方必填**：从 event-calendar 或对话 memory 提取）

- 距下次财报：{N} 个交易日（{YYYY-MM-DD}）—— 无则写 "无近期财报"
- 距下次 FOMC / CPI / 重大宏观：{N} 天 —— 无则省略
- 已有 trading-debate 决策：{Hold/Buy/Sell} @ {price}（{date}）—— 无则省略

> 这一节让链上数据回到事件时间轴上，避免读者忘记"为什么现在 funding 重要"

## funding rate（多空拥挤度）

| 维度 | 值 | 解读 |
|---|---|---|
| 当前 APR | {fundingAprNow:+.1f}% | {极度多头拥挤 / 多头偏强 / 中性 / 空头偏强 / 极度空头拥挤} |
| 24h 平均 | {avgApr:+.1f}% | |
| 24h 极值 | max {maxApr:+.1f}% / min {minApr:+.1f}% | |

## 跨 dex 一致性

| dex | mark (USD) | OI (USD) | premium |
|---|---|---|---|
| xyz | 230.84 | 125.8M | +11.1 bp |
| cash | 230.88 | 6.6M | +16.7 bp |
| ... | | | |

> 偏差 < 0.5% = 一致；> 0.5% = 标注异常 dex

## 信号摘要

- {✅ / ⚠️} 1-3 条结论，每条不超过 30 字
- 例："NVDA 链上 24/7 +2.4%，funding APR 19.7%（中性偏多）"
- 例："⚠️ TSLA premium 持续 > 50 bp，链上做空成本高，多头筑底信号"

## 已知限制

- 链上永续 ≠ 现货真值；本数据仅作辅助信号
- 不构成投资建议；交易决策请配合 stock-analyzer + trading-debate

---
*由 hyperliquid-perps skill 生成*
```

## 模板 B：funding 时间序列

```markdown
# {TICKER} — funding rate 历史（{hours}h）

| 时间（UTC） | APR (%) | premium (bp) |
|---|---|---|
| 2026-05-13 14:00 | +18.3 | +5.2 |
| 2026-05-13 15:00 | +22.7 | +7.8 |
| ... | | |

## 统计

- avg APR：{avgApr:+.1f}%
- max APR：{maxApr:+.1f}%（@ {maxTime}）
- min APR：{minApr:+.1f}%（@ {minTime}）
- 当前相对均值：{nowVsAvg:+.1f}% — {显著偏高 / 接近均值 / 显著偏低}

## 拥挤度判定

{✅ 当前在历史正常区间内}
{⚠️ 当前 APR > 历史 P90，多头拥挤}
{⚠️ 当前 APR < 历史 P10，空头拥挤}
```

## 模板 C：闭市时段链上隐含价

```markdown
# {TICKER} — 美股闭市时段链上 1h K 线

> 美股最近一次收盘：{lastUSClose}（{lastClosePx} USD）
> 现在 UTC：{now}，距收盘 {hoursSinceClose}h

| 时间（UTC） | open | high | low | close | vol |
|---|---|---|---|---|---|
| ... 仅显示闭市段 ... | | | | | |

## 闭市段累计

- 闭市段链上累计涨跌：{closedSessionChg:+.2f}%
- 链上隐含次日开盘：{impliedOpen:.2f} USD（基于最后一根 1h close）
- 流动性确认：闭市段总成交 {closedSessionVol:,.0f} USD

## 隐含次日开盘判定

- 隐含 vs 上一日收盘：{+/- chg}
- {✅ 流动性充足，可作参考}
- {⚠️ 闭市段成交 < 500k USD，仅作弱信号}
```

## 模板 D：跨标的拥挤度排行（市场扫板用）

```markdown
# Hyperliquid 链上多空拥挤度排行（OI 前 50）

> 数据时点：{now UTC}

## 多头最拥挤（funding APR 倒序）

| 合约 | dex | mark (USD) | 24h chg | funding APR | OI (USD) |
|---|---|---|---|---|---|
| xyz:META | xyz | 616.5 | +2.1% | +50.5% | 24M |
| xyz:CRCL | xyz | 126.5 | -0.5% | +37.1% | 22M |
| ... | | | | | |

## 空头最拥挤（funding APR 正序）

| 合约 | dex | mark (USD) | 24h chg | funding APR | OI (USD) |
|---|---|---|---|---|---|
| xyz:EWY | xyz | 189.8 | +0.5% | -33.8% | 15M |
| ... | | | | | |

## 解读

- 多头拥挤 Top：通常是热门追涨股，警惕回调
- 空头拥挤 Top：通常是利空兑现票，警惕反弹
```

## 输出风格约定

1. **数字精度**：价格保留到对应 tick；百分比保留 2 位；APR 保留 1 位
2. **货币标识**：所有 USD 数额用 **`USD` 后缀**（如 `230.84 USD`、`125.8M USD`），**严禁** `\$` 前缀（参见文件开头硬规则）
3. **时间戳**：默认 UTC，HKT 在括号内补充
4. **不堆砌警告**：流动性等级用 emoji（✅/⚠️/⛔）一次性体现，不在每段重复
5. **数据缺失**：用 `—` 而非 `null` 或空字符串
6. **永远附"不构成投资建议"声明**，但不要重复多次
