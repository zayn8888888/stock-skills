# Research Runtime 设计规格 v2

日期：2026-05-30
状态：Draft — 待用户审核

## 背景

当前仓库是一个股票、加密、富途生态的 skill 套件。仓库从"prompt/skill 文档集合"升级为本机单用户 Research Runtime。

v1 spec（同文件名，Python FastAPI 版）定义了数据模型和 API 契约，但实现选型需要更新为 TypeScript 全栈。本 spec 是 v2，保留 v1 的数据模型、API 设计和业务规则，重写技术栈和实施计划。

参考项目：`~/Code/Vibe-Trading` 的 `/agent` 交互形态。

## 目标

1. 本机单用户研究台，默认监听 `127.0.0.1`。
2. Server 负责 run lifecycle、数据源适配、SQLite 索引、artifacts 保存、召回和复盘队列。
3. Web UI 负责人类工作台：启动分析、查看历史、检查数据源、浏览 artifact、处理复盘。
4. Agent-ready：Codex、Web agent、CLI、Web UI 都通过同一套 API 读写状态。
5. Markdown + structured sidecar：Markdown 是人类阅读层，JSON sidecar 是机器状态层。
6. 数据源中间层：原始数据完整保存，统一归一化为 Canonical Observation。

## 非目标

- 不做多用户登录、云同步、权限隔离。
- 不做实盘下单或交易执行。
- 不依赖 live API 才能跑单元测试。
- 不把所有 skill prompt 逻辑完整搬进 server。

## 技术栈

### 全栈框架

| 层 | 选型 | 版本 | 理由 |
|---|---|---|---|
| 框架 | Next.js (App Router) | 15+ | 全栈一体：API Route Handlers + React UI + SSE，单包部署 |
| Runtime | Node.js | ≥ 20 | 自托管 `next start`，持久进程支持 SQLite |
| SQLite | better-sqlite3 | latest | 同步、快、无 native build 问题 |
| ORM | Drizzle ORM | latest | schema 即 TS 类型、migration 友好、支持 better-sqlite3 |
| 校验 | Zod | latest | 和 Drizzle 共享 schema，API 入口统一校验 |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) | latest | Claude 官方 SDK，原生支持 tool use + streaming |
| Auth | 本地 session token + Origin 校验 | — | 无第三方 |

### 前端（Next.js 内置 React）

| 层 | 选型 | 版本 | 理由 |
|---|---|---|---|
| 状态 | Zustand | 5 | 轻量全局状态（messages, session, streaming） |
| 样式 | Tailwind CSS | 4 | utility-first，Next.js 原生支持 |
| 组件库 | shadcn/ui | latest | Radix 原语 + Tailwind，完全可控 |
| 图标 | lucide-react | latest | shadcn 配套 |
| 表格 | @tanstack/react-table | latest | Dashboard/Review Queue |
| Markdown | react-markdown + rehype-highlight + remark-gfm | — | Report 渲染 |
| Toast | sonner | latest | shadcn 内置 |
| 图表 | Lightweight Charts (TradingView) | latest | 股票 K 线 |
| i18n | react-i18next + i18next | latest | 中英双语 UI chrome |

### 工具链

| 用途 | 选型 |
|---|---|
| 包管理 | pnpm（单一 package.json） |
| TS 编译 | Next.js 内置（tsc 仅做类型检查） |
| Lint | Biome |
| 测试 | Vitest（统一测试 API routes + 组件） |
| API 测试 | Next.js test utils + Vitest |

### 设计系统

基于 UI/UX Pro Max 分析 + spec 要求，支持 Light / Dark 双主题，默认浅色。使用 shadcn/ui 的 CSS variable token 系统，一套 semantic token 名映射到两组色值。

**Light theme 色彩**：
- 背景：`hsl(0 0% 100%)` / `hsl(210 40% 98%)`
- 前景/文字：`hsl(222 47% 11%)` / `hsl(217 33% 17%)`
- 主色（ready/succeeded/primary action）：teal `hsl(173 80% 36%)` / `hsl(174 66% 45%)`
- 警告（due/degraded/warning）：amber `hsl(38 92% 50%)` / `hsl(43 96% 56%)`
- 失败（failed/negative）：red `hsl(0 84% 60%)` / `hsl(0 74% 42%)`
- 次要/信息：blue `hsl(217 91% 60%)` / `hsl(221 83% 53%)`
- Card：`hsl(0 0% 100%)`
- Border：`hsl(214 32% 91%)`
- Muted：`hsl(210 40% 96%)`

**Dark theme 色彩**：
- 背景：`hsl(222 47% 7%)` （deep navy-charcoal，接近 OLED 纯黑但保留层次）
- 前景/文字：`hsl(210 40% 98%)`
- 主色：teal `hsl(174 66% 45%)`（暗色下提亮 1 级保证对比度 ≥ 4.5:1）
- 警告：amber `hsl(43 96% 56%)`
- 失败：red `hsl(0 74% 55%)`（暗色下提亮避免 WCAG 失败）
- Card：`hsl(222 47% 11%)`
- Border：`hsl(217 33% 20%)`
- Muted：`hsl(223 47% 15%)`

**Dark mode 切换**：
- 使用 `class` strategy（`dark:` variant），参考 Vibe-Trading 的 `useDarkMode` hook
- 偏好存 `localStorage("theme")`，首次访问读 `prefers-color-scheme`
- shadcn/ui 组件天然支持，只需维护两组 CSS variable
- 图表组件（Lightweight Charts）需要独立主题配置切换

**间距**：
- Radius：6-8px
- Grid：8px base spacing
- Table row height：36-40px
- Sidebar width：240px expanded / 48px collapsed

**排版**：
- 正文：Inter / system-ui，14-16px
- 等宽数据：JetBrains Mono / Fira Code，13-14px
- 标题：font-weight 600

**图标**：Lucide React，stroke-width 1.5-2px，统一风格

**原则**：
- table-first，避免嵌套卡片
- 不使用 hero、装饰 orb、紫蓝渐变、beige/cream 主色
- 数据密度优先（12-col grid, 8px gap, 12px padding）

### 国际化（i18n）

使用 `react-i18next` + `i18next`，支持中英双语。

**V1 语言**：`zh-CN`（默认）、`en-US`。

**Namespace 策略**：按页面/功能域拆分，lazy load 非当前页面的翻译包。

```text
web/src/i18n/
  index.ts              # i18next init + language detector
  locales/
    zh-CN/
      common.json       # 公共：按钮、状态词、错误信息
      research.json     # Research Desk：composer、timeline、context chips
      dashboard.json    # Dashboard
      ticker.json       # Ticker Page
      run.json          # Run Detail
      sources.json      # Data Sources
      reviews.json      # Review Queue
    en-US/
      (同结构)
```

**语言切换**：
- UI 右上角或设置页提供语言切换器
- 偏好存 `localStorage("lng")`，默认 `zh-CN`
- Server API 不返回本地化文本（分析报告本身就是多语言混合）
- 仅 UI chrome（按钮、标签、状态、导航）做 i18n

**原则**：
- 不翻译用户生成内容（messages、reports、observations）
- 不翻译技术字段名（run_id、artifact_type、status 枚举值）
- 翻译范围限于 UI chrome：nav labels、button text、status badges、form labels、error messages、empty states、toast messages
- 日期/数字格式跟随语言 locale（`zh-CN` 用 `YYYY-MM-DD`，`en-US` 用 `MM/DD/YYYY`）

## 目录结构

```text
stock-skills/
  package.json                    # 单一 package.json（Next.js 全栈）
  next.config.ts
  tsconfig.json
  drizzle.config.ts
  biome.json
  tailwind.config.ts
  components.json                 # shadcn/ui config
  vitest.config.ts

  skills/                         # 技能内容 + Agent 定义
    agents/
      stock-analyzer/
        agent.yaml                # workflow_type, required_artifacts, skills[]
        prompt.md                 # 推理 prompt template
        output-contract.json      # result.json JSON Schema
      market-scanner/
      event-calendar/
      trading-debate/
      crypto-research/
      portfolio-review/
    core/                         # 现有 core skills（迁移后）
    stock/
    futu/
    crypto/

  src/
    app/                          # Next.js App Router
      layout.tsx                  # 根 layout：providers, i18n, theme
      globals.css                 # Tailwind base + CSS variable themes
      page.tsx                    # / → Research Desk（默认入口）
      dashboard/
        page.tsx                  # /dashboard
      tickers/
        [ticker]/
          page.tsx                # /tickers/:ticker
      runs/
        [runId]/
          page.tsx                # /runs/:runId
      data-sources/
        page.tsx                  # /data-sources
      reviews/
        page.tsx                  # /reviews
      api/
        health/
          route.ts                # GET /api/health
        sessions/
          route.ts                # POST/GET /api/sessions
          [id]/
            route.ts              # GET/PATCH/DELETE /api/sessions/:id
            messages/
              route.ts            # POST/GET /api/sessions/:id/messages
            events/
              route.ts            # GET /api/sessions/:id/events (SSE)
            cancel/
              route.ts            # POST /api/sessions/:id/cancel
            goal/
              route.ts            # POST/GET/PATCH /api/sessions/:id/goal
              evidence/
                route.ts          # POST /api/sessions/:id/goal/evidence
              status/
                route.ts          # PATCH /api/sessions/:id/goal/status
        runs/
          route.ts                # POST/GET /api/runs
          [id]/
            route.ts              # GET /api/runs/:id
            cancel/
              route.ts            # POST /api/runs/:id/cancel
            artifacts/
              route.ts            # POST/GET /api/runs/:id/artifacts
            report/
              route.ts            # GET /api/runs/:id/report
        tickers/
          [ticker]/
            context/
              route.ts            # GET /api/tickers/:ticker/context
            runs/
              route.ts            # GET /api/tickers/:ticker/runs
            decisions/
              route.ts            # GET /api/tickers/:ticker/decisions
            lessons/
              route.ts            # GET /api/tickers/:ticker/lessons
        data-sources/
          health/
            route.ts              # GET /api/data-sources/health
          check/
            route.ts              # POST /api/data-sources/check
        reviews/
          due/
            route.ts              # GET /api/reviews/due
        decisions/
          route.ts                # POST /api/decisions
          [id]/
            route.ts              # PATCH /api/decisions/:id
        lessons/
          route.ts                # POST /api/lessons
        uploads/
          route.ts                # POST /api/uploads

    lib/                          # 服务端库（API Route + Agent 共用）
      config.ts                   # analysis root, token, host, port, LLM config
      db/
        schema.ts                 # Drizzle schema（所有表定义）
        migrate.ts                # migration runner
        migrations/               # SQL migration files
        index.ts                  # db instance
      agent/
        llm-provider.ts           # Anthropic SDK 封装
        loop.ts                   # ReAct loop: LLM call → tool call → repeat
        tools.ts                  # ToolRegistry: adapter tools + system tools
        context.ts                # ContextBuilder: session history + goal + ticker context
        skill-loader.ts           # 加载 skills/agents/*/prompt.md
        progress.ts               # HeartbeatTimer + ProgressEvent
      adapters/
        registry.ts               # AdapterRegistry
        base.ts                   # DataSourceAdapter interface
        futu/index.ts
        eastmoney/index.ts
        hyperliquid/index.ts
        finnhub/index.ts
        polymarket/index.ts
        tavily/index.ts
        coingecko/index.ts
        fixture/index.ts          # 测试用
      observations/
        schemas.ts                # category value schemas
        store.ts                  # Observation CRUD（SQLite）
        freshness.ts              # freshness policy
      views/
        ticker-context.ts         # TickerContext builder
      runtime/
        event-bus.ts              # session-scoped SSE event bus
        artifact-writer.ts        # path boundary + checksum
        run-manager.ts            # run lifecycle state machine
        goal-manager.ts           # single active goal per session
      auth/
        token.ts                  # local session token
        middleware.ts             # Origin, CSRF, token check
        upload-guard.ts           # size, path, type validation

    components/                   # React 组件
      layout/
        AppShell.tsx              # sidebar + main + connection banner
        Sidebar.tsx               # nav + sessions list
        ConnectionBanner.tsx      # SSE reconnect status
      research/
        Timeline.tsx              # message + run card + artifact card
        MessageBubble.tsx
        ThinkingTimeline.tsx
        Composer.tsx              # textarea + + menu
        ContextChips.tsx
        RunCard.tsx
        ArtifactCard.tsx
        SourceWarning.tsx
        GoalChip.tsx
        WelcomeScreen.tsx
      run/
        ReportTab.tsx
        ResultTab.tsx
        SourcesTab.tsx
        LogsTab.tsx
        TrustPanel.tsx
      dashboard/
        RunsTable.tsx
        SourceHealthGrid.tsx
        DueReviewsList.tsx
      common/
        DataTable.tsx
        Skeleton.tsx
        ErrorBoundary.tsx

    hooks/
      useSSE.ts                   # SSE hook (reconnect, dedup, heartbeat)
      useTheme.ts                 # dark mode toggle

    stores/
      agent.ts                    # Zustand: messages, session, streaming

    i18n/
      index.ts                    # i18next init
      locales/
        zh-CN/
          common.json
          research.json
          dashboard.json
          ticker.json
          run.json
          sources.json
          reviews.json
        en-US/
          (同结构)

  tests/
    fixtures/                     # 测试数据
    api/                          # API route tests
      sessions.test.ts
      goals.test.ts
      runs.test.ts
      artifacts.test.ts
      sse.test.ts
      security.test.ts
    agent/
      loop.test.ts
    adapters/
      fixture.test.ts
    observations/
      store.test.ts
    components/
      smoke.test.tsx

  analysis/                       # runtime data (gitignored)
    stock_skills.sqlite
    artifacts/
      YYYY-MM-DD/
        run_<id>/
          report.md
          result.json
          sources.json
          input.json
          decision.json
          logs.ndjson
          sources/
            <source>_<operation>.raw.json

  scripts/                        # install/update/uninstall scripts
  docs/                           # specs + plans
```

## SQLite 数据模型

使用 Drizzle ORM 定义 schema，生成 migration SQL。以下是表结构（v1 spec 已定义，此处确认不变）。

### sessions

```text
id              TEXT PRIMARY KEY
title           TEXT
status          TEXT DEFAULT 'active'     -- active | running | waiting_for_agent | failed | archived
active_goal_id  TEXT
last_run_id     TEXT
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
archived_at     TEXT
metadata_json   TEXT
```

### messages

```text
id                TEXT PRIMARY KEY
session_id        TEXT NOT NULL REFERENCES sessions(id)
role              TEXT NOT NULL              -- user | assistant | system | tool | event
message_type      TEXT DEFAULT 'plain'       -- plain | thinking | tool_call | tool_result | run_card | artifact_card | source_warning | goal_event | error
content           TEXT NOT NULL
linked_run_id     TEXT
linked_artifact_id TEXT
created_at        TEXT DEFAULT (datetime('now'))
metadata_json     TEXT
```

### research_goals

```text
id                  TEXT PRIMARY KEY
session_id          TEXT NOT NULL REFERENCES sessions(id)
status              TEXT DEFAULT 'active'
objective           TEXT NOT NULL
ui_summary          TEXT
risk_tier           TEXT
token_budget        INTEGER
tokens_used         INTEGER DEFAULT 0
turn_budget         INTEGER
turns_used          INTEGER DEFAULT 0
time_budget_seconds INTEGER
time_used_seconds   INTEGER DEFAULT 0
created_at          TEXT DEFAULT (datetime('now'))
updated_at          TEXT DEFAULT (datetime('now'))
completed_at        TEXT
recap               TEXT
```

部分唯一索引：`(session_id)` WHERE `status IN ('active', 'paused', 'waiting_user', 'needs_refresh')`

### goal_criteria

```text
id                    TEXT PRIMARY KEY
goal_id               TEXT NOT NULL REFERENCES research_goals(id)
session_id            TEXT NOT NULL REFERENCES sessions(id)
text                  TEXT NOT NULL
required              INTEGER DEFAULT 1
status                TEXT DEFAULT 'pending'  -- pending | covered | waived | failed
freshness_requirement TEXT
protocol_step         TEXT
created_at            TEXT DEFAULT (datetime('now'))
updated_at            TEXT DEFAULT (datetime('now'))
```

### goal_evidence

```text
id                    TEXT PRIMARY KEY
goal_id               TEXT NOT NULL REFERENCES research_goals(id)
session_id            TEXT NOT NULL REFERENCES sessions(id)
criterion_id          TEXT REFERENCES goal_criteria(id)
run_id                TEXT REFERENCES runs(id)
observation_id        TEXT REFERENCES observations(id)
artifact_id           TEXT REFERENCES artifacts(id)
source_name           TEXT
source_type           TEXT
source_uri            TEXT
text                  TEXT
symbol_universe_json  TEXT
benchmark_json        TEXT
timeframe             TEXT
method                TEXT
artifact_path         TEXT
artifact_hash         TEXT
data_as_of            TEXT
freshness_status      TEXT
verification_status   TEXT
confidence            REAL
caveat                TEXT
created_at            TEXT DEFAULT (datetime('now'))
```

### runs

```text
id                TEXT PRIMARY KEY
session_id        TEXT REFERENCES sessions(id)
goal_id           TEXT REFERENCES research_goals(id)
skill_name        TEXT
ticker            TEXT
market            TEXT
intent            TEXT
workflow_type     TEXT NOT NULL       -- data_workflow | agent_workflow
execution_mode    TEXT DEFAULT 'server_direct'  -- server_direct | agent_handoff | manual_import
owner             TEXT DEFAULT 'server'         -- server | codex | web_agent | human | none
status            TEXT DEFAULT 'queued'         -- queued | running | waiting_for_agent | waiting_for_artifacts | succeeded | succeeded_with_warnings | failed | cancelled
caller            TEXT
created_at        TEXT DEFAULT (datetime('now'))
started_at        TEXT
finished_at       TEXT
error_message     TEXT
```

### artifacts

```text
id                TEXT PRIMARY KEY
run_id            TEXT NOT NULL REFERENCES runs(id)
artifact_type     TEXT NOT NULL       -- input | report | result | sources | decision | log | source_raw | export
schema_version    TEXT
content_type      TEXT
path              TEXT NOT NULL
checksum_sha256   TEXT
producer          TEXT                -- server | adapter:<name> | codex | web_agent | human_import | legacy_import
size_bytes        INTEGER
created_at        TEXT DEFAULT (datetime('now'))
updated_at        TEXT DEFAULT (datetime('now'))
```

### run_events

```text
id          TEXT PRIMARY KEY
run_id      TEXT NOT NULL REFERENCES runs(id)
event_type  TEXT NOT NULL
severity    TEXT DEFAULT 'info'     -- info | warning | error
message     TEXT
payload_json TEXT
created_at  TEXT DEFAULT (datetime('now'))
```

### session_events

```text
id            TEXT PRIMARY KEY
session_id    TEXT NOT NULL REFERENCES sessions(id)
event_type    TEXT NOT NULL
severity      TEXT DEFAULT 'info'
message       TEXT
payload_json  TEXT
created_at    TEXT DEFAULT (datetime('now'))
```

### observations

```text
id                  TEXT PRIMARY KEY
run_id              TEXT REFERENCES runs(id)
ticker              TEXT NOT NULL
market              TEXT
category            TEXT NOT NULL       -- quote | kline | technical | news | event | funding | capital_flow | order_book | options | valuation | financials | benchmark | source_health | ...
source_name         TEXT NOT NULL
observed_at         TEXT
fetched_at          TEXT DEFAULT (datetime('now'))
freshness_expires_at TEXT
status              TEXT DEFAULT 'ok'  -- ok | degraded | unavailable | not_applicable | stale | failed
payload_json        TEXT NOT NULL
raw_ref             TEXT
warnings_json       TEXT
```

### decisions

```text
id                      TEXT PRIMARY KEY
run_id                  TEXT REFERENCES runs(id)
ticker                  TEXT
rating                  TEXT            -- Buy | Overweight | Hold | Underweight | Sell
confidence              REAL
entry_price             REAL
stop_loss               REAL
target_price            REAL
position_size           TEXT
thesis_summary          TEXT
benchmark_symbol        TEXT
benchmark_currency      TEXT
decision_currency       TEXT
decision_snapshot_json  TEXT
review_due_at           TEXT
reviewed_at             TEXT
status                  TEXT DEFAULT 'pending'  -- pending | reviewed | expired
```

### lessons

```text
id                      TEXT PRIMARY KEY
ticker                  TEXT
decision_id             TEXT REFERENCES decisions(id)
review_at               TEXT
raw_return              REAL
alpha_vs_benchmark      REAL
alpha_vs_sector         REAL
benchmark_symbol        TEXT
sector_benchmark_symbol TEXT
review_price            REAL
review_currency         TEXT
calculation_method      TEXT
evidence_json           TEXT
lesson_text             TEXT
tags_json               TEXT
```

### data_sources

```text
id                    TEXT PRIMARY KEY
name                  TEXT NOT NULL UNIQUE
kind                  TEXT                -- futu | eastmoney | hyperliquid | finnhub | polymarket | tavily
enabled               INTEGER DEFAULT 1
market_coverage_json  TEXT
freshness_policy_json TEXT
health_status         TEXT DEFAULT 'unknown'  -- healthy | degraded | down | unknown
last_checked_at       TEXT
last_error            TEXT
```

## Artifact 输出合同

每个 run 至少产出：`input.json`, `report.md`, `result.json`, `sources.json`, `logs.ndjson`。
决策型 run 额外产出：`decision.json`。

Artifact ownership:
- `input.json` — server 生成
- `logs.ndjson` — server 从 run_events 生成
- `data_workflow`：server 生成全部
- `agent_workflow`：agent 提交 `report.md`, `result.json`, `sources.json`（+ `decision.json`），server 校验后落库

Canonical artifact tree：

```text
analysis/artifacts/YYYY-MM-DD/run_<id>/
  input.json
  report.md
  result.json
  sources.json
  decision.json
  logs.ndjson
  sources/
    <source>_<operation>.raw.json
```

## 数据源中间层

```text
Source Adapter → Canonical Observation → Domain View / Context
```

### Adapter interface

每个 adapter 实现：

```typescript
interface DataSourceAdapter {
  name: string;
  healthCheck(): Promise<SourceHealth>;
  fetch(request: FetchRequest): Promise<RawResponse>;
  normalize(raw: RawResponse): Observation[];
  capabilities(): string[];
  freshnessPolicy(): FreshnessPolicy;
}
```

### V1 fixture adapter

V1 先实现 `fixture` adapter，提供可测试的固定数据，不依赖 live API。测试中所有 adapter 用 fixture 替代。live adapter 在 V2 逐个实现。

### Domain Views

```typescript
interface TickerContext {
  ticker: string;
  market: string;
  latestRuns: RunSummary[];
  openDecisions: Decision[];
  dueReviews: Decision[];
  recentObservations: Observation[];
  dataGaps: DataGap[];
  sourceHealth: SourceHealth[];
}
```

## API 设计

所有 API 前缀 `/api`。

### Health

```text
GET  /api/health                           → { status, version, uptime, analysis_root }
```

### Sessions

```text
POST   /api/sessions                       → { session_id, title, status, created_at }
GET    /api/sessions                        → SessionItem[]
GET    /api/sessions/:id                    → SessionDetail
PATCH  /api/sessions/:id                    → SessionDetail
DELETE /api/sessions/:id                    → 204
POST   /api/sessions/:id/messages           → MessageItem（+ 可能触发 run）
GET    /api/sessions/:id/messages            → MessageItem[]
POST   /api/sessions/:id/cancel             → 200
```

### Goals

```text
POST   /api/sessions/:id/goal               → GoalSnapshot（旧 active goal 自动 superseded）
GET    /api/sessions/:id/goal               → GoalSnapshot | 404
PATCH  /api/sessions/:id/goal               → GoalSnapshot
POST   /api/sessions/:id/goal/evidence      → GoalEvidence
PATCH  /api/sessions/:id/goal/status        → GoalSnapshot
```

所有 mutation 请求必须带 `expected_goal_id`，防止 stale agent 写入。

### Runs

```text
POST   /api/runs                            → RunCreateResponse
GET    /api/runs                             → RunSummary[]
GET    /api/runs/:id                         → RunDetail
POST   /api/runs/:id/claim                  → RunDetail
POST   /api/runs/:id/start                  → RunDetail
POST   /api/runs/:id/request-complete        → RunDetail
POST   /api/runs/:id/fail                   → RunDetail
POST   /api/runs/:id/cancel                 → RunDetail
```

`POST /api/runs` 响应：

```json
{
  "run_id": "run_xxx",
  "status": "queued",
  "workflow_type": "data_workflow",
  "owner": "server",
  "context_url": "/api/tickers/NVDA/context",
  "artifact_submit_url": "/api/runs/run_xxx/artifacts",
  "server_generated_artifacts": ["input", "log", "report", "result", "sources"],
  "required_submitted_artifacts": []
}
```

### Artifacts

```text
POST   /api/runs/:id/artifacts              → ArtifactItem（inline body 或 multipart upload）
GET    /api/runs/:id/artifacts               → ArtifactItem[]
GET    /api/runs/:id/report                  → report.md（text/markdown）
POST   /api/uploads                          → UploadResponse
```

### Ticker Context

```text
GET    /api/tickers/:ticker/context          → TickerContext
GET    /api/tickers/:ticker/runs             → RunSummary[]
GET    /api/tickers/:ticker/decisions        → Decision[]
GET    /api/tickers/:ticker/lessons          → Lesson[]
```

### Data Sources

```text
GET    /api/data-sources/health              → DataSourceHealth[]
POST   /api/data-sources/check               → DataSourceHealth[]
```

### Reviews & Lessons

```text
GET    /api/reviews/due                      → Decision[]
POST   /api/decisions                        → Decision
PATCH  /api/decisions/:id                    → Decision
POST   /api/lessons                          → Lesson
```

### SSE

```text
GET    /api/sessions/:id/events              → text/event-stream
```

支持 `Last-Event-ID` header 和 query param。

SSE event types：

```text
message.created
text_delta
thinking_done
tool_call
tool_result
tool_progress
run.created
run.updated
artifact.created
source.warning
goal.created
goal.evidence
goal.updated
agent.claimed
agent.released
heartbeat
done
error
```

每个 event 有 stable `id`、`event`、`data`、`created_at`。
Server 保持 session-scoped replay buffer（500 events），30 秒 heartbeat。

## Web UI 设计

### 信息架构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Research Desk | 默认入口 |
| `/dashboard` | Dashboard | 第二入口 |
| `/tickers/:ticker` | Ticker Page | ticker context |
| `/runs/:runId` | Run Detail | run 详情 |
| `/data-sources` | Data Sources | source health |
| `/reviews` | Review Queue | due decisions |

### Research Desk（主页面）

布局：
- 左侧 App Shell：nav + Sessions list + dark mode toggle + 语言切换，可 collapse（240px → 48px）
- 中央 Timeline：user message、assistant answer、thinking/tool progress、run card、artifact card、source warning、goal event 混排
- 底部 Composer：多行 textarea + Enter 发送 + Shift+Enter 换行 + Stop
- Composer `+` menu：Upload、New Research Goal、Analyze、Debate、Review、Agent Workflow
- Composer 上方 Context chips：active ticker、goal progress、attachment、workflow、owner

空 session：显示示例 prompt grid（不做 hero）。

Streaming：heartbeat/tool progress 展示；90 秒无事件时提示 timeout 并允许重试。

Session list：
- 每个 session 显示 status dot（green/yellow/red）
- hover-reveal rename 和 delete
- 两步 delete（点删除 → Confirm）
- active session 高亮

### Timeline 渲染

消息分组：
- `"single"`：user、answer、error、run_card
- `"timeline"`：连续的 thinking/tool_call/tool_result → 折叠 ThinkingTimeline

合并 run events、session events、artifacts 到同一 timeline，按时间排序。

Run card 最小字段：

```text
run_id, status, skill_name, ticker, market, started_at, finished_at,
summary, metrics_json, artifact_refs[], source_warning_count
```

Tool progress payload：

```text
tool, status, stage, message, current, total, elapsed_s, run_id, source_name
```

### Run Detail

Tab 切换：Report | Result JSON | Sources | Logs | Artifacts | Trust

Trust panel：
- Schema version
- Generated at
- Data sources list
- Warnings
- Artifact checksums（SHA-256 截断显示：`first12...last6`）
- Reproducibility

### Dashboard

- 最近 runs 表格
- Running / Failed / Due Reviews / Source Health 汇总卡片
- Due Reviews 右栏
- Source Health 右栏

### Ticker Page

- Ticker header + 市场标签
- 动作按钮：Analyze / Debate / Review
- Tab：Context / Runs / Decisions / Lessons / Observations
- 最新 observations、open decision、source freshness、rating history

### Data Sources

- Source health 表格（name, kind, status, last_checked, last_error）
- Enabled toggle
- Selected source detail panel

### Review Queue

- Filter：due / upcoming / reviewed
- Decision 表格
- 选中后显示：current price, benchmark comparison, alpha, lesson editor
- 保存 lesson → decision 标记 reviewed

## SSE 客户端实现

参考 Vibe-Trading 的 `useSSE` hook 模式：

- 指数退避重连：1s → 2s → 4s → ... → 30s cap
- LRU dedup：Set + ordered array，容量 500
- Last-Event-ID resume：重连时附加 query param
- Status callback：`disconnected → connected → reconnecting`
- Connection Banner：reconnecting 时显示黄色提示条
- 90 秒安全超时：streaming 状态下 90 秒无事件 → 自动 idle + toast

## 安全和本地边界

- Server 默认只监听 `127.0.0.1`。
- 写 API 要求本地 session token。启动 server 时生成 token，输出到 stdout 和 `.env.local`。
- Origin 校验：写 API 检查 `Origin` header 必须是 `http://localhost:<port>` 或 `http://127.0.0.1:<port>`。
- CSRF：写 API 检查 `X-Requested-With: fetch` header。
- Request body size limit：默认 10MB，artifact upload 可配 50MB。
- Artifact path boundary：所有 path resolve 后必须在 analysis root 内，否则 400。
- Blocked upload types：`.exe`, `.sh`, `.py`, `.bat`, `.cmd`, `.msi`, `.dmg`, `.zip`, `.tar`, `.gz`
- SSE auth：token 通过 query param 传递（EventSource 不支持自定义 header）。

## 迁移和兼容

- 不删除旧 Claude memory，不自动迁移。
- 提供只读 import 命令，允许从旧 `trading-debate-decision-*.md` 导入 decisions/lessons。导入结果标 `producer=legacy_import`。
- 新 trading-debate output contract 要求优先写 server artifacts；旧 memory 写入仅作兼容 fallback。
- server adapter 不依赖 `~/.claude/skills` 固定路径。按以下顺序解析：`STOCK_SKILLS_ROOT` → repo root → `.claude/skills` → user-global。

## 测试策略

### 后端测试（Vitest）

- **Schema tests**：必填字段缺失报错、枚举非法报错、`freshness_expires_at` 晚于 `observed_at`、`raw_ref` 格式校验。
- **DB tests**：创建 session/message/goal/evidence/run/artifact，验证 foreign key、cascade、unique index。
- **API tests**（Next.js Route Handler 测试 via Vitest + fetch mock）：
  - `POST /api/sessions` → 201 + schema
  - `POST /api/sessions/:id/messages` → 201 + schema（触发 agent run）
  - `GET /api/sessions/:id/messages` → 200 + array
  - `POST /api/sessions/:id/goal` → 201 + schema
  - `POST /api/sessions/:id/goal/evidence` → 201 + schema
  - `PATCH /api/sessions/:id/goal/status` → 200 + schema
  - `POST /api/runs` → 201 + schema
  - `GET /api/runs/:id` → 200 + schema
  - `POST /api/runs/:id/artifacts` → 201 + schema
  - `GET /api/tickers/NVDA/context` → 200 + schema
  - `GET /api/data-sources/health` → 200 + array
  - `GET /api/reviews/due` → 200 + array
- **SSE tests**：验证 event id 存在、heartbeat 间隔、Last-Event-ID replay、dedupe-safe payload shape。
- **Security tests**：缺 token → 401、错误 Origin → 403、path traversal → 400、超大上传 → 413、非法 artifact type → 422。
- **Agent tests**：mock LLM provider → AgentLoop 执行 fixture adapter → 产出 artifacts → SSE events。
- **Observation tests**：fixture adapter raw → canonical Observation；category schema 校验。

### 前端测试（Vitest + @testing-library/react）

- smoke test：app 能启动、默认路由是 Research Desk。
- 组件测试：Composer 发送消息、Session list 渲染、Timeline 消息分组、Context chips 展示。
- SSE hook 测试：connect/disconnect/reconnect/dedupe。

### Live smoke tests

单独脚本 `scripts/check_sources.ts`，检查 Futu OpenD、Hyperliquid、Polymarket、Finnhub、Tavily。普通测试不依赖。

## 实施阶段

### Phase 0: Skills 归档 + Project bootstrap

- [x] 更新 `.gitignore`
- [ ] Skills 迁移到 `skills/` 目录（core/, stock/, futu/, crypto/ → skills/）
- [ ] Agent 定义（`skills/agents/*/`：agent.yaml + prompt.md + output-contract.json）
- [ ] Next.js 项目初始化（`package.json` + `next.config.ts` + `tsconfig.json` + `biome.json`）
- [ ] shadcn/ui + Tailwind 4 初始化
- [ ] 能跑 `pnpm dev`，server + web 在同一进程 `:3000`

### Phase 1: Foundation

- [ ] Drizzle schema + migration（所有表）
- [ ] SQLite instance + db/index.ts
- [ ] analysis root 配置
- [ ] Artifact writer（path boundary + checksum）
- [ ] Local token + Origin/CSRF middleware
- [ ] upload-guard
- [ ] Health endpoint（`/api/health`）

### Phase 2: Adapters + Observations

- [ ] Adapter interface + AdapterRegistry
- [ ] Fixture adapter（可测试固定数据）
- [ ] Futu adapter stub
- [ ] Observation schemas + store + freshness policy

### Phase 3: REST API + SSE

- [ ] Sessions + Messages API（Next.js Route Handlers）
- [ ] Goals + criteria + evidence API
- [ ] Runs lifecycle API
- [ ] Artifacts API
- [ ] Ticker context + Data sources + Reviews API
- [ ] SSE event stream（Next.js ReadableStream + EventBus）
- [ ] Wire all routes + integration tests

### Phase 4: Agent Layer

- [ ] LLM provider（Anthropic SDK）
- [ ] Skill loader + Context builder
- [ ] Tool registry（adapter tools + system tools）
- [ ] AgentLoop（ReAct pattern + SSE streaming）
- [ ] Wire Agent into POST /messages handler
- [ ] Progress coalescing + safety timeout

### Phase 5: Web UI

- [ ] App Shell + Sidebar + Connection Banner
- [ ] i18n 初始化 + CSS variable 双主题
- [ ] Research Desk（timeline + composer + context chips）
- [ ] SSE hook + Agent store（Zustand）
- [ ] Message components + Welcome Screen
- [ ] Run Detail（tabs + trust panel）
- [ ] Dashboard + Ticker Page + Data Sources + Review Queue
- [ ] i18n namespace 补全

### Phase 6: Skill integration

- [ ] Output Contract docs for core skills
- [ ] sidecar JSON 要求

## 验收标准

1. 能启动全栈（`pnpm dev`），server + web 在同一进程 `:3000`。
2. 默认入口 `/` 是 Research Desk。
3. 能创建 session、发送 message、agent 自动执行、刷新后仍能看到 session timeline。
4. 能创建 research goal、追加 evidence、展示 criteria/evidence progress。
5. 能创建 run，并写 SQLite 与 artifacts。
6. POST /messages 自动触发内置 AgentLoop 推理。
7. 能从 fixture source 生成 Observation。
8. 能通过 API 查询 ticker context。
9. Research Desk 能展示 session list、timeline、context chips、tool progress 和 run card。
10. SSE 能推送 run/tool/goal/artifact 事件；断线重连能通过 Last-Event-ID 恢复。
11. Run Detail 能展示 Report / Result JSON / Sources / Logs，并展示 trust panel + artifact checksum。
12. 安全测试覆盖缺 token、错误 Origin、path traversal、超大 artifact、非法 artifact type。
13. `/analysis/`、`.next/`、`node_modules/` 已加入 `.gitignore`。
14. Light/Dark 主题可通过 sidebar toggle 切换。
15. 中英文可通过 sidebar 语言切换器切换，UI chrome 文本均走 i18n。
16. Dark 主题下所有文字对比度 ≥ 4.5:1（WCAG AA）。
