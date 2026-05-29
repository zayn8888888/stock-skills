# Research Runtime 设计规格

日期：2026-05-30

## 背景

当前仓库是一个股票、加密、富途生态的 skill 套件。它的主要问题不是单个 skill 的分析框架不足，而是缺少统一运行时：

- skill 没有稳定状态，下一轮不能可靠召回历史分析。
- 分析完成后主要返回 Markdown，不会自动保存结构化结果。
- 数据源规则分散在各 skill 中，Futu、Eastmoney、Hyperliquid、Finnhub、Polymarket、Tavily 的格式、时效、降级和 provenance 没有统一合同。
- `trading-debate` 已经有 reflection 和历史召回的意图，但目前依赖外部 Claude memory 路径，不是项目本地、可审计、可迁移的状态层。

本设计把仓库从“prompt/skill 文档集合”升级为本机单用户的 Research Runtime。它仍然保留现有 skills 的研究方法，但把执行、状态、数据源、结果保存、召回和 Web 工作台交给一个本地 server。

## 目标

1. 本机单用户研究台
   - 默认监听 `127.0.0.1`。
   - 数据存放在项目本地或用户指定的本地目录。
   - 不引入多用户登录、云同步、权限隔离。

2. Server + Web
   - FastAPI server 负责 run lifecycle、数据源适配、SQLite 索引、artifacts 保存、召回和复盘队列。
   - Web UI 负责人类工作台：启动分析、查看历史、检查数据源、浏览 artifact、处理复盘。

3. Agent-ready
   - Codex、未来 web agent、CLI、Web UI 都通过同一套 API 读写状态。
   - 不让 agent 直接扫 SQLite 或直接写散落文件。

4. Markdown + structured sidecar
   - Markdown report 继续作为人类阅读层。
   - JSON sidecars 作为机器状态层，供 Web、SQLite 索引、agent 召回、复盘和图表使用。

5. 数据源中间层
   - 原始数据完整保存。
   - 统一归一化为 Canonical Observation。
   - 上层只消费 Domain View，不直接耦合某个数据源的原始字段。

## 非目标

- 第一版不实现商业级多用户权限。
- 第一版不把所有 skill prompt 逻辑完整搬进 server。
- 第一版不要求所有历史 skill 一次性重写成纯 JSON 输出。
- 第一版不做实盘下单或交易执行。
- 第一版不依赖 live API 才能跑单元测试。

## 推荐方案

评估过三条路线：

1. 轻量归档服务
   - 只保存 Markdown 和索引。
   - 优点是快，缺点是不能统一执行，也不能稳定驱动 Web 工作台。

2. 本地调度 Runtime
   - FastAPI server 负责创建 run、调用现有脚本和 adapters、保存 artifacts、写 SQLite、提供 Web/API。
   - 这是第一版推荐方案。

3. 完整 Agent Orchestrator
   - server 内置多 agent 辩论、任务队列、浏览器 agent 接口和完整推理编排。
   - 长期方向可取，但第一版太大。

本设计选择方案 2，并为方案 3 留接口。

## 系统边界

```text
skills / Codex / web agent / Web UI
        ↓
Local FastAPI Server
        ↓
SQLite index + Markdown/JSON artifacts
        ↓
Data source adapters + existing scripts
```

Server 负责：

- 创建和管理 run。
- 调用数据源 adapters 或现有脚本。
- 写入 raw artifacts、normalized observations、reports、decisions、lessons。
- 提供 ticker context、source health、review due queue。

Skills 负责：

- 研究方法和分析框架。
- 例如 stock-analyzer 的九维分析、market-scanner 的漏斗、trading-debate 的角色流程。
- 第一版不要求把全部 prompt 推理逻辑搬进 server。

Web UI 负责：

- 启动分析和复盘。
- 查看 run、ticker context、source health、artifacts。
- 编辑 lesson、标记 decision reviewed。

Agent 负责：

- 对 agent_workflow 执行推理。
- 使用 server API 读取 context。
- 通过 server API 写回 report、result JSON、sources JSON、decision 和 lesson。

## 目录结构

```text
server/
  api/
  runtime/
  adapters/
    futu/
    eastmoney/
    hyperliquid/
    finnhub/
    polymarket/
    tavily/
  observations/
    schemas.py
    normalizer.py
    freshness.py
  artifacts/
  db/
  agent_contracts/

web/
  src/

analysis/
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
          futu_snapshot.raw.json
          hyperliquid_lookup.raw.json
```

`analysis/` 是运行数据目录，不应默认提交入 git。设计文档中的 Web 概念图已提交到：

```text
docs/superpowers/specs/assets/2026-05-30-research-runtime/
```

实现前必须确保本 spec 和 `docs/superpowers/specs/assets/2026-05-30-research-runtime/*.png` 已被 git 跟踪，或者在新 implementation worktree 中显式复制。否则前端实现会丢失视觉规格。

## SQLite 数据模型

SQLite 做索引、状态和可检索字段。完整大文本和原始数据留在 artifacts。

### runs

```text
id
skill_name
ticker
market
intent
workflow_type
execution_mode
owner
status
caller
created_at
started_at
finished_at
error_message
```

`workflow_type`：

```text
data_workflow
agent_workflow
```

`execution_mode`：

```text
server_direct
agent_handoff
manual_import
```

`owner` 标识当前责任方：

```text
server
codex
web_agent
human
none
```

`status`：

```text
queued
running
waiting_for_agent
waiting_for_artifacts
succeeded
succeeded_with_warnings
failed
cancelled
```

`runs` 不保存固定 artifact path 列。所有 artifacts 由 `artifacts` 表管理，避免 API 支持多 artifact 但 DB 只能放固定几列。

### artifacts

```text
id
run_id
artifact_type
schema_version
content_type
path
checksum_sha256
producer
size_bytes
created_at
updated_at
```

`artifact_type` 初始集合：

```text
input
report
result
sources
decision
log
source_raw
export
```

`producer`：

```text
server
adapter:<name>
codex
web_agent
human_import
legacy_import
```

### run_events

```text
id
run_id
event_type
severity
message
payload_json
created_at
```

用于 Run Detail 的 Logs tab，也用于记录状态变迁、adapter 调用、agent handoff、artifact 写入、warning 和 error。`run_events` 是追加式，不覆盖历史。

### observations

```text
id
run_id
ticker
market
category
source_name
observed_at
fetched_at
freshness_expires_at
status
payload_json
raw_ref
warnings_json
```

`status`：

```text
ok
degraded
unavailable
not_applicable
stale
failed
```

`category` 初始集合：

```text
quote
kline
technical
technical_anomaly
news
sentiment
digest
event
funding
capital_flow
capital_distribution
order_book
options
derivative_anomaly
valuation
financials
company_profile
corporate_actions
peers
sector
benchmark
relative_strength
source_health
```

V1 必须为以下 category 定义最小 `value` schema：

```text
quote: last_price, change_pct, volume, turnover, currency
kline: timeframe, bars[]
technical: indicators{}, trend_summary
news: items[] with title, url, published_at, source
event: items[] with event_date, event_type, source_url
funding: funding_apr_now, funding_24h_avg, oi_notional_usd, premium_bp
capital_flow: period, net_inflow, currency
order_book: bid_levels[], ask_levels[], observed_depth
options: expiries[], chain_summary, iv_summary
valuation: pe, pb, ps, market_cap, currency
financials: period, metrics{}
benchmark: benchmark_symbol, return_pct, window
source_health: health_status, latency_ms, checked_at
```

其它 category 可以先以 `payload_json` 保存，但必须带 `schema_version` 和 `raw_ref`，不能只塞无法解释的字符串。

### decisions

```text
id
run_id
ticker
rating
confidence
entry_price
stop_loss
target_price
position_size
thesis_summary
benchmark_symbol
benchmark_currency
decision_currency
decision_snapshot_json
review_due_at
reviewed_at
status
```

`rating` 对 trading-debate 保持五档：

```text
Buy
Overweight
Hold
Underweight
Sell
```

### lessons

```text
id
ticker
decision_id
review_at
raw_return
alpha_vs_benchmark
alpha_vs_sector
benchmark_symbol
sector_benchmark_symbol
review_price
review_currency
calculation_method
evidence_json
lesson_text
tags_json
```

### data_sources

```text
id
name
kind
enabled
market_coverage_json
freshness_policy_json
health_status
last_checked_at
last_error
```

## Artifact 输出合同

每个 run 至少产出：

```text
report.md
result.json
sources.json
input.json
logs.ndjson
```

决策型 run 额外产出：

```text
decision.json
```

Artifact ownership:

- `input.json` is always generated by server when the run is created.
- `logs.ndjson` is always generated by server from `run_events`; callers never need to upload it.
- For `data_workflow`, server generates `report.md`, `result.json`, `sources.json`, and optional `decision.json`.
- For `agent_workflow`, agent submits `report.md`, `result.json`, `sources.json`, and `decision.json` when applicable. Server validates them, writes or updates `logs.ndjson`, and then decides terminal status.

### report.md

人类阅读的完整报告。Web Run Detail 的 Report tab 渲染它。

### result.json

结构化结论和关键字段。它不是数据源原始响应；数据源原始响应放在 `sources/*.raw.json`。例：

```json
{
  "ticker": "NVDA",
  "market": "US",
  "skill_name": "stock-analyzer",
  "data_timestamp": "2026-05-30T01:20:00+08:00",
  "summary": {
    "stance": "neutral_bullish",
    "confidence": 68,
    "key_points": [
      "price above MA200",
      "funding elevated",
      "options stale"
    ]
  },
  "data_gaps": [
    {
      "category": "options",
      "reason": "chain beyond 60D unavailable"
    }
  ]
}
```

### sources.json

数据源 provenance、freshness、错误、fallback 和 raw refs。它是审计真相。

```json
{
  "run_id": "run_x",
  "sources": [
    {
      "source": "futu",
      "operation": "quote.snapshot",
      "status": "ok",
      "latency_ms": 122,
      "observed_at": "2026-05-30T01:18:00+08:00",
      "fetched_at": "2026-05-30T01:18:04+08:00",
      "freshness_expires_at": "2026-05-30T05:18:00+08:00",
      "raw_ref": "analysis/artifacts/2026-05-30/run_x/sources/futu_snapshot.raw.json"
    }
  ],
  "gaps": []
}
```

### decision.json

`trading-debate` 等决策型 workflow 使用。

```json
{
  "ticker": "NVDA",
  "rating": "Overweight",
  "confidence": 72,
  "entry_price": 1120.4,
  "stop_loss": 1045,
  "target_price": 1280,
  "position_size": "medium",
  "review_due_at": "2026-08-30",
  "review_anchors": [
    "data center revenue growth",
    "gross margin trend",
    "China export impact"
  ]
}
```

### Canonical artifact tree

V1 只使用一种 artifact 目录形态：

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

`result.json` 存结构化分析结果；`sources/*.raw.json` 存各数据源原始响应；`sources.json` 存 provenance、freshness、errors、gaps 和 raw refs。旧文档或对话里的 `raw.json` 仅作为早期简称，不进入 V1 合同。

## 数据源中间层

不同数据源格式不一致，因此必须有中间层。

```text
Source Adapter
  ↓
Canonical Observation
  ↓
Domain View / Context
```

### Raw Layer

原始响应完整保存，不做字段丢弃：

```text
analysis/artifacts/YYYY-MM-DD/run_<id>/sources/futu_snapshot.raw.json
analysis/artifacts/YYYY-MM-DD/run_<id>/sources/hyperliquid_lookup.raw.json
analysis/artifacts/YYYY-MM-DD/run_<id>/sources/tavily_news.raw.json
```

### Canonical Observation

统一外层字段，`value` 按 category 使用不同 schema：

```json
{
  "ticker": "NVDA",
  "market": "US",
  "category": "quote",
  "source": "futu",
  "observed_at": "2026-05-30T01:18:00+08:00",
  "fetched_at": "2026-05-30T01:18:04+08:00",
  "freshness_expires_at": "2026-05-30T05:18:00+08:00",
  "unit": "USD",
  "status": "ok",
  "value": {
    "last_price": 1037.89,
    "change_pct": 1.86,
    "volume": 44210000
  },
  "raw_ref": "analysis/artifacts/2026-05-30/run_x/sources/futu_snapshot.raw.json"
}
```

### Adapter interface

每个 adapter 实现：

```python
health_check()
fetch(request)
normalize(raw_response) -> list[Observation]
capabilities()
freshness_policy()
```

### Domain Views

上层 Web 和 agent 不直接读原始 Futu、Hyperliquid、Tavily 字段，而读：

```text
TickerContext
RunSummary
SourceHealth
DecisionContext
ReviewContext
```

`TickerContext` 由以下内容组合：

```text
latest successful runs
unexpired observations
open decisions
due reviews
lessons tagged with same ticker / sector / strategy
data gaps and stale fields
```

## Workflow 类型

### data_workflow

Server 可以直接执行：

- source health checks
- Futu snapshot / kline / capital flow / options
- Hyperliquid lookup
- Polymarket/Finnhub/Tavily event data
- artifact 写入和 SQLite 索引

### agent_workflow

Server 创建 run 和 context，agent 执行推理后写回：

- trading-debate 多角色辩论
- 复杂 narrative synthesis
- 人类批准后的 lesson 编辑

第一版中，`trading-debate` 不强制完全搬进 server。server 先提供 context assembly、数据源快照、历史决策召回、artifact 保存、decision/review/lesson 结构化写入。后续再实现 debate worker。

## Run lifecycle 和责任归属

### data_workflow lifecycle

```text
queued
  -> running
  -> succeeded | succeeded_with_warnings | failed | cancelled
```

Server 拥有从 queued 到 terminal state 的全流程。Server 必须写 `run_events` 记录状态变迁、adapter 调用、artifact 写入和错误。

### agent_workflow lifecycle

```text
queued
  -> waiting_for_agent
  -> running
  -> waiting_for_artifacts
  -> succeeded | succeeded_with_warnings | failed | cancelled
```

责任规则：

- `queued`: server 创建 run。
- `waiting_for_agent`: server 已准备 context，等待 Codex/web_agent 接手。
- `running`: agent 已声明开始执行。
- `waiting_for_artifacts`: agent 完成推理，正在提交 artifacts 或 server 正在校验 artifacts。
- terminal state: server 校验必需 artifacts 后落库。

`POST /api/runs` 对 `agent_workflow` 返回 `run_id`、`context_url`、`artifact_submit_url`、`server_generated_artifacts` 和 `required_submitted_artifacts`。agent 必须在写回时声明 producer，并提交 `required_submitted_artifacts` 中列出的 artifact。

Server 是唯一 terminal-state 裁决者。Agent 可以请求完成，但不能直接把 run 标为 succeeded。

Agent ownership transitions use explicit API calls:

```text
POST /api/runs/{run_id}/claim
POST /api/runs/{run_id}/start
POST /api/runs/{run_id}/request-complete
POST /api/runs/{run_id}/fail
```

- `claim`: moves `waiting_for_agent -> waiting_for_agent` while setting `owner=codex|web_agent|human` and recording the claimant. A claimed run cannot be claimed by another owner unless cancelled or released.
- `start`: moves `waiting_for_agent -> running`.
- `request-complete`: moves `running -> waiting_for_artifacts` and asks server to validate required submitted artifacts.
- `fail`: moves the run to `failed` with an agent-provided error message, after server records a `run_events` entry.

Artifact submission alone does not change terminal state. It may be accepted while the run is `running` or `waiting_for_artifacts`, but only `request-complete` triggers completeness validation.

## API 设计

### Health and sources

```text
GET  /api/health
GET  /api/data-sources/health
POST /api/data-sources/check
```

### Runs

```text
POST /api/runs
GET  /api/runs
GET  /api/runs/{run_id}
POST /api/runs/{run_id}/claim
POST /api/runs/{run_id}/start
POST /api/runs/{run_id}/request-complete
POST /api/runs/{run_id}/fail
POST /api/runs/{run_id}/cancel
```

创建 run 示例：

```json
{
  "skill_name": "stock-analyzer",
  "ticker": "NVDA",
  "market": "US",
  "intent": "full_analysis",
  "workflow_type": "data_workflow",
  "execution_mode": "server_direct",
  "caller": "web"
}
```

`POST /api/runs` 响应必须包含：

```json
{
  "run_id": "run_abc123",
  "status": "queued",
  "workflow_type": "data_workflow",
  "owner": "server",
  "context_url": "/api/tickers/NVDA/context",
  "artifact_submit_url": "/api/runs/run_abc123/artifacts",
  "server_generated_artifacts": ["input", "log", "report", "result", "sources"],
  "required_submitted_artifacts": []
}
```

For `data_workflow`, `required_submitted_artifacts` is empty because server generates all artifacts. For `agent_workflow`, `required_submitted_artifacts` is `["report", "result", "sources"]`; for decision agent workflows it also includes `decision`.

### Ticker context

```text
GET /api/tickers/{ticker}/context
GET /api/tickers/{ticker}/runs
GET /api/tickers/{ticker}/decisions
GET /api/tickers/{ticker}/lessons
```

`context` 是 agent 和 Web 的主要召回入口。

### Artifacts

```text
POST /api/runs/{run_id}/artifacts
GET  /api/runs/{run_id}/artifacts
GET  /api/runs/{run_id}/report
```

Artifact submit payload supports metadata plus either inline text/JSON for small artifacts or multipart upload for larger files:

```json
{
  "artifact_type": "result",
  "schema_version": "1.0",
  "content_type": "application/json",
  "producer": "codex",
  "body": {}
}
```

Server validates artifact type, schema version, path boundaries, request size, checksum, and required artifact completeness before moving a run to terminal state.

### Reviews and lessons

```text
GET   /api/reviews/due
POST  /api/decisions
PATCH /api/decisions/{decision_id}
POST  /api/lessons
```

## Web UI 设计

使用 `frontend-app-builder` 生成的概念图作为第一版视觉规格。界面是工作台，不是营销页。

视觉原则：

- true white 或 very light neutral 背景。
- charcoal 文本。
- teal 用于主操作和 ready/succeeded。
- amber 用于 due/degraded/warnings。
- red 用于 failed/negative。
- 6-8px radius。
- table-first，避免嵌套卡片。
- 不使用 hero、装饰 orb、紫蓝渐变、beige/cream 主色。

页面：

1. Dashboard
   - 最近 runs。
   - Running/Failed/Due Reviews/Source Health 汇总。
   - Due Reviews 和 Source Health 右栏。
   - Run throughput 和 recent lessons。

2. Ticker Page
   - ticker header。
   - Analyze / Debate / Review 动作。
   - Context/Runs/Decisions/Lessons/Observations tabs。
   - latest successful runs、recent observations、open decision、source freshness、rating history。

3. Run Detail
   - report/result JSON/sources/logs tabs。
   - artifact list。
   - source provenance。
   - errors/warnings。

4. Data Sources
   - source health table。
   - enabled toggles。
   - selected source detail。
   - source catalog 和 recent checks。

5. Review Queue
   - due/upcoming/reviewed filters。
   - decision table。
   - selected decision detail。
   - current price, benchmark comparison, alpha, lesson editor。

Concept assets:

```text
assets/2026-05-30-research-runtime/dashboard.png
assets/2026-05-30-research-runtime/ticker-page.png
assets/2026-05-30-research-runtime/run-detail.png
assets/2026-05-30-research-runtime/data-sources.png
assets/2026-05-30-research-runtime/review-queue.png
```

## 错误处理和降级

系统区分三层状态：

```text
Source status
Observation status
Run status
```

错误分级：

```text
blocking
degraded
unavailable
stale
```

### blocking

缺少 workflow 必需数据，run 必须失败。

例：

- stock-analyzer 无法获取 Futu snapshot。
- ticker 格式错误。
- OpenD 不可达。

### degraded

可以 fallback 或缺少一个非阻断来源。

例：

- Finnhub 失败，但 event-calendar 仍可跑 Polymarket + Tavily。

### unavailable

数据源响应成功，但该市场或标的不适用。

例：

- A 股没有期权。
- 港股非 BABA 标的没有有效 Hyperliquid 镜像。

### stale

有旧数据，但超过 freshness。可展示，不可默认为 fresh。

统一错误结构：

```json
{
  "source": "futu",
  "operation": "quote.snapshot",
  "status": "failed",
  "severity": "blocking",
  "error_code": "OPEND_UNREACHABLE",
  "message": "Cannot connect to 127.0.0.1:11111",
  "retryable": true,
  "fallback_used": null
}
```

## Freshness 规则

第一版默认：

```text
quote: 4h during session, 1 trading day outside session
kline: 1h intraday, 1 trading day daily
news: 24h
event calendar: 24h
funding: 1h
options: 24h, shorter near earnings if configured
source health: 5m for UI display
```

Freshness policy 存在 `data_sources.freshness_policy_json`，adapter 可覆盖。

## 安全和本地边界

- Server 默认只监听 `127.0.0.1`。
- 第一版不开放公网部署。
- 不在 Web UI 展示 API key。
- 写 API 必须要求本地 session token。启动 server 时生成 token，Web 通过本地启动页或环境注入获取；CLI/agent 通过显式配置获取。
- 对所有写 API 做 Origin 校验和 CSRF 防护。
- 设置 request body size limit，尤其是 artifact upload。
- Artifacts 路径必须限制在 configured analysis root 内，避免任意文件写入。
- artifact path 必须经 `resolve()` 后验证仍在 analysis root 内。
- 安全测试必须覆盖 path traversal、超大请求、缺 token、错误 Origin 和非法 artifact type。

## 迁移和兼容

现有 skills 仍有两类旧路径/状态假设：

1. `trading-debate` 的历史 reflection 写入 Claude memory。
2. 多个 stock skills 文档示例使用 `~/.claude/skills/futuapi/scripts/...` 调脚本。

V1 兼容策略：

- 不删除旧 memory，也不自动迁移未验证内容。
- 提供只读 import 命令或 API，允许用户从旧 `trading-debate-decision-*.md` 导入 decisions/lessons。导入结果必须标 `producer=legacy_import`，并保留原始 markdown artifact。
- 新的 `trading-debate` Output Contract 要求优先写 server artifacts 和 decisions；旧 Claude memory 写入仅作为兼容 fallback，不作为主状态。
- server adapter 不依赖 `~/.claude/skills` 固定路径。它按以下顺序解析脚本根：`STOCK_SKILLS_ROOT`、当前 repo root、project-local `.claude/skills` symlink、user-global skill path。
- skill 文档后续要把示例命令从固定 `~/.claude/skills/...` 更新为“通过 server adapter 或已解析脚本路径执行”。

## 测试策略

### Schema tests

- 必填字段缺失会报错。
- category/status 枚举非法会报错。
- `freshness_expires_at` 必须晚于 `observed_at`。
- `raw_ref` 必须指向 artifact 文件。

### Adapter normalize tests

为每个数据源建立 fixtures：

```text
tests/fixtures/futu_snapshot.json
tests/fixtures/hyperliquid_lookup.json
tests/fixtures/polymarket_markets.json
```

测试：

- raw -> canonical Observation。
- 错误响应 -> unified SourceError。
- 空结果 -> unavailable/degraded，不许静默成功。

### Runtime and artifact tests

- 创建 fake run。
- SQLite 写入 run。
- 写 `report.md/result.json/sources.json/input.json/logs.ndjson`。
- 验证 `input.json` 和 `logs.ndjson` 由 server 生成，agent workflow 只需提交 `report/result/sources/decision`。
- observations 入库。
- 状态从 queued -> running -> succeeded_with_warnings。
- agent workflow 状态从 waiting_for_agent -> running -> waiting_for_artifacts -> succeeded。
- failed run 保存 error_message 和 source error。

### API tests

使用 FastAPI test client 验证：

```text
POST /api/runs
GET /api/runs/{id}
GET /api/tickers/NVDA/context
GET /api/data-sources/health
GET /api/reviews/due
POST /api/lessons
```

重点验证 response schema，而不是只看 HTTP 200。

### Web UI tests

- Dashboard 渲染 recent runs / due reviews / source health。
- Ticker Page 渲染 context / observations / decisions / lessons。
- Run Detail 切换 Report / Result JSON / Sources / Logs。
- Review Queue 选择 decision，编辑 lesson，保存。
- Data Sources 切换 filters，显示 degraded reason。
- 桌面和移动宽度不能溢出，按钮和表格文字不能重叠。

### Live smoke tests

单独脚本：

```text
scripts/check_sources.py
```

检查：

- Futu OpenD。
- Hyperliquid。
- Polymarket。
- Finnhub key。
- Tavily 配置。

普通单元测试不依赖 live source。

## V1 implementation decisions

- 默认 analysis root 是 `<repo>/analysis`，可用 `STOCK_SKILLS_ANALYSIS_ROOT` 覆盖。
- Server 启动时创建 analysis root；所有 artifact path 必须保持在 analysis root 内。
- V1 将 `trading-debate` 视为 `agent_workflow`，不实现 in-process debate worker。
- Markdown fallback 在 V1 只保存，不弱解析为 decisions 或 observations。
- Web V1 面向 desktop/tablet；窄屏必须不溢出，但不要求专门移动端工作流。
- V1 使用 `result.json` 表示结构化结果，使用 `sources/*.raw.json` 表示原始数据源响应。
- V1 必须在 Phase 0 把 `/analysis/` 加入 `.gitignore`，避免运行数据被提交。

## 实施阶段

### Phase 0: Project bootstrap

- Add root `pyproject.toml` for FastAPI server, tests, linting, and dev commands.
- Create importable Python package boundaries for `server/` and `tests/fixtures/`.
- Add `.gitignore` entries for `/analysis/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, and Web build output.
- Do not assume a root Node project. Create `web/package.json`, `web/vite.config.ts`, and `web/tsconfig.json` as the first step of Phase 4.
- Define canonical commands for server tests, API test client runs, Web dev server, and Web tests.

### Phase 1: Foundation

- SQLite schema 和 migration。
- Artifact writer。
- Observation schema。
- SourceError schema。
- analysis root 配置。
- `artifacts` 和 `run_events` 表。
- Local session token、Origin/CSRF 检查、artifact path boundary check。

### Phase 2: Adapters

- Futu health + snapshot/kline normalization。
- Hyperliquid lookup normalization。
- Polymarket/Finnhub/Tavily health stubs 和 fixtures。
- Freshness policy。

### Phase 3: Runtime API

- runs API。
- artifacts API。
- ticker context API。
- source health API。
- reviews/lessons API。
- agent_workflow handoff API 和 terminal-state validation。

### Phase 4: Web UI

- React + Vite app。
- App shell。
- Dashboard。
- Ticker Page。
- Run Detail。
- Data Sources。
- Review Queue。

### Phase 5: Skill integration

- 为现有 skills 增加 Output Contract 说明。
- 对 `stock-analyzer`、`market-scanner`、`trading-debate` 优先加入 sidecar JSON 要求。
- 保留 Markdown fallback，但不作为长期主路径。

### Phase 6: Agent workflow

- `GET /api/tickers/{ticker}/context` 用于分析前召回。
- `POST /api/runs/{run_id}/artifacts` 用于 agent 写回。
- `POST /api/decisions` 和 `POST /api/lessons` 用于 decision/review 闭环。

## 验收标准

- 能启动本地 server。
- 能创建 run，并写 SQLite 与 artifacts。
- 能从至少一个 live 或 fixture source 生成 Observation。
- 能通过 API 查询 ticker context。
- Web Dashboard 能展示 runs、source health、due reviews。
- Ticker Page 能展示 context、observations、open decisions、lessons、source freshness，并能触发 Analyze/Debate/Review 动作。
- Run Detail 能展示 Markdown report 和 sources provenance。
- Run Detail 能切换 Report / Result JSON / Sources / Logs，并展示 artifact list 和 source warnings。
- Data Sources 能展示 enabled toggles、health check、degraded reason、selected source detail。
- Review Queue 能保存 lesson。
- Review Queue 能展示 benchmark/current price/alpha 计算证据，保存 lesson 后 decision 可标记 reviewed。
- run cancellation、agent handoff、artifact upload validation 都有 API tests。
- 安全测试覆盖缺 token、错误 Origin、path traversal、超大 artifact、非法 artifact type。
- `/analysis/`、`.venv/`、`.pytest_cache/`、Web build output 已加入 `.gitignore`。
- 缺失数据和 source degradation 在 `sources.json`、SQLite、Web 三处一致可见。
