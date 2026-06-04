---
name: ticker-journal
description: 标的档案读写助手。write=分析后写快照，load=新会话加载历史 context，followup=拉最新行情+新闻做增量建议，dashboard=启动本地仪表盘。触发场景：(1) 分析结束后被 stock-analyzer / trading-debate / crypto-analyzer / stock-fundamentals / stock-valuation 自动调用写档；(2) 用户说"加载 XX 档案"/"XX 追问"/"XX 最新行情怎样"；(3) 用户提某标的且 INDEX.md 已有记录时 AI 提示；(4) 用户说"打开仪表盘"/"看档案总览"/"dashboard"时启动本地服务器。
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

---

## 操作一：write（分析完后自动调用）

### 触发方

- `stock-analyzer` 报告末尾
- `trading-debate` 阶段 8c（8b 完成后）
- `crypto-analyzer` 报告末尾

### 执行步骤

1. 从当前 context 提取快照字段（见下方字段映射表）
2. `Bash: ls ~/.stock-skills/journals/{TICKER}.md 2>/dev/null || echo "NOT_FOUND"` 检查文件是否存在
3. **不存在**：`Write ~/.stock-skills/journals/{TICKER}.md`，内容为新文件头 + 第一个区块
4. **已存在**：`Read ~/.stock-skills/journals/{TICKER}.md`，然后 `Edit` 在文件末尾最后一个 `---` 之后追加新区块
5. `Bash: ls ~/.stock-skills/journals/INDEX.md 2>/dev/null || echo "NOT_FOUND"` 检查 INDEX.md
6. **INDEX 不存在**：`Write` 新建，写入该 ticker 一行
7. **INDEX 已存在**：`Read` INDEX.md，判断该 ticker 行是否已有：
   - 已有：`Edit` 更新该行（记录数 +1，"最近"日期更新）
   - 未有：`Edit` 追加该 ticker 行

### journal 文件格式

新建文件时的文件头（一次性写入，后续追加区块）：
```markdown
# {TICKER} 标的档案
```

每次追加的区块（顺序追加，最旧在上，最新在末尾）：
```markdown

## {YYYY-MM-DD} · {来源 skill} · {评级或"纯分析"}

**决策**：{评级} {仓位} @ {入场价}，stop {止损}，target {目标}（纯分析则填"N/A"）
**数据快照**：
- 价格：{price}（{YYYY-MM-DD HH:MM} HKT）
- 估值：PE {pe}x（百分位 {pe_pct}%）/ PB {pb}x（无数据填"N/A"）
- 技术关键位：MA20 {ma20} / MA60 {ma60} / 支撑 {support} / 阻力 {resistance}（加密资产填链上等效指标）
- 主要指标：{52周高低 / RSI / 量比 / 链上 OI 等 2-3 个最关键指标}

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
| PE/PB 百分位 | 维度 3 估值 | 共享报告 fundamentals_report | 维度 2（MV/RV 比率，无则 N/A） |
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
  核心催化：{第一条}
  核心风险：{第一条}

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

1. 先执行 **load**（同上，加载历史档案）
2. 并行拉实时数据（两批同时发出）：
   - **批次 A（futuapi）**：`Bash: python3 ${CLAUDE_SKILLS_DIR}/futuapi/scripts/get_market_snapshot.py --code {market}.{TICKER} --json`（market = US/HK/SH/SZ，根据标的判断）
   - **批次 B（新闻）**：`Skill(skill="futu-news-search")` 最近 7 天；或 Tavily `{TICKER} 最新消息 news` days=7（futu-news-search 不可用时降级）
3. 两批返回后，基于历史快照 vs 当前数据做 diff 分析并输出：

```
【{TICKER} 增量追问 · {YYYY-MM-DD HH:MM} HKT】

历史基准（{上次分析日期}）：
  价格 {历史价} → 当前 {实时价}（{涨跌幅}）
  相对止损 {stop}：{距止损幅度}（{'⚠️ 接近止损' if 距离 < 10% else '安全'}）
  相对目标 {target}：{距目标幅度}

技术变化：
  MA20 {实时MA20} vs 基准 {历史MA20}（{'价格突破 MA20' / '跌破 MA20' / '价格贴近 MA20'}）
  [若关键技术位发生穿越，标注 ⚠️]

新增信息（近 7 天）：
  {3-5 条关键消息摘要，含来源和日期}

增量建议：
  [基于上述 diff 给出 1-3 句具体建议，例如：
   - "价格距止损 X%，当前无止损压力，原仓位可维持"
   - "出现新利空：{事件}，建议关注 {关键位} 是否跌破"
   - "距复盘锚点 {D+90日期} 还有 N 天，当前 [已/未] 触发复盘条件"]
```

4. 输出结束后，追加一条新 journal 条目（来源标为 `followup`，评级沿用上次决策评级，数据快照用实时价格更新，技术位若无法从快照拉取则填"N/A"）

---

## 自动检测（新会话开头，被其他 skill 触发前）

当用户提及某 ticker 欲分析时，在执行 stock-analyzer / trading-debate 之前：

1. `Bash: /usr/bin/grep -i "{TICKER}" ~/.stock-skills/journals/INDEX.md 2>/dev/null || echo "NOT_FOUND"`
2. 检测到有记录 → 先提示：
   > "检测到 {TICKER} 有 {N} 条历史档案（最近：{日期} {评级}）。要加载历史 context 再分析，还是直接全量重新分析？"
   - 用户选加载 → 执行 load，然后继续分析
   - 用户选全量 → 跳过 load 直接全量分析
3. 没有记录 → 正常启动分析，无需提示

---

---

## 操作四：dashboard（本地仪表盘）

**触发语**：
- "打开仪表盘" / "看档案总览" / "dashboard" / "看看我的持仓"

### 执行步骤

1. 检查服务器是否已在运行：
   `Bash: curl -s --max-time 1 http://localhost:7788/ > /dev/null && echo "RUNNING" || echo "STOPPED"`
2. **已运行** → 直接告知用户访问 `http://localhost:7788`，无需重复启动
3. **未运行** → 启动服务器（后台运行）：
   `Bash: python3 ~/.stock-skills/journals/serve.py &`
   然后告知用户访问 `http://localhost:7788`

### 仪表盘说明

- **serve.py**：本地 HTTP 服务器，每次刷新页面自动重新读取 `~/.stock-skills/journals/` 目录，无需手动 generate
- **generate.py**：独立脚本，输出静态 `dashboard.html`（离线使用时用）
- 页面右上角有 **↻ 刷新** 按钮，新的分析存档后点一下即可更新
- 点任意标的卡片打开右侧详情抽屉，展示该标的所有历史条目
- 卡片按最新分析日期降序排列

---

## 偷懒检测 & 硬约束

- ❌ 从 context "印象"提取字段而不读取报告对应章节——必须定位到报告里的具体数字
- ❌ 字段提取失败时报错中止——必须降级填 "N/A" 继续写
- ❌ followup 重新做全量 9 维度分析——只拉价格快照 + 近 7 天新闻
- ❌ 写新区块时覆盖已有区块——必须 Edit 追加在末尾 `---` 之后
- ❌ write 完成后不更新 INDEX.md——每次 write 都必须同步 INDEX
- ❌ dashboard 已运行时重复启动服务器——先 curl 检测再决定是否启动
