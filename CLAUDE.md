# CLAUDE.md — stock-skills 项目指南

## 项目概述

stock-skills 是一个全栈股票 & 加密货币研究平台，包含两层：
1. **Claude Code Skills** (`skills/`) — Markdown 提示词集合，可独立用于 CLI
2. **Web Research Runtime** (`src/`) — Next.js 15 全栈应用，提供 GUI 研究台

本地单用户应用，SQLite 存储，不需要多用户或云端部署。

## 技术栈

- **框架**: Next.js 15 App Router + React 19 + TypeScript 5.8
- **包管理**: pnpm
- **数据库**: SQLite (better-sqlite3) + Drizzle ORM
- **Agent 引擎**: Pi Agent Core (`@earendil-works/pi-agent-core`) + Anthropic SDK
- **前端状态**: Zustand
- **UI**: Tailwind CSS 4 + shadcn/ui (Radix) + Lucide React
- **实时通信**: SSE + EventBus
- **Lint/Format**: Biome
- **测试**: Vitest
- **国际化**: i18next (zh-CN / en-US)

## 常用命令

```bash
pnpm dev            # 启动开发服务器
pnpm build          # 生产构建
pnpm test           # 运行测试
pnpm lint           # Lint 检查
pnpm db:generate    # 生成 Drizzle 迁移
pnpm db:migrate     # 执行数据库迁移
```

## 项目结构

```
src/
├── app/                    # Next.js 页面 + API 路由
│   ├── page.tsx            # Research Desk 主页
│   └── api/                # REST API 端点
│       ├── sessions/       # 会话 + 消息 + SSE 事件流
│       ├── runs/           # Agent Run 管理
│       ├── data-sources/   # 数据源 CRUD + 健康检查
│       ├── tickers/        # Ticker 上下文
│       └── health/         # 健康检查
├── components/             # React 组件
│   ├── layout/             # AppShell, Sidebar, ConnectionBanner
│   ├── research/           # WelcomeScreen, Composer, MessageBubble, Timeline
│   └── run/                # Run 详情组件
├── lib/
│   ├── adapters/           # 数据源适配器
│   │   ├── base.ts         # DataSourceAdapter 接口
│   │   ├── registry.ts     # 适配器注册表（单例）
│   │   ├── init.ts         # 初始化适配器 + SourceRouter
│   │   ├── futu/           # Futu 适配器（15 能力，WebSocket 通信）
│   │   ├── eastmoney/      # 东方财富适配器（3 能力，HTTP）
│   │   ├── futu-news/      # Futu 新闻适配器
│   │   └── fixture/        # 测试固件适配器
│   ├── agent/              # Agent 执行层
│   │   ├── skill-loader.ts # 加载 agent 定义（yaml + prompt.md + output-contract.json）
│   │   ├── context.ts      # 构建 agent 上下文（session 消息、goals、observations）
│   │   ├── tools.ts        # Anthropic 格式工具定义（系统工具 + 数据能力工具）
│   │   ├── pi-tools.ts     # 工具适配为 Pi 框架格式
│   │   ├── schema-bridge.ts # JSON Schema → TypeBox 转换
│   │   ├── pi-runner.ts    # PiAgentRunner（20 次迭代上限，5 分钟超时）
│   │   ├── task-runner.ts  # TaskRunner（最大 2 并发，10 分钟超时）
│   │   ├── loop-registry.ts # 运行中 runId → PiAgentRunner 映射
│   │   └── llm-provider.ts # LLM 配置
│   ├── db/                 # Drizzle Schema（13 张表）+ 迁移
│   ├── runtime/
│   │   ├── event-bus.ts    # 会话级 EventBus（500 事件环形缓冲，SSE 用）
│   │   ├── run-manager.ts  # Run CRUD
│   │   ├── goal-manager.ts # 研究目标管理
│   │   └── artifact-writer.ts # 写入分析产物
│   ├── data-source/
│   │   ├── router.ts       # SourceRouter（capability + market → provider 列表）
│   │   ├── seed.ts         # 启动时 seed/refresh 数据源路由表
│   │   └── capabilities.json # 22 个数据能力定义
│   ├── auth/               # Token 认证中间件
│   └── config.ts           # 运行时配置
├── stores/                 # Zustand store（LRU 会话缓存，SSE 状态）
├── hooks/                  # useSSE, useTheme, useLanguage
└── i18n/                   # 中英翻译文件

skills/
├── stock/                  # 股票 skill：market-scanner, stock-analyzer, stock-fundamentals, stock-valuation
├── core/                   # 通用 skill：event-calendar, hyperliquid-perps, trading-debate
├── crypto/                 # 加密 skill：crypto-scanner, crypto-analyzer
├── futu/                   # Futu OpenAPI 集成（70+ Python 脚本）
└── agents/                 # Web Agent 定义
    ├── stock-analyzer/     # agent.yaml + prompt.md + output-contract.json
    ├── market-scanner/
    ├── trading-debate/
    ├── event-calendar/
    ├── crypto-research/
    └── portfolio-review/

tests/                      # Vitest 测试
docs/superpowers/           # 设计文档 + UI 原型
analysis/                   # 运行时产物（SQLite, Artifacts, Token）— 不入库
```

## 关键架构模式

### 数据源适配器层
- `DataSourceAdapter` 接口统一所有数据源（healthCheck, fetch, normalize, capabilities）
- `AdapterRegistry` 单例管理所有适配器
- `SourceRouter` 根据 (capability, market) 自动路由到最佳 provider，支持降级
- 启动时 `seed.ts` 从 `capabilities.json` + 各适配器 `manifest.json` 初始化 DB 路由表

### Agent 执行流程
1. 用户消息 → `POST /api/sessions/[id]/messages`
2. 加载 agent 定义（`skill-loader.ts`）：合并 prompt + SKILL.md + references
3. 构建上下文（`context.ts`）：session 消息、goals、ticker observations
4. 创建工具集（`tools.ts`）：`write_artifact` + `update_goal_evidence` + 22 个数据能力工具
5. 适配为 Pi 格式（`pi-tools.ts` + `schema-bridge.ts`）
6. `PiAgentRunner` 执行（20 次迭代，5 分钟超时）
7. 实时事件通过 `EventBus` → SSE 推送到前端

### 实时通信
- EventBus 是会话级的内存事件总线（500 事件环形缓冲，最多 50 channel）
- SSE 端点支持 Last-Event-ID 回放、30 秒心跳、10 分钟最大生命周期
- 前端 `useSSE` hook 管理指数退避重连（1s → 30s）

### 认证
- Token 认证（`analysis/.token`）
- GET/HEAD 免认证；POST/PATCH/DELETE 需 CSRF + Bearer token
- 本地单用户，无多用户支持

## 编码约定

- **路径别名**: `@/*` → `src/*`
- **Linter**: Biome（`pnpm lint`），提交前运行
- **测试**: Vitest（`pnpm test`），测试文件在 `tests/` 目录
- **类型安全**: 严格 TypeScript，Zod 校验 API 输入
- **数据库**: Drizzle ORM，schema 在 `src/lib/db/schema.ts`，迁移用 `pnpm db:generate && pnpm db:migrate`
- **组件**: shadcn/ui 模式，Radix 原语 + Tailwind
- **国际化**: 所有用户可见文本用 i18next，翻译文件在 `src/i18n/`
- **Git**: 主分支 `main`，`analysis/` 目录在 .gitignore 中

## 环境变量

关键配置在 `.env` 文件中：
- `ANTHROPIC_API_KEY` — LLM API key
- `ANTHROPIC_BASE_URL` — API 端点（默认 Xiaomi 代理）
- `MODEL_ID` — 模型 ID（默认 `mimo-v2.5-pro`）
- `CONTEXT_WINDOW` / `MAX_TOKENS` — 上下文窗口和最大输出
- `FINNHUB_API_KEY` — Finnhub（可选）
- `COINGECKO_DEMO_KEY` — CoinGecko（可选）
- `TAVILY_API_KEY` — Tavily 搜索（推荐）

## 数据库 Schema

SQLite 13 张表（Drizzle ORM）：
- `sessions`, `messages` — 会话和消息
- `researchGoals`, `goalCriteria`, `goalEvidence` — 研究目标追踪
- `runs`, `runEvents`, `sessionEvents` — Agent 执行和事件
- `artifacts` — 输出产物（报告、图表、数据）
- `observations`, `decisions`, `lessons` — 观察、决策、教训
- `dataProviders`, `dataCapabilities`, `dataSourceRoutes` — 数据源路由

## 注意事项

- `analysis/` 目录是运行时生成的，包含 SQLite 数据库、产物文件和认证 token，不入库
- Futu 数据需要本地 OpenD 运行（127.0.0.1:11111）
- EventBus 单例存储在 `globalThis` 上以在 Next.js HMR 中存活
- TaskRunner 最大 2 并发任务，每个 10 分钟超时
- PiAgentRunner 最大 20 次迭代，5 分钟超时
