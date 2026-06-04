---
name: ticker-journal-migrate
description: 补录历史分析到 ticker-journal。当用户说"把最近的分析写进 journal"、"session 里做过的分析没入档"、"migrate journal"、"/ticker-journal migrate" 时使用。扫描 Claude Code session JSONL 文件，找出调用过 stock-analyzer / crypto-analyzer / trading-debate 等 skill 但未写入 ticker-journal 的标的，逐一补录。
---

# Ticker Journal Migrate — 补录历史分析

## 背景

每次分析后应自动调用 `ticker-journal write`，但以下情况会导致漏档：用户中途中断 session、trading-debate 阶段 8c 被跳过、工具调用失败未执行到报告末尾等。

本 skill 扫描 CC session 文件精确找出漏档条目并补录。

---

## 核心原则

**用 Skill tool 调用记录作为信号源，不用文本匹配。**

Session JSONL 里每个 `tool_use` 块（`name=Skill`）精确记录了哪个 skill 被以什么参数调用过。文本匹配会命中 skill 定义里的示例 ticker，产生大量噪声。

---

## Step 1：扫描 session，输出未入档清单

**开始前先向用户确认两个参数，不要直接开始扫描：**

```
1. 扫哪个项目？（默认当前项目 `{CWD推导的目录名}`）
2. 往回扫多久？（默认 14 天）
```

```bash
ls ~/.claude/projects/   # 列出可选项给用户看
```

用户确认两项后再继续。若用户说"默认"或"就这个"，则项目用 CWD 推导，时间用 14 天。

**路径推导规则**：Claude Code 把 CWD 的 `/` 替换成 `-`（开头加 `-`）作为目录名：
```bash
cwd=$(pwd); echo ~/.claude/projects/$(echo "$cwd" | sed 's|/|-|g')
```

```python
import json, datetime, re, os
from pathlib import Path

# 从当前 CWD 自动推导，也可手动指定
cwd = os.getcwd()  # 运行时由 Bash 获取
proj_dir = Path.home() / '.claude/projects' / cwd.replace('/', '-')

# 如果目录不存在或为空，提示用户选择正确的目录
if not proj_dir.exists():
    # 列出可选项
    available = sorted((Path.home() / '.claude/projects').iterdir())
    print("目录不存在，请从以下选择：")
    for p in available:
        print(f"  {p.name}")
    raise SystemExit

files = sorted(proj_dir.glob('*.jsonl'), key=lambda f: f.stat().st_mtime, reverse=True)

# 构建 {代码: {已入档日期集合}}，精确到 ticker+日期，避免漏掉同标的新日期
# 注意：journal 文件名格式为 `{代码}-{简称}.md`（港股/A股）或 `{TICKER}.md`（美股/加密）
# INDEX 里的 key 是完整 canonical ticker（如 `1810-小米`），这里同时建立「代码→canonical」映射
journals_dir = Path.home() / '.stock-skills/journals'
idx = journals_dir / 'INDEX.md'
journaled = {}       # {'1810': {'2026-05-27', '2026-05-29'}, 'FUTU': {...}, ...}
code_to_canonical = {}  # {'1810': '1810-小米', 'FUTU': 'FUTU', ...}
if idx.exists():
    for ln in idx.read_text().splitlines():
        m = re.match(r'- \[([^\]]+)\]', ln)
        if not m: continue
        canonical = m.group(1)  # 如 '1810-小米' 或 'FUTU'
        code = canonical.split('-')[0].upper()  # 纯代码部分：'1810' 或 'FUTU'
        code_to_canonical[code] = canonical
        jfile = journals_dir / f"{canonical}.md"
        if jfile.exists():
            journaled[code] = set(re.findall(r'## (\d{4}-\d{2}-\d{2})', jfile.read_text()))

target_skills = {'stock-analyzer','crypto-analyzer','stock-fundamentals',
                 'stock-valuation','trading-debate'}
cutoff = datetime.datetime.now() - datetime.timedelta(days=14)
results, seen = [], set()

for f in files:
    dt = datetime.datetime.fromtimestamp(f.stat().st_mtime)
    if dt < cutoff:
        break
    date_str = dt.strftime('%Y-%m-%d')
    try:
        with open(f) as fh:
            for line in fh:
                obj = json.loads(line)
                for block in obj.get('message',{}).get('content',[]):
                    if block.get('type')=='tool_use' and block.get('name')=='Skill':
                        inp = block.get('input',{})
                        skill, args = inp.get('skill',''), inp.get('args','')
                        if skill in target_skills and args:
                            key = f"{date_str}|{skill}|{args[:40]}"
                            if key not in seen:
                                seen.add(key)
                                results.append({'date':date_str,'file':f.name,
                                                'skill':skill,'args':args})
    except: pass

for r in results:
    # 从 args 提取代码（去掉市场前缀、HK后缀、前导零）
    raw = r['args'].split()[0].upper()
    code = re.sub(r'^(US\.|HK\.|SZ\.|SH\.)', '', raw)
    code = re.sub(r'\.?HK$', '', code)       # 去掉 HK 后缀
    code = re.sub(r'^HK\.?', '', code)       # 去掉 HK 前缀
    code = code.lstrip('0') or code          # 去掉前导零（保留全零情况）
    # 显示时用 canonical（有则用，无则退化为纯代码）
    display = code_to_canonical.get(code, code)
    # 代码+日期 双重检查，同标的新日期不会被漏掉
    already = code in journaled and r['date'] in journaled.get(code, set())
    flag = "  [已入档]" if already else "  <<< 未入档"
    print(f"{r['date']}  {display:<14}  [{r['skill']:<22}]  {flag}")
```

---

## Step 2：去重检查

每条调用记录以 **(ticker, date, skill)** 为唯一 key，独立判断是否已入档。`stock-analyzer` 和 `stock-fundamentals` 即使同天调用也是两条不同的 journal 条目，不合并。

**检查是否已入档**：读 `~/.stock-skills/journals/{CANONICAL_TICKER}.md`（如 `1810-小米.md`），看是否已有 `{YYYY-MM-DD} · {skill}` 的区块头。若已有则跳过，若无则进 Step 3。

每条未入档记录按 **skill 类型**决定数据来源：

**skill = `trading-debate`**：先查决策文件（两处都检查），有则直接读，无则进 Step 3 从 session 提取。决策文件名使用 CANONICAL_TICKER（含公司名），旧文件可能只有纯代码，两种都要尝试。

```bash
# 新格式（含公司名，如 trading-debate-decision-1810-小米-20260604.md）
NEW=~/.stock-skills/trading-debate/decisions/trading-debate-decision-${CANONICAL_TICKER}-${DATE}.md
# 兼容旧格式（纯代码）
NEW_LEGACY=~/.stock-skills/trading-debate/decisions/trading-debate-decision-${CODE}-${DATE}.md
OLD=$(ls ~/.claude/projects/*/memory/trading-debate-decision-${CODE,,}-${DATE}.md 2>/dev/null | head -1)
[ -f "$NEW" ] && echo "新版: $NEW"
[ -n "$OLD" ] && echo "旧版: $OLD"
```

旧版文件**只读**，仅用于提取字段，不修改。两处都存在时内容可能不同，各自对应不同日期的 journal 条目。

**skill = `stock-analyzer` / `crypto-analyzer` / `stock-fundamentals` / `stock-valuation`**：决策文件与这些 skill 无关，一律进 Step 3 从 session 提取。

---

## Step 3：从 session 文件提取分析数据

对每个未入档条目，流式读取对应 session 文件，找 assistant 输出的分析报告关键行：

```python
import json, re
from pathlib import Path

def extract_report(session_filepath, ticker_hint):
    """
    session_filepath: 完整路径（Path 对象或字符串），来自 Step 1 的 proj_dir / f.name
    ticker_hint: 标的代码或名称，用于定位报告文本块（如 'FUTU'、'拼多多'）
    """
    key_fields = [
        # 通用行情（所有 skill）
        '现价', '涨跌幅', '市值', '成交',
        # stock-analyzer 技术/估值
        'MA5', 'MA10', 'MA20', 'MA30', 'TTM PE', 'PB', 'PE百分位', '支撑', '阻力',
        # stock-analyzer 综合研判
        '综合研判', '利多', '利空', '风险提示',
        # stock-fundamentals 专属
        '护城河', 'ROIC', 'FCF', '商业模式', '安全边际', '多头逻辑', '空头逻辑',
        # stock-valuation 专属
        'DCF', 'PEG', '加权中枢', '买点',
        # crypto-analyzer 专属
        'RSI', 'funding', 'OI', '叙事',
        # 资金/评级（通用）
        '资金', '评级',
    ]
    with open(session_filepath) as fh:
        for line in fh:
            try:
                obj = json.loads(line)
                msg = obj.get('message', {})
                if msg.get('role') == 'assistant':
                    for block in msg.get('content', []):
                        if block.get('type') == 'text':
                            text = block['text']
                            if ticker_hint in text and len(text) > 1000:
                                for ln in text.split('\n'):
                                    if any(k in ln for k in key_fields):
                                        print(ln[:130])
            except: pass
```

调用方式（传入来自 Step 1 的 `proj_dir`）：

```python
extract_report(proj_dir / r['file'], ticker_hint=ticker)
```

从输出中提取：**价格、PE/PB、MA 均线、支撑阻力、综合研判/多头逻辑/空头逻辑（3-5条）、风险提示（3-5条）、评级**。

字段缺失一律填 `N/A`，不报错不中止。

---

## Step 4：按 ticker-journal write 格式写入

参考 `ticker-journal` skill 的区块格式逐一写入。每写完一个标的立即更新 INDEX.md，不要等全部写完再统一更新（防中断丢失）。

来源填写规则（每个 skill 独立写条目，不合并）：

| skill | 来源标记 | 评级 | 字段提取重点 |
|-------|---------|------|-------------|
| `trading-debate` | `trading-debate` | PM 最终评级 | 大师信号和复盘锚点必填 |
| `stock-analyzer` | `stock-analyzer` | 纯分析 | 利多/利空 → 核心催化/风险；维度 2 → 技术关键位 |
| `crypto-analyzer` | `crypto-analyzer` | 纯分析 | 维度 6 新闻 + 维度 7 事件 → 核心催化/风险；链上 OI/funding → 主要指标 |
| `stock-fundamentals` | `stock-fundamentals` | 纯分析 | 护城河来源 → 核心催化；护城河侵蚀触发条件 → 核心风险；ROIC/FCF → 主要指标 |
| `stock-valuation` | `stock-valuation` | 纯分析 | 估值字段填 DCF/PE/PEG 加权中枢 + 安全边际买点区间；估值支撑逻辑 → 核心催化；估值失效条件（EPS 下修/行业 PE 收缩） → 核心风险 |

---

## 常见陷阱

| 陷阱 | 正确做法 |
|------|---------|
| 用文本 grep 找 ticker | 只用 `tool_use name=Skill` 调用记录 |
| 同天多个 skill → 合并为一条 | 每个 skill 独立写条目，(ticker, date, skill) 三者都相同才算重复 |
| 文件修改时间当分析时间 | 以 session 内数据时点（报告里的日期）为准 |
| 当前 session 自引用噪声 | 跳过文件名最新的 1-2 个 session 文件 |
| 大文件整体 read_text() | 逐行流式解析（`for line in fh`） |
| 用 Bash `grep` 检查 journal 文件内容 | 一律用 Python `Path.read_text()` + `re` 读取——`grep` 在某些环境下被替换为 `ugrep`，其隐含的默认选项会导致命令报错并返回非零退出码，触发 `\|\| echo "(无文件)"` 兜底分支，产生文件存在却误报"无文件"的假阴性 |
