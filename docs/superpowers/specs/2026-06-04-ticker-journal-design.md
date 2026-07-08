# Ticker Journal 设计文档

**日期**：2026-06-04  
**状态**：已实施（当前实现见 `core/ticker-journal/`；已扩展为 `journals/` 快照 + `reports/` 完整报告 + 本地 dashboard）  
**背景**：用户在不同会话中分析同一标的后，希望能在新会话中快速加载历史分析 context 并追问，无需重跑完整分析流程。

---

## 核心目标

1. **轻量追问**：新会话里加载历史 context，直接问当天涨跌原因 / 是否止损
2. **增量分析**：只补跑实时数据（价格 + 新闻），结合历史快照给增量建议
3. **D+90 复盘**：到反思日时，拉历史快照与当前数据对比做系统性复盘

---

## 文件结构

```
~/.stock-skills/
  trading-debate/decisions/   ← 已有，继续沿用（不动）
  journals/
    INDEX.md                  ← 所有标的一行索引（自动维护）
    FUTU.md
    NVDA.md
    SUI.md
    ...
```

journal 文件与 trading-debate/decisions/ 解耦：decisions 存完整决策报告，journals 存数据快照用于追问。

---

## Journal 文件格式

每个标的一个文件，多次分析按时间顺序追加区块（最旧在上，最新在末尾）；load 时在输出摘要中倒序展示（最新优先）：

```markdown
# {TICKER} 标的档案

## {YYYY-MM-DD} · {来源 skill} · {评级或"纯分析"}

**决策**：{评级} {仓位} @ {入场价}，stop {止损}，target {目标}（纯分析无决策则写"N/A"）
**数据快照**：
- 价格：{price}（{YYYY-MM-DD HH:MM}）
- 估值：PE {pe}x（百分位 {pe_pct}%）/ PB {pb}x
- 技术关键位：MA20 {ma20} / MA60 {ma60} / 支撑 {support} / 阻力 {resistance}
- 主要指标：{52周高低 / RSI / 量比等 2-3 个关键指标}

**核心催化**（3-5 条，各一句）：
- {催化 1}
- {催化 2}
- {催化 3}

**核心风险**（3-5 条，各一句）：
- {风险 1}
- {风险 2}

**大师信号**：{大师1}🟢{分} / {大师2}🟡{分}（无 trading-debate 时填"N/A"）
**复盘锚点**：D+90 = {YYYY-MM-DD}（无决策时填"N/A"）
**关联决策文件**：`~/.stock-skills/trading-debate/decisions/trading-debate-decision-{ticker}-{YYYYMMDD}.md`（无则省略）

---
```

INDEX.md 格式（每标一行）：

```markdown
- [FUTU](FUTU.md) — 最近：2026-06-04 Overweight 3% @ $104.91，2 条记录
- [NVDA](NVDA.md) — 最近：2026-05-20 trading-debate Hold，1 条记录
```

---

## 新 Skill：`stock-skills:ticker-journal`

### 三个操作

**write**（分析完后自动调用）
- 从当前会话 context 提取数据快照字段
- `Glob ~/.stock-skills/journals/{TICKER}.md` 检查是否已有文件
- 有则 `Read` + `Edit` 追加新区块；无则 `Write` 新建
- 更新 `INDEX.md`（追加或更新该 ticker 行）

**load**（用户显式触发）
- `Glob ~/.stock-skills/journals/{TICKER}.md`
- `Read` 全部 entry
- 输出摘要："FUTU 有 3 条档案，最近一条：2026-06-04 Overweight 3%，当时价格 $104.91，PE 百分位 1.6%"
- 注入当前 context 供后续追问使用

**followup**（轻量追问核心操作）
- 先执行 load
- 然后并行拉：实时价格快照（futuapi）+ 最新新闻（futu-news-search 或 Tavily）
- 基于历史快照 vs 当前数据做 diff 分析：
  - 价格变动 + 相对止损/目标的位置
  - 技术位是否突破/跌破
  - 新增催化或风险
- 输出"增量建议"，不重跑全量分析

### Skill 触发规则

| 用户说 | 触发 |
|--------|------|
| "加载 FUTU 档案" / "/ticker FUTU" | `load` |
| "FUTU 追问" / "FUTU 最新行情怎样" | `followup` |
| "分析 FUTU"（已有历史） | 自动检测 INDEX.md → 提示有历史 → 用户确认后 `load` |
| trading-debate / stock-analyzer 完成后 | 自动 `write`（无需用户操作） |

自动检测逻辑：当用户提及某 ticker 时，AI 检查 `~/.stock-skills/journals/INDEX.md`，若存在该 ticker 条目则提示（不自动加载，等用户确认）。

---

## 集成点

### trading-debate SKILL.md（阶段 8b 末尾追加）

在现有 `Write decisions/` 步骤完成后，追加：

```
阶段 8c（存档后立即）：调用 Skill(skill="stock-skills:ticker-journal") → write 操作
数据来源：从阶段 6 PM 最终报告 + 阶段 0 共享报告提取快照字段
```

阶段 8b 自检清单新增一条：
- [ ] 已调用 ticker-journal write，`~/.stock-skills/journals/{TICKER}.md` 已更新

### stock-analyzer SKILL.md（输出末尾追加）

在输出报告末尾、DISCLAIMER 之前，追加：

```
## 分析存档（自动）
Skill(skill="stock-skills:ticker-journal") → write 操作（来源标记为 stock-analyzer）
无决策字段时，决策填"N/A"，大师信号填"N/A"
```

### crypto-analyzer SKILL.md（同上）

与 stock-analyzer 集成方式相同。

---

## 数据快照字段来源映射

| 快照字段 | 数据来源 |
|---------|---------|
| 价格 | stock-analyzer 维度 1（futuapi get_market_snapshot） |
| PE / PB 百分位 | stock-analyzer 维度 3（futuapi get_valuation_detail） |
| MA20 / MA60 | stock-analyzer 维度 2（futu-technical-anomaly 或 futuapi K线） |
| 支撑 / 阻力 | stock-analyzer 维度 2 |
| 核心催化 / 风险 | stock-analyzer 维度 7 + trading-debate 辩论胜出论据 |
| 大师信号 | trading-debate 阶段 3-5（仅 trading-debate 有） |
| 复盘锚点 | trading-debate 阶段 7（仅 trading-debate 有） |

---

## 边界与约束

- **只读不写链上**：followup 只拉实时数据，不触发新的完整分析流程
- **不重复存储**：trading-debate decisions/ 继续存完整决策报告；journals/ 只存快照，不复制报告全文
- **兼容现有 memory**：现有 `~/.claude/projects/.../memory/trading-debate-decision-*.md` 文件继续保留，ticker-journal 不替换它们
- **旧记录迁移**：可选，用户可手动执行 `ticker-journal migrate` 把现有 memory 里的决策文件提取快照写入 journals/
- **MEMORY.md 不膨胀**：不向 MEMORY.md 追加 journal 条目，INDEX.md 是独立索引

---

## 不在本次范围内

- 跨 ticker 教训聚合（已由 trading-debate lessons/ 覆盖）
- 组合层 P/L 追踪（不是 journal 的职责）
- 自动定时提醒复盘（可后续用 cron skill 扩展）
