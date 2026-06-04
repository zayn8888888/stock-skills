# Ticker Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `stock-skills:ticker-journal` skill，让每次分析后自动存数据快照，新会话可按 ticker 加载历史 context 做轻量追问。

**Architecture:** 新 skill 文件 `core/ticker-journal/SKILL.md` 定义 write/load/followup 三个操作；runtime 文件存于 `~/.stock-skills/journals/`；在 trading-debate（阶段 8c）、stock-analyzer 和 crypto-analyzer 末尾各加一段自动调用指令。

**Tech Stack:** Markdown skill files (无代码)；runtime 目录由 skill 首次运行时自建；数据源来自各 skill 已在 context 中的报告内容。

---

## 文件映射

| 操作 | 文件 |
|------|------|
| 新建 | `core/ticker-journal/SKILL.md` |
| 修改 | `core/trading-debate/SKILL.md`（阶段 8b 后加 8c + 输出契约自检新增一项） |
| 修改 | `stock/stock-analyzer/SKILL.md`（末尾加存档指令） |
| 修改 | `crypto/crypto-analyzer/SKILL.md`（末尾加存档指令） |
| 运行时（不入 git） | `~/.stock-skills/journals/INDEX.md`，`~/.stock-skills/journals/{TICKER}.md` |

---

## Task 1：创建 ticker-journal SKILL.md

**Files:**
- Create: `core/ticker-journal/SKILL.md`

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: ticker-journal
description: 标的档案读写助手。write=分析后写快照，load=新会话加载历史 context，followup=拉最新行情+新闻做增量建议。触发场景：(1) 分析结束后被 stock-analyzer / trading-debate / crypto-analyzer 自动调用写档；(2) 用户说"加载 XX 档案"/"XX 追问"/"XX 最新行情怎样"；(3) 用户提某标的且 INDEX.md 已有记录时 AI 提示。
---

# Ticker Journal — 标的档案读写

## 核心原则

- **快照不是报告**：journal 存的是数据快照用于追问，不存完整分析报告全文
- **追加不覆盖**：每次分析产生新区块，历史区块只读不改
- **无历史不报错**：没有档案时直接说"暂无历史档案"，不创建空文件

## 路径

```
~/.stock-skills/journals/
  INDEX.md        ← 所有标的一行索引
  FUTU.md         ← 每标一个文件，多次分析按时间顺序追加
  NVDA.md
  ...
```

首次写入时自建目录：`mkdir -p ~/.stock-skills/journals`

## 操作一：write（分析完后自动调用）

### 触发方

- `stock-analyzer` 报告末尾
- `trading-debate` 阶段 8c（8b 完成后）
- `crypto-analyzer` 报告末尾

### 执行步骤

1. 从当前 context 提取快照字段（见下方字段映射表）
2. `Bash: ls ~/.stock-skills/journals/{TICKER}.md 2>/dev/null || echo "NOT_FOUND"` 检查文件是否存在
3. **不存在**：`Write ~/.stock-skills/journals/{TICKER}.md`，内容为新文件头 + 第一个区块
4. **已存在**：`Read ~/.stock-skills/journals/{TICKER}.md`，然后 `Edit` 在文件末尾的最后一个 `---` 之后追加新区块
5. `Bash: ls ~/.stock-skills/journals/INDEX.md 2>/dev/null || echo "NOT_FOUND"` 检查 INDEX.md
6. **INDEX 不存在**：`Write` 新建，写入该 ticker 一行
7. **INDEX 已存在**：`Read` INDEX.md，判断该 ticker 行是否已有：
   - 已有：`Edit` 更新该行（记录数 +1，"最近"日期更新）
   - 未有：`Edit` 追加该 ticker 行

### journal 文件格式

新建文件时的文件头（一次性写入）：
```markdown
# {TICKER} 标的档案

```

每次追加的区块（顺序追加，最旧在上）：
```markdown
## {YYYY-MM-DD} · {来源 skill} · {评级或"纯分析"}

**决策**：{评级} {仓位} @ {入场价}，stop {止损}，target {目标}（纯分析则填"N/A"）
**数据快照**：
- 价格：{price}（{YYYY-MM-DD HH:MM} HKT）
- 估值：PE {pe}x（百分位 {pe_pct}%）/ PB {pb}x（无数据填"N/A"）
- 技术关键位：MA20 {ma20} / MA60 {ma60} / 支撑 {support} / 阻力 {resistance}（加密资产填链上等效）
- 主要指标：{52周高低 / RSI / 量比 / 链上 OI 等 2-3 个最关键的指标}

**核心催化**（3-5 条，各一句）：
- {催化 1}
- {催化 2}

**核心风险**（3-5 条，各一句）：
- {风险 1}
- {风险 2}

**大师信号**：{大师1}🟢{分} / {大师2}🟡{分}（仅 trading-debate 有，其余填"N/A"）
**复盘锚点**：{YYYY-MM-DD}（仅 trading-debate 有，其余填"N/A"）
**关联决策文件**：`~/.stock-skills/trading-debate/decisions/trading-debate-decision-{ticker}-{YYYYMMDD}.md`（无则省略此行）

---
```

INDEX.md 每行格式：
```markdown
- [{TICKER}]({TICKER}.md) — 最近：{YYYY-MM-DD} {来源} {评级/纯分析}，共 {N} 条记录
```

### 字段提取映射

| 快照字段 | stock-analyzer 来源 | trading-debate 来源 | crypto-analyzer 来源 |
|---------|-------------------|-------------------|------------------|
| 价格 | 维度 1 行情速览 | 共享报告 market_report | 维度 1 行情速览 |
| PE/PB 百分位 | 维度 3 估值 | 共享报告 fundamentals_report | 维度 2 链上指标（MV/RV 或 N/A） |
| MA20/MA60 | 维度 2 技术面 | 共享报告 market_report | 维度 2 链上指标 |
| 支撑/阻力 | 维度 2 技术面 | 共享报告 market_report | 维度 2 |
| 核心催化/风险 | 维度 7 综合研判 | 阶段 5 Bull/Bear 胜出论据 | 维度 6 新闻 + 维度 7 事件 |
| 大师信号 | N/A | 阶段 3-5 大师团评分 | N/A |
| 复盘锚点 | N/A | 阶段 7 输出 | N/A |
| 评级 | N/A（填"纯分析"） | PM 最终评级 | N/A（填"纯分析"） |

**提取原则**：字段从当前 context 中已输出的报告里直接读取，禁止重新调用 API；字段缺失时填"N/A"不报错。

---

## 操作二：load（用户显式触发）

**触发语**：
- "加载 {TICKER} 档案"
- "/ticker {TICKER}"
- 任意提及某 ticker 且 AI 已检测到 INDEX 有记录时（提示后等用户确认再 load）

### 执行步骤

1. `Bash: ls ~/.stock-skills/journals/INDEX.md 2>/dev/null || echo "NOT_FOUND"`
2. INDEX 不存在 → 回复"暂无任何标的档案，请先完成一次分析"，结束
3. INDEX 存在 → `Read ~/.stock-skills/journals/INDEX.md`
4. 找不到该 ticker → 回复"{TICKER} 暂无历史档案"，结束
5. 找到 → `Read ~/.stock-skills/journals/{TICKER}.md`
6. 输出档案摘要（最新优先展示）：

```
已加载 {TICKER} 档案（共 {N} 条）：

最新：{YYYY-MM-DD} · {来源} · {评级}
  价格基准：{price}，PE 百分位 {pe_pct}%
  决策：{entry} → stop {stop} / target {target}
  核心催化：{1句}
  核心风险：{1句}

（更早记录：{日期} · {评级}，…）

档案已注入 context，你可以直接追问。
```

---

## 操作三：followup（增量追问核心操作）

**触发语**：
- "{TICKER} 追问"
- "{TICKER} 最新行情怎样"
- "{TICKER} 结合最新行情给建议"

### 执行步骤

1. 执行 load（同上）
2. 并行拉实时数据（两批同时发出）：
   - **批次 A**（futuapi）：`Bash: python3 ${CLAUDE_SKILLS_DIR}/futuapi/scripts/get_market_snapshot.py --code {market}.{TICKER} --json`
   - **批次 B**（新闻）：`Skill(skill="futu-news-search")` 或 Tavily `{TICKER} 最新消息 news` days=7
3. 两批返回后，做快照 diff 分析：

```
【{TICKER} 增量追问 · {YYYY-MM-DD HH:MM} HKT】

历史基准（{上次分析日期}）：
  价格 {历史价} → 当前 {实时价}（{涨跌幅:+.1%}）
  相对止损 {stop}：{距止损幅度:+.1%}（{'⚠️ 接近止损' if 距止损幅度 > -10% else '安全'}）
  相对目标 {target}：{距目标幅度:+.1%}

技术变化：
  MA20 {新MA20} vs 基准 {历史MA20}（{'突破' if 价格>MA20 else '跌破' if 价格<MA20 else '贴近'}）
  （若关键技术位发生穿越，标注 ⚠️）

新增信息（近 7 天）：
  {futu-news 或 Tavily 返回的 3-5 条关键消息摘要，含来源和日期}

增量建议：
  {基于上述 diff 给出 1-3 句具体建议，例如：
   - "价格距止损 {X}%，当前无止损压力，原仓位可维持"
   - "出现新利空：{事件}，建议关注 {关键位} 是否跌破"
   - "距复盘锚点 {D+90日期} 还有 {N} 天，当前 {已/未} 触发复盘条件"}
```

4. 末尾追加一条新 journal 条目（来源标为"followup"，评级沿用上次决策评级，数据快照用实时数据更新）

---

## 自动检测（会话开头）

当用户说"分析 {TICKER}"、"{TICKER} 怎么样"等时，在执行 stock-analyzer / trading-debate 之前：

1. `Bash: cat ~/.stock-skills/journals/INDEX.md 2>/dev/null | grep -i "{TICKER}" || echo "NOT_FOUND"`
2. 检测到有记录 → 先提示：
   > "检测到 {TICKER} 有 {N} 条历史档案（最近：{日期} {评级}）。要加载历史 context 再分析，还是直接全量重新分析？"
   - 用户选加载：执行 load 后继续分析（stock-analyzer 等 skill 只补增量维度）
   - 用户选全量：跳过 load 直接全量分析
3. 没有记录 → 正常启动分析

---

## 偷懒检测 & 硬约束

- ❌ 从 context 里"印象"提取字段而不真正读取报告的对应章节
- ❌ 字段提取失败时报错中止——必须降级填 "N/A" 继续写
- ❌ followup 重新做全量 9 维度分析——只拉价格快照 + 近 7 天新闻
- ❌ INDEX.md 行数超过该 ticker 的实际记录数（每次 write 后必须核对）
- ❌ 写新区块时覆盖已有区块（必须 Edit 追加在末尾 `---` 之后）
```

- [ ] **Step 2: 验证文件存在且格式正确**

```bash
ls -la /Users/admin/Developer/stock-skills/core/ticker-journal/SKILL.md
head -5 /Users/admin/Developer/stock-skills/core/ticker-journal/SKILL.md
```

预期：文件存在，首行为 `---`（frontmatter 开始）

- [ ] **Step 3: Commit**

```bash
git add core/ticker-journal/SKILL.md
git commit -m "feat(ticker-journal): 新增标的档案 skill（write/load/followup 三操作）"
```

---

## Task 2：集成到 trading-debate（阶段 8c）

**Files:**
- Modify: `core/trading-debate/SKILL.md`（阶段 8b 段落后，以及输出契约自检清单处）

- [ ] **Step 1: 在阶段 8b 末尾（"标注待 3 个月后反思"之后）插入阶段 8c**

在以下文字之后插入：
```
- 标注"待 3 个月后反思"
```

插入内容：
```markdown

**8c. 阶段 8b 完成后（立即）**：
- 调用 `Skill(skill="stock-skills:ticker-journal")` → **write** 操作
- 数据来源：从阶段 6 PM 最终报告（评级/仓位/入场价/止损/目标/大师信号/复盘锚点）+ 阶段 0 共享报告（价格/估值/技术位/核心催化风险）提取快照字段
- ❌ 禁止在 8b 的 Write 工具调用未完成时就启动 8c
```

- [ ] **Step 2: 在输出契约自检清单的 "启用 v0.3 反思" 项后追加新项**

在以下文字之后：
```
- [ ] **启用 v0.3 反思**：阶段 8a/8b 按 `reflection.md` 真 Glob/Read/Write 了决策存档
```

追加：
```markdown
- [ ] **阶段 8c**：已调用 `ticker-journal` write，`~/.stock-skills/journals/{TICKER}.md` 已更新（Write/Edit 工具调用记录可见）
```

- [ ] **Step 3: 验证插入位置正确**

```bash
/usr/bin/grep -n "8c\|ticker-journal" /Users/admin/Developer/stock-skills/core/trading-debate/SKILL.md
```

预期：出现 2 处匹配（阶段 8c 段落 + 自检清单项）

- [ ] **Step 4: Commit**

```bash
git add core/trading-debate/SKILL.md
git commit -m "feat(trading-debate): 阶段 8c 集成 ticker-journal write"
```

---

## Task 3：集成到 stock-analyzer

**Files:**
- Modify: `stock/stock-analyzer/SKILL.md`（末尾追加）

- [ ] **Step 1: 在文件末尾追加存档指令**

在"用户只追问某一维度时展开该维度，否则按九维度全景输出"之后追加：

```markdown

## 分析存档（自动，输出报告后立即执行）

九维度报告输出完成后，**立即**调用：

```
Skill(skill="stock-skills:ticker-journal") → write 操作
```

- 来源标记为 `stock-analyzer`
- 评级填 "纯分析"（stock-analyzer 不出买卖决策）
- 大师信号填 "N/A"，复盘锚点填 "N/A"
- 字段从刚输出的报告中提取，禁止重新调用 API
- 提取失败的字段填 "N/A"，不中止流程
```

- [ ] **Step 2: 验证追加位置**

```bash
tail -20 /Users/admin/Developer/stock-skills/stock/stock-analyzer/SKILL.md
```

预期：末尾出现 `## 分析存档` 段落

- [ ] **Step 3: Commit**

```bash
git add stock/stock-analyzer/SKILL.md
git commit -m "feat(stock-analyzer): 分析完成后自动调用 ticker-journal write"
```

---

## Task 4：集成到 crypto-analyzer

**Files:**
- Modify: `crypto/crypto-analyzer/SKILL.md`（末尾追加）

- [ ] **Step 1: 在文件末尾（协作关系代码块之后）追加存档指令**

在协作关系代码块结束 ` ``` ` 之后追加：

```markdown

## 分析存档（自动，输出报告后立即执行）

七维度报告输出完成后，**立即**调用：

```
Skill(skill="stock-skills:ticker-journal") → write 操作
```

- 来源标记为 `crypto-analyzer`
- 评级填 "纯分析"
- 大师信号填 "N/A"，复盘锚点填 "N/A"
- PE/PB 百分位不适用时填 "N/A"，改填 MV/RV 比率（如有）
- 字段从刚输出的报告中提取，禁止重新调用 API
```

- [ ] **Step 2: 验证追加位置**

```bash
tail -20 /Users/admin/Developer/stock-skills/crypto/crypto-analyzer/SKILL.md
```

预期：末尾出现 `## 分析存档` 段落

- [ ] **Step 3: Commit**

```bash
git add crypto/crypto-analyzer/SKILL.md
git commit -m "feat(crypto-analyzer): 分析完成后自动调用 ticker-journal write"
```

---

## Task 5：创建运行时目录结构并迁移现有 memory 决策到 journals

**Files:**
- 运行时（不入 git）：`~/.stock-skills/journals/INDEX.md`，`~/.stock-skills/journals/FUTU.md` 等

- [ ] **Step 1: 创建目录**

```bash
mkdir -p ~/.stock-skills/journals
```

- [ ] **Step 2: 从现有 memory 文件批量提取快照，生成各 ticker journal 文件**

遍历 `~/.claude/projects/-Users-admin-Developer-stock-skills/memory/trading-debate-decision-*.md`，每个文件提取字段写入对应 `~/.stock-skills/journals/{TICKER}.md`。

每个文件的字段提取逻辑（从 memory 文件的 markdown 内容读取）：
- `## 决策摘要` → 评级/仓位/入场价/止损/目标
- `## 核心逻辑` → 核心催化（前 3 句）
- `## 关键风险` → 核心风险（前 3 条）
- `## 阶段 7 复盘锚点` 或 `待反思` → 复盘锚点日期
- 大师信号：从 `## PM 最终评级` 或摘要中的"大师信号"行提取
- 价格/估值百分位：从摘要里的"入场价"提取价格，估值百分位从核心逻辑段提取（如 "PE 百分位 1.6%"）
- 技术位：从核心逻辑或决策摘要里的技术面描述提取
- 来源标记为 `trading-debate`，日期从文件名解析

对每个 ticker 逐一 `Read` + `Write`。

- [ ] **Step 3: 生成 INDEX.md**

Write `~/.stock-skills/journals/INDEX.md`，汇总所有已写入的 ticker 行。

- [ ] **Step 4: 验证迁移结果**

```bash
cat ~/.stock-skills/journals/INDEX.md
echo "---"
cat ~/.stock-skills/journals/FUTU.md
```

预期：INDEX 包含所有迁移的 ticker；FUTU.md 包含正确格式的快照区块。

---

## Task 6：最终验证

- [ ] **Step 1: 检查所有修改文件无语法错误**

```bash
head -3 /Users/admin/Developer/stock-skills/core/ticker-journal/SKILL.md
/usr/bin/grep -c "write\|load\|followup" /Users/admin/Developer/stock-skills/core/ticker-journal/SKILL.md
/usr/bin/grep -c "8c\|ticker-journal" /Users/admin/Developer/stock-skills/core/trading-debate/SKILL.md
/usr/bin/grep -c "ticker-journal" /Users/admin/Developer/stock-skills/stock/stock-analyzer/SKILL.md
/usr/bin/grep -c "ticker-journal" /Users/admin/Developer/stock-skills/crypto/crypto-analyzer/SKILL.md
```

预期：ticker-journal SKILL.md 有 3+ 处 write/load/followup；trading-debate 有 2 处 ticker-journal；stock-analyzer 和 crypto-analyzer 各有 1 处。

- [ ] **Step 2: 验证 journals 目录**

```bash
ls ~/.stock-skills/journals/
wc -l ~/.stock-skills/journals/INDEX.md
```

预期：journals/ 目录存在，INDEX.md 行数 ≥ 15（对应现有 memory 里的 ticker 数量）

- [ ] **Step 3: 最终 commit（若有遗漏）**

```bash
git -C /Users/admin/Developer/stock-skills log --oneline -6
```

预期：最近 4 条 commit 分别对应 Task 1-4。
