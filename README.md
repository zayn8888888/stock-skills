# stock-skills

> 股票 & 加密货币全栈研究平台：**Claude Code Skill 提示词集** + **Next.js Web 研究台**。基于富途 OpenAPI 实时行情、东方财富、Tavily 新闻搜索等多源数据，由 LLM Agent 驱动，覆盖从市场扫描到个股深挖、辩论决策的完整研究工作流。

## 架构概览

项目分两层：

```
┌──────────────────────────────────────────────────────────┐
│  Layer 2: Web Research Runtime (Next.js 15 App Router)   │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐            │
│  │  React UI │  │ SSE 实时流 │  │ SQLite DB  │            │
│  │  Zustand  │  │ EventBus  │  │ Drizzle ORM│            │
│  └──────────┘  └───────────┘  └────────────┘            │
│  ┌──────────────────────────────────────────────┐        │
│  │  Pi Agent Runner (pi-agent-core)             │        │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │        │
│  │  │ Agent    │  │ Tool     │  │ TaskRunner│  │        │
│  │  │ Loader   │  │ Executor │  │ 并发控制   │  │        │
│  │  └──────────┘  └──────────┘  └───────────┘  │        │
│  └──────────────────────────────────────────────┘        │
│  ┌──────────────────────────────────────────────┐        │
│  │  Data Source Adapter Layer (可插拔)            │        │
│  │  Futu │ EastMoney │ FutuNews │ CoinGecko ... │        │
│  │  SourceRouter → 自动路由 + 降级               │        │
│  └──────────────────────────────────────────────┘        │
├──────────────────────────────────────────────────────────┤
│  Layer 1: Claude Code Skills (Markdown Prompt 集合)      │
│  skills/stock/ │ skills/core/ │ skills/crypto/ │ agents/ │
└──────────────────────────────────────────────────────────┘
```

## 项目结构

```
stock-skills/
├── src/                          # Next.js Web 应用
│   ├── app/                      # 页面 + API 路由
│   │   ├── page.tsx              # Research Desk 主页（聊天界面）
│   │   ├── data-sources/         # 数据源管理页
│   │   ├── reviews/              # 复盘队列页
│   │   ├── runs/[runId]/         # Run 详情页（数据/日志/报告）
│   │   ├── tickers/[ticker]/     # Ticker 详情页
│   │   └── api/                  # REST API 路由
│   │       ├── sessions/         # 会话管理 + 消息提交 + SSE 流
│   │       ├── runs/             # Agent Run 管理
│   │       ├── data-sources/     # 数据源 CRUD + 健康检查
│   │       ├── tickers/          # Ticker 相关上下文
│   │       ├── decisions/        # 交易决策
│   │       ├── lessons/          # 跨会话教训
│   │       └── health/           # 健康检查
│   ├── components/               # React UI 组件
│   │   ├── layout/               # AppShell, Sidebar, ConnectionBanner
│   │   ├── research/             # WelcomeScreen, Composer, MessageBubble
│   │   └── run/                  # Run 详情组件
│   ├── lib/                      # 核心后端库
│   │   ├── adapters/             # 数据源适配器（Futu, EastMoney, FutuNews, Fixture）
│   │   ├── agent/                # Agent 执行层（Pi Runner, Tool 系统, Skill 加载）
│   │   ├── auth/                 # Token 认证中间件
│   │   ├── db/                   # Drizzle Schema + 迁移
│   │   ├── runtime/              # EventBus, RunManager, GoalManager, ArtifactWriter
│   │   ├── data-source/          # SourceRouter, Seed, Capabilities 定义
│   │   └── config.ts             # 运行时配置
│   ├── stores/                   # Zustand 状态管理
│   ├── hooks/                    # SSE, Theme, Language hooks
│   └── i18n/                     # 中英双语
├── skills/                       # Claude Code Skill 提示词
│   ├── stock/                    # market-scanner, stock-analyzer, stock-fundamentals, stock-valuation
│   ├── core/                     # event-calendar, hyperliquid-perps, trading-debate
│   ├── crypto/                   # crypto-scanner, crypto-analyzer
│   ├── futu/                     # futuapi Python 脚本集 + OpenD 安装指引
│   └── agents/                   # Web Agent 定义（agent.yaml + prompt.md + output-contract.json）
├── scripts/                      # 安装 / 更新 / 卸载脚本
├── tests/                        # Vitest 测试
├── docs/superpowers/             # 设计文档 + UI 原型
└── analysis/                     # 运行时生成（SQLite, Artifacts, Token）— 不入库
```

## 包含的 Skill

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`market-scanner/`](skills/stock/market-scanner/) | 大A / HK / US 市场热点板块扫描 + 候选股挖掘 | "市场最近啥热点" / "帮我找下一个热点" |
| [`stock-analyzer/`](skills/stock/stock-analyzer/) | 单只股票九维度综合分析（行情/技术/估值/资金/盘口/同行/新闻/期权/事件） | "分析 NVDA" / "腾讯能不能抄底" |
| [`stock-fundamentals/`](skills/stock/stock-fundamentals/) | 自下而上基本面（商业模式→护城河→财务→估值视角） | "茅台适不适合长期持有" / "护城河在哪" |
| [`stock-valuation/`](skills/stock/stock-valuation/) | DCF + 历史 P/E + PEG 定量估值与安全边际区间 | "帮我估一下 AAPL 合理价" |
| [`event-calendar/`](skills/core/event-calendar/) | 未来 14 天前瞻事件日历（Finnhub/Polymarket/Tavily 三源整合） | "未来一周有什么大事" / "FOMC 降息概率" |
| [`hyperliquid-perps/`](skills/core/hyperliquid-perps/) | Hyperliquid 链上永续镜像（美股/SPX/VIX/商品/FX/Pre-IPO），24/7 | "NVDA 周末链上多少" / "TSLA funding 拥不拥挤" |
| [`trading-debate/`](skills/core/trading-debate/) | 多 agent 辩论决策（七阶段 + 7 大师 + Reflection + 组合层） | "NVDA 多空辩论" / "Buffett+Burry 视角看 700" |
| [`crypto-scanner/`](skills/crypto/crypto-scanner/) | 加密市场热点赛道扫描（CoinGecko + Hyperliquid 拥挤度） | "加密最近什么赛道在涨" / "山寨季开了吗" |
| [`crypto-analyzer/`](skills/crypto/crypto-analyzer/) | 单只加密资产七维度分析（行情/技术/链上/叙事/同类/新闻/事件） | "分析 SOL" / "ETH 值不值得买" |

**链式协作**：scanner → analyzer → fundamentals/valuation → trading-debate，event-calendar 和 hyperliquid-perps 横向辅助。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript 5.8 |
| 状态管理 | Zustand (前端) + SQLite (后端) |
| ORM | Drizzle ORM + better-sqlite3 |
| Agent 引擎 | Pi Agent Core (`@earendil-works/pi-agent-core`) + Anthropic SDK |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) + Lucide React |
| 实时通信 | SSE (Server-Sent Events) + EventBus |
| 工具链 | pnpm + Biome (lint/format) + Vitest (test) |
| 国际化 | i18next (中文/英文) |

## 外部数据源

| 数据源 | 覆盖 | 认证 |
|--------|------|------|
| **Futu OpenAPI** | 港美股实时行情、K 线、资金流、期权链、财报 | 需 OpenD 本地运行 (127.0.0.1:11111) |
| **东方财富** | A 股概念板块扫描（486 板块） | 无需认证 |
| **Futu News** | 新闻/舆情 | 无需认证 |
| **Tavily** | Web 新闻搜索 | API Key |
| **Finnhub** | 美国经济日历 + 美股财报日历 | API Key (免费) |
| **Polymarket** | 预测市场赔率 | 无需认证 |
| **CoinGecko** | 加密行情/赛道/热搜 | Demo Key (免费，可选) |
| **Hyperliquid** | 链上永续合约数据 | 无需认证 |

## 安装

### Web 应用

```bash
git clone https://github.com/zayn8888888/stock-skills.git ~/stock-skills
cd ~/stock-skills
pnpm install
cp .env.example .env   # 配置 API keys 和模型信息
pnpm dev               # 开发模式 http://localhost:3000
```

生产构建：

```bash
pnpm build
pnpm start
```

### Claude Code Skills（CLI 模式）

```bash
# 软链模式（推荐）
./scripts/install.sh --link

# 拷贝模式
./scripts/install.sh

# 只装部分 skill
./scripts/install.sh --link stock-analyzer market-scanner
```

更新：

```bash
./scripts/update.sh
```

## 共同依赖

### 富途 OpenAPI（Web 模式必需，CLI 模式推荐）

- **富途 OpenD** 运行中，默认 `127.0.0.1:11111`
  - 下载：<https://www.futunn.com/OpenAPI>

### Tavily 搜索（推荐）

- **stock-analyzer** 新闻维度 / **event-calendar** 中港政策均依赖 Tavily
- 没有时降级或跳过

### event-calendar 额外依赖（可选）

- **Finnhub API key**：`export FINNHUB_API_KEY=xxxxxx`（首选写入 `~/.zshenv`）
- **Polymarket Gamma API**：无需 key

### crypto-scanner / crypto-analyzer 额外依赖

- **CoinGecko Demo API key**：`export COINGECKO_DEMO_KEY=CG-xxxxxx`（首选写入 `~/.zshenv`）
- 未配置时自动降级到公共端点

### hyperliquid-perps

- **零依赖**：Hyperliquid 公开端点，仅需 `curl` + `jq`

## 使用

### Web 模式

启动后打开 `http://localhost:3000`，在 Research Desk 界面输入自然语言：

- 选择工作流：Analyze / Debate / Scan / Review
- 输入如 "分析 NVDA"、"帮我找下一个热点"、"加密最近什么赛道在涨"
- Agent 自动调用数据工具，实时流式输出报告

### Claude Code CLI 模式

安装 skill 后直接对 Claude 说自然语言即可：

```
# 触发 market-scanner
港股最近哪个板块在涨

# 触发 stock-analyzer
分析一下 US.NVDA
五粮液能不能抄底

# 触发 stock-fundamentals
茅台护城河在哪

# 触发 stock-valuation
帮我用 DCF / P/E / PEG 估一下 US.AAPL 合理区间

# 触发 event-calendar
未来 14 天有什么大事
NVDA 什么时候出财报

# 触发 trading-debate
NVDA 给我一次多空辩论决策
用 Buffett + Burry 视角看 700
NVDA / AAPL / TSLA 哪个该加仓

# 触发 crypto-scanner / crypto-analyzer
加密最近什么赛道在涨
分析 SOL
```

## 文档

### 设计文档

- [`docs/superpowers/specs/2026-05-30-research-runtime-v2-design.md`](docs/superpowers/specs/2026-05-30-research-runtime-v2-design.md) — Web Research Runtime v2 设计规格
- [`docs/superpowers/specs/data-source-v2.md`](docs/superpowers/specs/data-source-v2.md) — 数据源适配层设计

### Skill 文档

- [`stock-analyzer/SKILL.md`](skills/stock/stock-analyzer/SKILL.md) — 个股九维度分析流程
- [`stock-analyzer/references/`](skills/stock/stock-analyzer/references/) — 方法论 / 指标陷阱 / 报告模板
- [`stock-fundamentals/SKILL.md`](skills/stock/stock-fundamentals/SKILL.md) — 商业模式 / 护城河 / 财务验证 / 估值四步框架
- [`market-scanner/SKILL.md`](skills/stock/market-scanner/SKILL.md) — 板块扫描 + 候选股筛选流程
- [`stock-valuation/SKILL.md`](skills/stock/stock-valuation/SKILL.md) — DCF / P/E / PEG 估值与安全边际模板
- [`event-calendar/SKILL.md`](skills/core/event-calendar/SKILL.md) — 前瞻事件日历三源整合
- [`trading-debate/SKILL.md`](skills/core/trading-debate/SKILL.md) — 多 agent 辩论决策七阶段
- [`crypto-scanner/SKILL.md`](skills/crypto/crypto-scanner/SKILL.md) — 加密市场热点赛道扫描
- [`crypto-analyzer/SKILL.md`](skills/crypto/crypto-analyzer/SKILL.md) — 单只加密资产七维度分析

## NPM Scripts

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (Turbopack) |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm lint` | Biome lint + format 检查 |
| `pnpm db:generate` | 生成 Drizzle 迁移 |
| `pnpm db:migrate` | 执行数据库迁移 |

## ⚠️ 免责声明

**本项目只是一个 LLM prompt 集合 + 研究工具，不是投资建议、不是投资顾问、不是金融产品。**

- 所有分析由大语言模型生成，**可能包含错误、幻觉或过时数据**
- 任何基于本项目输出的投资决策由使用者自行承担全部风险
- 作者不对任何直接或间接损失负责
- **禁止**用于商业投顾、付费荐股、金融机构对外服务
- 使用富途 OpenAPI 需遵守富途 [OpenAPI 服务协议](https://www.futunn.com/OpenAPI)，本项目与富途无任何合作或背书关系
- 市场有风险，决策需谨慎

完整免责见 [DISCLAIMER.md](DISCLAIMER.md)。

## License

[MIT](LICENSE) © zaynhuang

## 贡献

欢迎 issue 和 PR，尤其是：

- 维度判断逻辑的完善
- 新市场适配（台股等）
- 输出模板改进
- 新数据源适配器
- Web UI 改进

提交前请确认没有引入任何个人账户 ID、API key 或专有数据。
