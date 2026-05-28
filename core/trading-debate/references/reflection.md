# v0.3 跨会话 Reflection 机制

照搬 TradingAgents `reflection.py` 的事后反思设计，落地在 Claude Code 的 **memory 系统**上——通过 `auto memory` 把历史决策 + 实际收益的反思持久化，下次相似分析时自动注入。

## 设计动机

TradingAgents 用 LangGraph state 持久化反思，本 skill 没那个基础设施。但 Claude Code 有：
- **memory 系统**：`~/.claude/projects/<会话编码目录>/memory/` 下的 markdown 文件，每次会话自动加载
- **MEMORY.md 索引**：进入会话时自动读，相关 memory 触发详情

把反思塞进 memory，等于实现了"跨会话学习"。

## 触发场景

### 场景 A：决策完成后立即埋点（事前 + 事后存档）

阶段 6 PM 输出最终决策后，**立即写入 memory**：

```markdown
---
name: trading-debate-decision-{ticker}-{YYYYMMDD}
description: trading-debate 对 {ticker} 的决策记录 — {rating}, entry {entry_price}, target {price_target}
type: project
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

**Why 用 project 类型而不是 feedback**：
- feedback 是用户偏好（永久参考）
- project 是项目状态（会过期，3 个月后被反思替换）

### 场景 B：相似分析时自动召回

下次跑 trading-debate 时，**阶段 0 之前增加一步 memory 检索**：

```
1. 读 MEMORY.md 索引，匹配 "trading-debate-decision-{ticker}-*"
2. 找到所有该 ticker 的历史决策（最近 5 条）
3. 对每条决策，检查是否到了反思窗口（决策 ≥ 3 个月前）
   - 是：触发场景 C 反思流程
   - 否：跳过（决策还在观察期）
4. 把已完成反思的"教训"作为上下文注入阶段 6 PM
```

**注入方式**（PM prompt 增补段）：

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

### 场景 C：3 个月窗口反思（用户触发或自动触发）

**用户触发**：用户主动说"复盘一下我 3 个月前对 NVDA 的决策"或"trading-debate 反思 NVDA"。

**自动触发**：场景 B 检索时发现决策已超 3 个月且未完成反思，提示用户"是否现在反思"。

反思流程（5 步）：

```
1. 读取历史 memory: trading-debate-decision-{ticker}-{YYYYMMDD}
2. 拉当前行情 + 决策时点行情，计算 raw_return = (current_price - entry_price) / entry_price
3. 拉同期 SPY（美股）/ HSI（港股）/ 沪深 300（A 股）回报，计算 alpha_return
4. 用 reflection prompt 生成 2-4 句反思（照搬 TradingAgents 风格）
5. 更新 memory，标记"已反思"
```

## Reflection Prompt（照搬 TradingAgents 简化中文版）

```
你是交易分析师，在结果已知的前提下复盘自己的过往决策。
写恰好 2-4 句的纯文本（不要 bullets，不要 headers，不要 markdown）。

按顺序覆盖：
1. 方向判断对了吗？（引用 alpha 数字）
2. 投资论点中哪部分被验证、哪部分失败？
3. 一条具体可应用于下次相似分析的教训。

要具体且简洁。你的输出会被存进决策日志，被未来的分析师重读，每个字都要有价值。

实际原始回报：{raw_return:+.1%}
相对基准（{benchmark_name}）超额：{alpha_return:+.1%}

最终决策原文：
{final_decision}
```

## Memory 文件管理规则

### 命名约定

```
trading-debate-decision-{ticker}-{YYYYMMDD}.md   # 单次决策快照
trading-debate-lessons-{ticker}.md                # 该 ticker 的反思教训汇总（v0.3.1 引入）
```

### MEMORY.md 索引行

每次写决策时**追加**一行到 `MEMORY.md`（不替换）：

```markdown
- [trading-debate-decision-NVDA-20260514](trading-debate-decision-NVDA-20260514.md) — Overweight @$215, 待 8/14 反思
```

反思完成后**就地修改**索引行：

```markdown
- [trading-debate-decision-NVDA-20260514](trading-debate-decision-NVDA-20260514.md) — Overweight @$215, 反思完成: alpha +8.3%, 教训"低估 Culper 报告影响"
```

### 过期清理

- 决策超过 12 个月且已反思：可移到 `lessons-{ticker}.md` 汇总后删除原决策快照
- 决策超过 6 个月但未反思（用户从未回看）：自动提示用户"是否补反思"

## 自检清单（v0.3 实现时）

- [ ] PM 阶段 6 完成后是否真的写了 memory 文件？（不是承诺写，是真的调 Write 工具）
- [ ] MEMORY.md 索引是否真的追加了行？（验证文件大小变化）
- [ ] 阶段 0 之前是否真的搜了 memory？（不是凭印象说"我记得有"）
- [ ] 反思 prompt 是否生成了 2-4 句、无 markdown？
- [ ] alpha_return 计算是否真的拉了基准回报，没有编？

## 实现检查点

`v0.3.0`（最小可用）：
- 决策存档 ✅
- 自动召回 ✅
- 用户触发反思 ✅

`v0.3.1`（增强）：
- 自动触发反思（决策超 3 月且未反思时主动提示）
- lessons-{ticker}.md 汇总文件
- 反思教训跨 ticker 模式识别（"我对所有半导体股都低估了周期性")

## 与 TradingAgents 原版的差异

| 维度 | TradingAgents | 本 skill v0.3 |
|------|---------------|---------------|
| 持久化层 | LangGraph checkpoint (DB) | Claude Code memory (markdown) |
| 召回时机 | LangGraph state 注入 | 阶段 0 前手动检索 + PM prompt 注入 |
| 反思触发 | 交易完成立即触发 | 3 月窗口（手动或自动） |
| 跨标的学习 | 不支持 | v0.3.1 lessons 汇总支持 |
| 反思 prompt | 照搬，仅翻译中文 | 同左 |
