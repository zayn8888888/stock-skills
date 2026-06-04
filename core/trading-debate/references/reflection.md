# 决策存档与反思（阶段 8）

跨仓库共用：`~/.stock-skills/trading-debate/`。召回必须 Glob/Read，禁止凭印象。

## 路径与兼容

| 路径 | 用途 |
|------|------|
| `~/.stock-skills/trading-debate/decisions/` | 决策快照（**只在这里 Write**） |
| `.../decisions/INDEX.md` | 索引：存档追加行，反思后就地改行 |
| `~/.stock-skills/trading-debate/lessons/` | 单 ticker / 跨标的教训汇总 |

首次写入：`mkdir -p ~/.stock-skills/trading-debate/decisions`（及需要的 `lessons/`）。

**召回（8a / L1）**——两处 Glob，basename 去重，**全局优先**：

1. `~/.stock-skills/trading-debate/decisions/trading-debate-decision-*.md`
2. `~/.claude/projects/*/memory/trading-debate-decision-*.md`（旧版只读）

**懒迁移**：决策仅在 legacy 时，反思后 Write 到全局同 basename，legacy 文件顶行加 `> 已迁移至 ~/.stock-skills/trading-debate/decisions/`。

Claude Code 的 `MEMORY.md` 可**可选**追加指向全局文件的绝对路径；**不能**替代上述 Glob。

## Ticker 规范化（写文件前必须先执行）

所有文件名和 INDEX 键中的 `{ticker}` 均使用 **CANONICAL_TICKER**，规则与 `ticker-journal` skill 完全一致：
- 港股：`HK-{数字代码}-{中文简称}`，如 `HK-1810-小米`
- 上交所 A 股：`SH-{6位代码}-{中文简称}`，如 `SH-601166-兴业银行`
- 深交所 A 股：`SZ-{6位代码}-{中文简称}`，如 `SZ-000858-五粮液`
- 美股：`US-{ticker}`，如 `US-FUTU`、`US-PDD`
- 加密资产：`CRYPTO-{ticker}`，如 `CRYPTO-BTC`、`CRYPTO-HYPE`
- 中文简称从 futuapi snapshot 或分析 context 中提取，不确定时省略中文名（退化为 `HK-1810`）

## 存档（阶段 8b，PM 完成后立即）

`Write`：`~/.stock-skills/trading-debate/decisions/trading-debate-decision-{ticker}-{YYYYMMDD}.md`

```markdown
---
name: trading-debate-decision-{ticker}-{YYYYMMDD}
description: trading-debate 对 {ticker} 的决策记录 — {rating}, entry {entry_price}, target {price_target}
---

# {ticker} {YYYY-MM-DD} 决策

## PM 最终评级
{rating}（信心度 {confidence}）

## 入场计划
- entry: {entry_price}
- stop: {stop_loss}
- target: {price_target}
- 仓位: {position_sizing}

## 关键论据
- Bull 胜出论据：{...}
- Bear 胜出论据：{...}
- 大师团一致性：{...}

## 阶段 7 复盘锚点
{阶段 7 输出的 3 个观察指标}

## 状态
- 决策时间：{YYYY-MM-DD HH:MM}
- 反思时间：⏳ 待 3 个月后回填
- 实际收益：⏳ 待回填
```

`Edit`/`Write` `INDEX.md` 追加一行，例如：

`- [trading-debate-decision-US-NVDA-20260514](trading-debate-decision-US-NVDA-20260514.md) — Overweight @$215, 待反思`

## 召回（阶段 8a，阶段 0 之前）

1. Glob 全局 + legacy（见上）
2. 该 ticker 最近 5 条 — **按代码前缀过滤文件名**，不要求完整匹配：
   - 当前分析 `1810-小米` → 过滤条件为文件名包含 `1810`
   - 兼容旧格式（无公司名）：`trading-debate-decision-1810-20260604.md` 同样命中
3. 决策 ≥ 3 个月且未反思 → 问用户是否先反思
4. 已反思 → 注入阶段 6 PM：

```
【历史决策反思教训】（自动召回）：
3 个月前对 {ticker} 的 {rating} 决策：
- 实际 3 月回报：{raw_return}
- 相对 SPY 超额收益：{alpha_return}
- 当时关键论据：{...}
- 反思教训：{2-4 句反思文本}

请把这些教训纳入当前决策考虑。如果当前情境与历史相似，警惕同类错误；
如果情境已改变，明确说明哪些差异导致这次结论应该不同。
```

## 反思（用户说「复盘 X」或 8a 发现超期未反思）

1. `Read` 决策文件（全局优先；仅 legacy 则读后 Write 全局）
2. 富途 K 线拉决策日→今日行情，`raw_return = (current - entry) / entry`，**禁止编造**
3. Alpha（同区间 K 线，禁止编造）：
   - 宽基超额：美股 `US.SPY`、港股 `HK.HSI`、A 股 `SH.000300` → `alpha_vs_market = raw_return - 基准收益`
   - 行业超额：如 `US.SOXX` / `US.XLY` / `HK.HSTECH`；无则标 N/A
   - CAPM（决策日后 60 日或至今，取短）：`Beta = cov(股,基准)/var(基准)`，`capm_alpha = raw_return - (2.5% + Beta×(基准收益-2.5%))`
4. 用下方 Prompt 写 2–4 句纯文本（无 markdown）
5. 更新决策文件「状态」+ `INDEX.md` 该行；legacy 则懒迁移

## 反思 Prompt

```
你是交易分析师，在结果已知的前提下复盘自己的过往决策。
写恰好 2-4 句的纯文本（不要 bullets，不要 headers，不要 markdown）。

按顺序覆盖：
1. 方向判断对了吗？（引用 alpha 数字）
2. 投资论点中哪部分被验证、哪部分失败？
3. 一条具体可应用于下次相似分析的教训。

实际原始回报（绝对）：{raw_return:+.1%}
vs 宽基基准（{benchmark_name}）超额：{alpha_vs_market:+.1%}
vs 行业基准（{sector_benchmark}）超额：{alpha_vs_sector:+.1%}（不适用时填 N/A）
Beta 调整 alpha（CAPM）：{capm_alpha:+.1%}（Beta={beta:.2f}）

最终决策原文：
{final_decision}
```

## 清理（可选）

- 已反思且 >12 个月：可汇总到 `lessons/trading-debate-lessons-{ticker}.md` 后删 decisions 快照（`{ticker}` 同样使用 CANONICAL_TICKER，如 `trading-debate-lessons-1810-小米.md`）
- >6 个月未反思：提示用户补反思

## 自检清单

**8b 存档后**

- [ ] 已 `Write` `~/.stock-skills/trading-debate/decisions/trading-debate-decision-{ticker}-{YYYYMMDD}.md`
- [ ] 已更新 `decisions/INDEX.md`（追加一行，非只口头承诺）
- [ ] 未向 `~/.claude/projects/.../memory/` 新建决策文件

**8a 召回后**

- [ ] 已 Glob 全局 + legacy 两处，并按 basename 去重
- [ ] 命中记录已 `Read`，未凭印象说「有 / 没有历史决策」
- [ ] 已反思的教训已写入阶段 6 PM 上下文（或明确无历史）

**反思完成后**

- [ ] `raw_return` / alpha 来自富途 K 线，非编造
- [ ] 反思正文 2–4 句、无 markdown，已写回决策文件与 `INDEX.md`
- [ ] legacy-only 记录已懒迁移到全局（若适用）
