# Plan: 迁移到 Claude Code Plugin / Marketplace（org 路径）

> 目标：把 `zayn8888888/stock-skills` 改造成一个 GitHub Organization (`fire-alpha`) 下的 Claude Code Marketplace，让 stock-analyzer / market-scanner 各自作为独立 plugin 被 `/plugin install` 装、`/plugin update` 升，并支持开源共创。

**Org 名已敲定：`fire-alpha`**（保留 FIRE 方向，同时用 Alpha 承接后续量化、市场研究、策略工具等扩展）

---

## 阶段 0｜建 GitHub Organization 并转移 repo

**目的**：让 `/plugin marketplace add` 命令前缀变成 org 名而非个人 ID（`zayn8888888`）。

### 步骤

1. **建 org**（github.com → 右上角 + → New organization → Free plan）
   - Organization name：`fire-alpha`
   - 命名取向：保留 FIRE 方向，但不局限于股票分析；后续可扩展到量化、回测、因子、市场扫描、Agent / MCP 工具等

2. **Transfer repo 到 org**
   - github.com/zayn8888888/stock-skills → Settings → Danger Zone → Transfer ownership
   - 新 owner 填 `fire-alpha`，确认后 GitHub 会保留旧 URL 的 301 redirect（安全）

3. **更新本地 git remote**
   ```bash
   cd /Users/admin/Developer/stock-skills
   git remote set-url origin git@github.com:fire-alpha/stock-skills.git
   git remote -v   # 验证
   ```

4. **添加共创者**
   - org Settings → Members → Invite member（让对方接受邀请）
   - 或在 repo Settings → Collaborators 加单 repo 权限

5. **验证 transfer 成功**
   - 浏览器访问 `https://github.com/fire-alpha/stock-skills` 能打开
   - `git pull` 能正常拉

---

## 阶段 1｜目录重组（marketplace + 多 plugin）

**目标结构**：

```
stock-skills/                                  # repo 根 = marketplace 根
├── .claude-plugin/
│   └── marketplace.json                       # marketplace 入口
├── CHANGELOG.md                               # 共享 changelog
├── README.md                                  # 已有，更新安装说明
├── DISCLAIMER.md                              # 已有
├── LICENSE                                    # 已有
│
├── stock-analyzer/                            # plugin #1
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
│       └── stock-analyzer/                    # 实际 skill 目录
│           ├── SKILL.md                       # 从原 stock-analyzer/SKILL.md 移过来
│           └── references/
│               ├── methodology.md             # 当前文件（如有）
│               ├── metrics-interpretation.md
│               └── report-template.md
│
├── market-scanner/                            # plugin #2
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
│       └── market-scanner/
│           ├── SKILL.md                       # 从原 market-scanner/SKILL.md 移过来
│           └── references/
│               ├── plate-index-calc.md
│               ├── pitfalls.md
│               └── report-template.md
│
└── trading-debate/                            # plugin #3（新增 v0.5）
    ├── .claude-plugin/
    │   └── plugin.json
    └── skills/
        └── trading-debate/
            ├── SKILL.md                       # 从原 trading-debate/SKILL.md 移过来
            └── references/
                ├── framework-reference.md     # TradingAgents + ai-hedge-fund 架构对照
                ├── role-prompts.md            # 8 个角色完整 prompt 模板
                ├── master-styles.md           # v0.2 — 7 个大师风格 agent
                ├── reflection.md              # v0.3 — 跨会话反思机制
                ├── portfolio-layer.md         # v0.4 — 多标的组合层
                ├── cross-ticker-lessons.md    # v0.5 — 跨标的教训聚合
                └── multi-market.md            # v0.5 — 跨市场基准选择
```

### 关键改动

| 原路径 | 新路径 |
|-------|-------|
| `stock-analyzer/SKILL.md` | `stock-analyzer/skills/stock-analyzer/SKILL.md` |
| `stock-analyzer/references/` | `stock-analyzer/skills/stock-analyzer/references/` |
| `market-scanner/SKILL.md` | `market-scanner/skills/market-scanner/SKILL.md` |
| `market-scanner/references/` | `market-scanner/skills/market-scanner/references/` |
| `trading-debate/SKILL.md` | `trading-debate/skills/trading-debate/SKILL.md` |
| `trading-debate/references/` | `trading-debate/skills/trading-debate/references/` |

**为什么多嵌一层 `skills/`**：Claude Code Plugin 规范要求 plugin 内的 skill 放在 `skills/<skill-name>/` 下，引擎才能识别。直接放 plugin 根目录不会被加载。

### 操作命令（执行前先备份分支）

```bash
cd /Users/admin/Developer/stock-skills
git checkout -b feat/plugin-migration

# stock-analyzer
mkdir -p stock-analyzer/skills/stock-analyzer
git mv stock-analyzer/SKILL.md stock-analyzer/skills/stock-analyzer/SKILL.md
git mv stock-analyzer/references stock-analyzer/skills/stock-analyzer/references

# market-scanner
mkdir -p market-scanner/skills/market-scanner
git mv market-scanner/SKILL.md market-scanner/skills/market-scanner/SKILL.md
git mv market-scanner/references market-scanner/skills/market-scanner/references

# trading-debate（新增）
mkdir -p trading-debate/skills/trading-debate
git mv trading-debate/SKILL.md trading-debate/skills/trading-debate/SKILL.md
git mv trading-debate/references trading-debate/skills/trading-debate/references

# manifests
mkdir -p .claude-plugin stock-analyzer/.claude-plugin market-scanner/.claude-plugin trading-debate/.claude-plugin
# 然后写 marketplace.json 和三个 plugin.json（见阶段 2）
```

---

## 阶段 2｜Manifest 文件

### 2.1 `.claude-plugin/marketplace.json`（repo 根）

```json
{
  "name": "stock-skills",
  "owner": "fire-alpha",
  "description": "股票分析 Claude Code Skill 套件 — 富途行情 + Tavily 新闻，覆盖个股深挖与板块扫描",
  "plugins": [
    { "path": "./stock-analyzer" },
    { "path": "./market-scanner" },
    { "path": "./trading-debate" }
  ]
}
```

> `name` 决定用户安装时的 `@<name>` 后缀。建议保留 `stock-skills`，跟 repo 同名最直觉。

### 2.2 `stock-analyzer/.claude-plugin/plugin.json`

```json
{
  "name": "stock-analyzer",
  "version": "1.0.0",
  "description": "个股多维分析助手 — 行情/技术/估值/资金/盘口/同行/新闻/期权链 八维度",
  "author": "fire-alpha",
  "license": "MIT",
  "homepage": "https://github.com/fire-alpha/stock-skills/tree/main/stock-analyzer",
  "keywords": ["stock", "futu", "options", "claude-code-skill"]
}
```

### 2.3 `market-scanner/.claude-plugin/plugin.json`

```json
{
  "name": "market-scanner",
  "version": "1.0.0",
  "description": "市场热点板块扫描 + 产业链外推器 — HK/US 双窗口板块扫描 + L5 传导预测",
  "author": "fire-alpha",
  "license": "MIT",
  "homepage": "https://github.com/fire-alpha/stock-skills/tree/main/market-scanner",
  "keywords": ["stock", "futu", "sector-rotation", "claude-code-skill"]
}
```

### 2.4 `trading-debate/.claude-plugin/plugin.json`

```json
{
  "name": "trading-debate",
  "version": "0.5.0",
  "description": "多 agent 辩论决策 — TradingAgents 七阶段主干 + ai-hedge-fund 7 大师 + Reflection + 多标的组合层 + 跨标的教训聚合 + 跨市场基准选择",
  "author": "fire-alpha",
  "license": "MIT",
  "homepage": "https://github.com/fire-alpha/stock-skills/tree/main/trading-debate",
  "keywords": ["stock", "trading-agents", "multi-agent", "bull-bear-debate", "claude-code-skill"]
}
```

> ⚠️ `plugin.json` 完整 schema 文档校验过但有些字段（如 `dependencies` / `scripts`）未明确，先用最小集 `name / version / description / author / license / homepage / keywords`，后续按需补。

---

## 阶段 3｜版本管理 + CHANGELOG

### 3.1 `CHANGELOG.md`（repo 根，共享）

按 plugin 分章节，每个 plugin 各自版本节奏：

```markdown
# Changelog

## stock-analyzer

### v1.0.0 (2026-05-10)
- 首次以 plugin 形式发布
- 含八维度分析（行情/技术/估值/资金/盘口/同行/新闻/期权链）
- 期权链扫描含到期日选择策略 + 单 strike 极端堆积识别

## market-scanner

### v1.0.0 (2026-05-10)
- 首次以 plugin 形式发布
- 5 层漏斗扫描（L0 主题发现 → L1-L4 信号交集 → L5 产业链外推）
- 七大 bug 修复：CONCEPT 并扫、5d∪10d 并集、权重法背离、集中度前置门槛、美股蓝筹资金流 fallback、PE 字段 fallback、新闻发现通道
- L5 产业链外推（受约束的预测，五类传导路径 + 数据回测四档）

## trading-debate

### v0.5.0 (2026-05-14)
- 首次以 plugin 形式发布（含 v0.1-v0.5 全部能力）
- v0.1：TradingAgents 完整七阶段主干（analysts → bull/bear → research-manager → trader → risk 三方 → portfolio-manager → 复盘锚点）+ 5 档评级（Buy/Overweight/Hold/Underweight/Sell）+ 阶段 0 数据采集硬约束
- v0.2：ai-hedge-fund 风格 7 大师 agent（Buffett/Munger/Lynch/Burry/Druckenmiller/Damodaran/Ackman），4 段式 prompt（角色 + checklist + signal rules + confidence scale 0-100），信号注入 Bull/Bear 辩论作为弹药
- v0.3：跨会话 Reflection — 决策存档到 Claude Code memory + 3 月窗口反思 + 历史教训自动召回注入 PM prompt
- v0.4：多标的组合层 — 候选并行跑七阶段 + 60 日相关性矩阵 + 组合层 PM（5 档评级 + 信心度排序 + 相关性折扣 >0.7 减半 + 行业封顶 25% + 换手 ≤20%）+ 组合复盘锚点
- v0.5：跨标的教训聚合（阶段 L1，4 维度切片找模式级错误）+ 跨市场基准选择（阶段 M1，市值加权基准 + 交易时段对齐 + 汇率敞口 + 双 alpha 口径）
- 七阶段 + 大师 + Reflection + 组合层 + 跨标的聚合 + 跨市场五层叠加，token 用量大，建议 Opus 模型
```

### 3.2 Git Tag 策略

每个 plugin 独立打 tag，前缀区分：

```bash
git tag stock-analyzer-v1.0.0
git tag market-scanner-v1.0.0
git tag trading-debate-v0.5.0
git push origin --tags
```

> 不用 monorepo 全局 tag（`v1.0.0`）——两个 plugin 节奏不同，统一 tag 会导致小改动也得双双 bump。

### 3.3 版本 bump 规则

- **patch**（v1.0.0 → v1.0.1）：bug 修复、文案微调、references 修正
- **minor**（v1.0.0 → v1.1.0）：加维度、加传导路径、新增可选参数
- **major**（v1.0.0 → v2.0.0）：流程结构变化（如 L1-L5 改 L1-L7）、breaking change

---

## 阶段 4｜README 更新

替换 `README.md` 中"安装"章节为：

````markdown
## 安装（Plugin 方式 · 推荐）

```bash
# 1. 一次性添加 marketplace
/plugin marketplace add fire-alpha/stock-skills

# 2. 装 plugin
/plugin install stock-analyzer@stock-skills
/plugin install market-scanner@stock-skills
/plugin install trading-debate@stock-skills

# 3. 升级
/plugin update stock-analyzer
/plugin update market-scanner
/plugin update trading-debate

# 4. 卸载
/plugin uninstall stock-analyzer
```

## 安装（旧版 · 直接拷贝）

如果暂时不想用 plugin，仍可手动拷贝 SKILL：

```bash
git clone https://github.com/fire-alpha/stock-skills.git ~/tmp-stock-skills
cp -r ~/tmp-stock-skills/stock-analyzer/skills/stock-analyzer ~/.claude/skills/stock-analyzer
cp -r ~/tmp-stock-skills/market-scanner/skills/market-scanner ~/.claude/skills/market-scanner
cp -r ~/tmp-stock-skills/trading-debate/skills/trading-debate ~/.claude/skills/trading-debate
rm -rf ~/tmp-stock-skills
```
````

---

## 阶段 5｜测试 install（落 PR 前必跑）

```bash
# 在测试机或当前机器
/plugin marketplace add fire-alpha/stock-skills
/plugin install stock-analyzer@stock-skills
/plugin install market-scanner@stock-skills
/plugin install trading-debate@stock-skills

# 验证 skill 能被触发
> 分析 NVDA                        # 应触发 stock-analyzer
> 港股最近啥热点                    # 应触发 market-scanner
> NVDA 给我一次多空辩论决策          # 应触发 trading-debate（应自动调 stock-analyzer + event-calendar）
> 用 Buffett + Burry 视角看 700    # 应触发 trading-debate v0.2 大师团模式
> 复盘我对 NVDA 的决策              # 应触发 trading-debate v0.3 反思流程
> NVDA / AAPL / TSLA 哪个该加仓     # 应触发 trading-debate v0.4 组合层
> NVDA + 700 + 茅台 该怎么排         # 应触发 trading-debate v0.5 跨市场基准选择
> 我对半导体股的判断有什么模式问题     # 应触发 trading-debate v0.5 跨标的教训聚合
```

**冲突测试**（重要）：
- 用户本地已有 `~/.claude/skills/stock-analyzer/` 时再装 plugin，验证哪边优先
- 文档没明确，**实测一次**，把结论补到 README 的 FAQ

---

## 阶段 6｜共创流程文档（CONTRIBUTING.md）

新建 `CONTRIBUTING.md`，约定：

1. **PR 流程**
   - fork（外部）/ 直接 push 分支（org member）
   - 改 SKILL.md 或 references → 提 PR → 至少 1 人 review
   - merge 后由 maintainer 决定是否 bump version

2. **版本 bump 何时做**
   - 每个 PR 不强制 bump，攒到一个发布点再统一改 plugin.json + 打 tag
   - 紧急 bug 修复立刻 bump patch

3. **维护者**
   - 列在 README 或 CONTRIBUTING 末尾，明确谁能 merge

4. **不接收的 PR 类型**
   - 个人投顾/选股推荐
   - 含个人 API key / 富途账号 / 真实仓位数据
   - 跟 stock 主题不相关的 skill（建议另开 repo）

---

## 风险 / 不确定点（落地前留意）

| 风险 | 怎么应对 |
|-----|---------|
| **同名冲突优先级**（本地 skill vs plugin skill 同名） | 文档未明确。实测后写进 README FAQ |
| **plugin.json 字段 schema** | 用最小集，后续按需扩 |
| **官方 marketplace 目录提交流程** | 不依赖。public repo + marketplace.json 合规即可被 `/plugin marketplace add fire-alpha/stock-skills` 拉 |
| **transfer repo 后旧 URL** | GitHub 自动 301 redirect，但 `~/.claude/skills/` 里手动 clone 的副本不会自动更新——README 写一句"原个人 repo URL 已 transfer，建议改用 plugin 装" |
| **version bump 漏改** | CI 加个简单 check：PR 改 SKILL.md 时若 plugin.json version 没动且 commit 不是 docs-only，提示 reviewer |

---

## 落地优先级

1. ⏳ **阶段 0**：建 org + transfer repo（**阻塞所有后续**，org 名已定为 `fire-alpha`）
2. **阶段 1**：目录重组（独立分支，可 review）
3. **阶段 2**：写三个 manifest
4. **阶段 3**：CHANGELOG + git tag
5. **阶段 4**：README 更新
6. **阶段 5**：本地实测 install
7. **阶段 6**：CONTRIBUTING.md
8. 合 PR + push tag → 公告

---

## 当前阻塞

🔴 **等用户在 GitHub 网页完成阶段 0**：

1. 登录 github.com → 右上角 + → New organization → Free plan
2. Organization name 填 `fire-alpha`
3. 邮箱用你的常用邮箱即可
4. 创建后进 `github.com/zayn8888888/stock-skills` → Settings → Danger Zone → Transfer ownership
5. New owner 填 `fire-alpha`，按提示输入 repo 名确认
6. 等 GitHub 完成 transfer（通常几秒）

完成后告诉 AI，AI 会：
- 更新本地 git remote 到 `git@github.com:fire-alpha/stock-skills.git`
- 跑阶段 1-4（目录重组 + 三个 manifest + CHANGELOG + README 更新）
- 推送 PR 分支让你 review
