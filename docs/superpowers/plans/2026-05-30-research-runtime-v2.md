# Research Runtime v2 — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local single-user stock research runtime with TypeScript full-stack (Hono server with built-in LLM agent + React web desk), SQLite persistence, SSE streaming, and i18n/dark-mode support.

**Architecture:** pnpm monorepo with three packages (`shared/`, `server/`, `web/`) plus a `skills/` directory for skill content and agent definitions. Server is Hono + Drizzle ORM + better-sqlite3 + built-in AgentLoop (ReAct pattern, LLM-powered). When a user sends a message, the server creates a run, starts the AgentLoop, and streams results back via SSE — no external agent handoff needed. Data flows through a unified adapter layer (Adapter → raw artifact + canonical Observation → SQLite), and agents consume Domain Views (TickerContext) rather than calling external APIs directly.

**Tech Stack:** Hono, Drizzle ORM, better-sqlite3, Zod, Vercel AI SDK (LLM provider), React 19, Vite 6, Tailwind CSS 4, shadcn/ui, Zustand 5, react-i18next, Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-05-30-research-runtime-v2-design.md`

---

## File Structure

### Root Config

| File | Responsibility |
|------|---------------|
| `pnpm-workspace.yaml` | Monorepo workspace definition |
| `package.json` | Root scripts: dev, test, lint, build |
| `tsconfig.base.json` | Shared TS config (strict, ES2022) |
| `biome.json` | Lint + format rules |
| `.gitignore` | Already updated |

### `skills/` — Skill content + Agent definitions

| File | Responsibility |
|------|---------------|
| `skills/README.md` | Skills overview |
| `skills/agents/stock-analyzer/agent.yaml` | Agent config: workflow_type, required_artifacts, skills[] |
| `skills/agents/stock-analyzer/prompt.md` | System prompt template |
| `skills/agents/stock-analyzer/output-contract.json` | result.json JSON Schema |
| `skills/agents/market-scanner/` | (同结构) |
| `skills/agents/event-calendar/` | (同结构) |
| `skills/agents/trading-debate/` | (同结构) |
| `skills/agents/crypto-research/` | (同结构) |
| `skills/agents/portfolio-review/` | (同结构) |
| `skills/core/` | 现有 core/ skills（trading-debate, event-calendar, hyperliquid-perps） |
| `skills/stock/` | 现有 stock/ skills |
| `skills/futu/` | 现有 futu/ skills |
| `skills/crypto/` | 现有 crypto/ skills |

### `shared/` — Cross-package types and schemas

| File | Responsibility |
|------|---------------|
| `shared/src/constants.ts` | All enum values as const objects |
| `shared/src/types.ts` | TypeScript interfaces for all 14 tables + domain views |
| `shared/src/schemas.ts` | Zod schemas for API request/response validation |

### `server/` — Hono API server with built-in Agent

| File | Responsibility |
|------|---------------|
| `server/src/index.ts` | CLI entry |
| `server/src/config.ts` | Config: analysis root, token, host, port, LLM provider, API keys |
| `server/src/app.ts` | Hono app assembly |
| **DB** | |
| `server/src/db/schema.ts` | Drizzle schema (14 tables) |
| `server/src/db/index.ts` | DB instance + migration runner |
| `server/src/db/migrations/` | SQL migration files |
| **Auth** | |
| `server/src/auth/token.ts` | Generate/load local session token |
| `server/src/auth/middleware.ts` | Origin, CSRF, token check |
| `server/src/auth/upload-guard.ts` | Size, path, type validation |
| **Runtime** | |
| `server/src/runtime/event-bus.ts` | Session-scoped SSE event bus (500 buffer, heartbeat) |
| `server/src/runtime/artifact-writer.ts` | Path boundary + checksum + schema version |
| `server/src/runtime/run-manager.ts` | Run lifecycle state machine |
| `server/src/runtime/goal-manager.ts` | Single active goal per session |
| **Agent** | ← 核心新增 |
| `server/src/agent/llm-provider.ts` | LLM abstraction: Claude API / OpenAI API / local |
| `server/src/agent/loop.ts` | ReAct loop: LLM call → tool call → repeat |
| `server/src/agent/tools.ts` | ToolRegistry: register adapter tools + system tools |
| `server/src/agent/context.ts` | ContextBuilder: session history + goal + ticker context |
| `server/src/agent/skill-loader.ts` | Load agent prompt from skills/agents/*/prompt.md |
| `server/src/agent/progress.ts` | HeartbeatTimer + ProgressEvent emitter |
| **Data Layer** | |
| `server/src/adapters/registry.ts` | AdapterRegistry: register/lookup/health check |
| `server/src/adapters/base.ts` | DataSourceAdapter interface |
| `server/src/adapters/futu/index.ts` | FutuAdapter |
| `server/src/adapters/eastmoney/index.ts` | EastmoneyAdapter |
| `server/src/adapters/hyperliquid/index.ts` | HyperliquidAdapter |
| `server/src/adapters/finnhub/index.ts` | FinnhubAdapter |
| `server/src/adapters/polymarket/index.ts` | PolymarketAdapter |
| `server/src/adapters/tavily/index.ts` | TavilyAdapter |
| `server/src/adapters/coingecko/index.ts` | CoinGeckoAdapter |
| `server/src/adapters/fixture/index.ts` | FixtureAdapter (testing) |
| `server/src/observations/schemas.ts` | Category value schemas (Zod) |
| `server/src/observations/store.ts` | Observation CRUD (SQLite) |
| `server/src/observations/freshness.ts` | Freshness policy |
| `server/src/views/ticker-context.ts` | TickerContext builder (SQLite query) |
| **API** | |
| `server/src/api/health.ts` | GET /api/health |
| `server/src/api/sessions.ts` | Sessions + Messages CRUD (+ triggers agent on POST message) |
| `server/src/api/goals.ts` | Goals + criteria + evidence |
| `server/src/api/runs.ts` | Runs lifecycle |
| `server/src/api/artifacts.ts` | Artifacts upload/download/list |
| `server/src/api/tickers.ts` | Ticker context |
| `server/src/api/data-sources.ts` | Source health |
| `server/src/api/reviews.ts` | Decisions + lessons |
| `server/src/api/sse.ts` | SSE event stream |
| `server/src/api/uploads.ts` | File upload |
| **Tests** | |
| `server/tests/fixtures/` | Test fixture data |
| `server/tests/db.test.ts` | Schema + migration |
| `server/tests/sessions.test.ts` | Sessions + messages API |
| `server/tests/goals.test.ts` | Goals API |
| `server/tests/runs.test.ts` | Runs lifecycle |
| `server/tests/artifacts.test.ts` | Artifact writer |
| `server/tests/sse.test.ts` | SSE |
| `server/tests/security.test.ts` | Auth + path traversal |
| `server/tests/observations.test.ts` | Observation store |
| `server/tests/agent/loop.test.ts` | Agent loop with mock LLM |
| `server/tests/adapters/fixture.test.ts` | Fixture adapter |

### `web/` — React frontend

(和之前一样，略)

---

## Phase 0: Skills 归档 + Monorepo Bootstrap

### Task 0.1: Skills migration to `skills/` directory

**Files:**
- Move: `core/` → `skills/core/`
- Move: `stock/` → `skills/stock/`
- Move: `futu/` → `skills/futu/`
- Move: `crypto/` → `skills/crypto/`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `scripts/install.sh`
- Modify: `scripts/update.sh`
- Modify: `scripts/uninstall.sh`
- Modify: `README.md`

- [ ] Create `skills/` directory.
- [ ] Move `core/` → `skills/core/` (trading-debate, event-calendar, hyperliquid-perps).
- [ ] Move `stock/` → `skills/stock/` (stock-analyzer, market-scanner, stock-fundamentals, stock-valuation).
- [ ] Move `futu/` → `skills/futu/` (futuapi, futu-capital-anomaly, futu-derivatives-anomaly, futu-technical-anomaly, futu-comment-sentiment, futu-stock-digest, futu-news-search, install-futu-opend).
- [ ] Move `crypto/` → `skills/crypto/` (crypto-analyzer, crypto-scanner).
- [ ] Update `.claude-plugin/plugin.json` — change all `core/`, `stock/`, `futu/`, `crypto/` paths to `skills/core/`, `skills/stock/`, `skills/futu/`, `skills/crypto/`.
- [ ] Update `.claude-plugin/marketplace.json` — same path updates.
- [ ] Update `scripts/install.sh` — add `skills/` prefix to all skill directory paths.
- [ ] Update `scripts/update.sh` — same.
- [ ] Update `scripts/uninstall.sh` — same.
- [ ] Update `README.md` — update all relative links (`stock/stock-analyzer/` → `skills/stock/stock-analyzer/`).
- [ ] Verify: `git status` shows renames, not delete+create.
- [ ] Commit:

```bash
git add -A
git commit -m "refactor: move all skills into skills/ directory

Migrate core/, stock/, futu/, crypto/ → skills/.
Update plugin config, install scripts, and README paths."
```

---

### Task 0.2: Agent definitions in `skills/agents/`

**Files:**
- Create: `skills/agents/stock-analyzer/agent.yaml`
- Create: `skills/agents/stock-analyzer/prompt.md`
- Create: `skills/agents/stock-analyzer/output-contract.json`
- Create: `skills/agents/market-scanner/agent.yaml` (+ prompt.md, output-contract.json)
- Create: `skills/agents/event-calendar/agent.yaml` (+ prompt.md, output-contract.json)
- Create: `skills/agents/trading-debate/agent.yaml` (+ prompt.md, output-contract.json)
- Create: `skills/agents/crypto-research/agent.yaml` (+ prompt.md, output-contract.json)
- Create: `skills/agents/portfolio-review/agent.yaml` (+ prompt.md, output-contract.json)

- [ ] For each agent, create `agent.yaml`:

```yaml
# stock-analyzer example
name: stock-analyzer
display_name: "个股多维分析"
workflow_type: data_workflow
skills:
  - skills/stock/stock-analyzer
  - skills/futu/futuapi
  - skills/futu/futu-news-search
  - skills/futu/futu-stock-digest
  - skills/futu/futu-comment-sentiment
  - skills/futu/futu-capital-anomaly
  - skills/futu/futu-derivatives-anomaly
  - skills/futu/futu-technical-anomaly
required_artifacts:
  - report.md
  - result.json
  - sources.json
optional_artifacts: []
data_sources:
  - futu
  - tavily
  - hyperliquid
```

- [ ] For each agent, create `prompt.md` — extracted from existing SKILL.md core principles + execution contract, adapted for server-side agent execution.
- [ ] For each agent, create `output-contract.json` — JSON Schema for result.json.
- [ ] Commit:

```bash
git add skills/agents/
git commit -m "feat(skills): add agent definitions for 6 agents with prompts and output contracts"
```

---

### Task 0.3: Monorepo root config

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `biome.json`

(Same as original Task 0.1, unchanged)

---

### Task 0.4: shared/ package — types, schemas, constants

(Same as original Task 0.2, unchanged)

---

### Task 0.5: Server scaffolding — Hono app + config + entry point

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

(Same as original Task 0.3, but add to `server/package.json` dependencies:)

```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "^1.2.0",
    "@ai-sdk/openai": "^1.2.0",
    "ai": "^4.2.0"
  }
}
```

These are the Vercel AI SDK packages for LLM provider abstraction (Claude API + OpenAI API).

---

### Task 0.6: Web scaffolding — Vite + React 19 + Tailwind 4 + shadcn/ui

(Same as original Task 0.4, unchanged)

---

### Task 0.7: Smoke test

(Same as original Task 0.5, unchanged)

---

## Phase 1: Foundation

### Task 1.1: Drizzle schema + migration — all 14 tables

(Same as original Task 1.1, unchanged)

---

### Task 1.2: Artifact writer — path boundary + checksum

(Same as original Task 1.2, unchanged)

---

### Task 1.3: Auth — token + Origin/CSRF middleware

(Same as original Task 1.3, unchanged)

---

### Task 1.4: Health endpoint + wire auth

(Same as original Task 1.4, unchanged)

---

## Phase 2: Adapters + Observations

### Task 2.1: Adapter interface + Fixture adapter

**Files:**
- Create: `server/src/adapters/base.ts`
- Create: `server/src/adapters/registry.ts`
- Create: `server/src/adapters/fixture/index.ts`
- Create: `server/tests/fixtures/futu_nvda_snapshot.json`
- Create: `server/tests/adapters/fixture.test.ts`

- [ ] Define `DataSourceAdapter` interface (see spec).
- [ ] Implement `AdapterRegistry`: register adapters, lookup by name, list all, health check all.
- [ ] Create fixture adapter with canned data for NVDA quote, kline, news.
- [ ] Write fixture test: `fixture.fetch()` → raw data; `fixture.normalize()` → valid Observations.
- [ ] Commit:

```bash
git add server/src/adapters/ server/tests/
git commit -m "feat(server): add adapter interface, registry, and fixture adapter"
```

---

### Task 2.2: Observation store + freshness

**Files:**
- Create: `server/src/observations/schemas.ts`
- Create: `server/src/observations/store.ts`
- Create: `server/src/observations/freshness.ts`
- Create: `server/tests/observations.test.ts`

- [ ] Define category value schemas using Zod (quote, kline, technical, news, event, funding, capital_flow, order_book, options, valuation, financials, benchmark, source_health).
- [ ] Implement ObservationStore: `insert(observation)`, `query({ticker, category, source, since})`, `getUnexpired(ticker)`.
- [ ] Implement freshness policy: simple lookup table (quote 4h, kline 1h, news 24h, etc.).
- [ ] Write tests: insert + query + expired filtering.
- [ ] Commit:

```bash
git add server/src/observations/ server/tests/observations.test.ts
git commit -m "feat(server): add observation store with category schemas and freshness policy"
```

---

### Task 2.3: Futu adapter (stub) + TickerContext builder

**Files:**
- Create: `server/src/adapters/futu/index.ts`
- Create: `server/src/views/ticker-context.ts`

- [ ] Implement FutuAdapter stub: `healthCheck()` (ping OpenD), `fetch()` (call Python scripts via child_process), `normalize()` (parse JSON → Observations).
- [ ] Implement TickerContext builder: query SQLite for latest runs, unexpired observations, open decisions, due reviews, data gaps, source health.
- [ ] Commit:

```bash
git add server/src/adapters/futu/ server/src/views/
git commit -m "feat(server): add Futu adapter stub and TickerContext builder"
```

---

## Phase 3: REST API + SSE

### Task 3.1: Sessions + Messages API

**Files:**
- Create: `server/src/api/sessions.ts`
- Create: `server/tests/sessions.test.ts`

- [ ] Implement endpoints: POST/GET/PATCH/DELETE sessions, POST/GET messages, POST cancel.
- [ ] `POST /api/sessions/:id/messages` creates message AND creates a run (status=queued) if message has `context.ticker` or `context.skill_name`.
- [ ] Write tests covering full CRUD + message ordering + schema validation.
- [ ] Mount in `app.ts`.
- [ ] Commit:

```bash
git add server/src/api/sessions.ts server/tests/sessions.test.ts
git commit -m "feat(server): implement sessions + messages API"
```

---

### Task 3.2: Goals + Criteria + Evidence API

**Files:**
- Create: `server/src/runtime/goal-manager.ts`
- Create: `server/src/api/goals.ts`
- Create: `server/tests/goals.test.ts`

- [ ] Implement goal manager: single active per session, supersede old goal, expected_goal_id validation.
- [ ] Implement endpoints: POST/GET/PATCH goal, POST evidence, PATCH status.
- [ ] Write tests: create goal → criteria; stale expected_goal_id → 409; supersede.
- [ ] Commit:

```bash
git add server/src/runtime/goal-manager.ts server/src/api/goals.ts server/tests/goals.test.ts
git commit -m "feat(server): implement goals API with single-active-per-session"
```

---

### Task 3.3: Runs lifecycle API

**Files:**
- Create: `server/src/runtime/run-manager.ts`
- Create: `server/src/api/runs.ts`
- Create: `server/tests/runs.test.ts`

- [ ] Implement run state machine: data_workflow (queued→running→succeeded) + agent_workflow (queued→running→succeeded, same since agent is internal).
- [ ] Implement endpoints: POST/GET runs, POST cancel.
- [ ] Write tests: create run → status=queued; cancel → status=cancelled.
- [ ] Commit:

```bash
git add server/src/runtime/run-manager.ts server/src/api/runs.ts server/tests/runs.test.ts
git commit -m "feat(server): implement runs lifecycle API"
```

---

### Task 3.4: Artifacts API

**Files:**
- Create: `server/src/api/artifacts.ts`
- Create: `server/src/api/uploads.ts`

- [ ] Implement: POST artifacts (inline body), GET artifacts, GET report (markdown), POST uploads (multipart).
- [ ] Wire upload-guard for size/path/type checks.
- [ ] Commit:

```bash
git add server/src/api/artifacts.ts server/src/api/uploads.ts
git commit -m "feat(server): implement artifacts + upload API"
```

---

### Task 3.5: Ticker context + Data sources + Reviews API

**Files:**
- Create: `server/src/api/tickers.ts`
- Create: `server/src/api/data-sources.ts`
- Create: `server/src/api/reviews.ts`

- [ ] Implement ticker context: delegates to TickerContext builder.
- [ ] Implement data sources: list + health status from AdapterRegistry.
- [ ] Implement reviews: due decisions, create/patch decisions, create lessons.
- [ ] Commit:

```bash
git add server/src/api/tickers.ts server/src/api/data-sources.ts server/src/api/reviews.ts
git commit -m "feat(server): implement ticker context, data sources, and reviews API"
```

---

### Task 3.6: SSE event stream

**Files:**
- Create: `server/src/runtime/event-bus.ts`
- Create: `server/src/api/sse.ts`
- Create: `server/tests/sse.test.ts`

- [ ] Implement EventBus: session-scoped, 500-event replay buffer, emit/subscribe.
- [ ] Implement SSE endpoint: `GET /api/sessions/:id/events`, Last-Event-ID support, 30s heartbeat.
- [ ] Write tests: event id present, heartbeat, Last-Event-ID replay, dedupe-safe shape.
- [ ] Commit:

```bash
git add server/src/runtime/event-bus.ts server/src/api/sse.ts server/tests/sse.test.ts
git commit -m "feat(server): implement SSE event stream with replay buffer"
```

---

### Task 3.7: Wire all API routes + integration test

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/tests/db.test.ts`

- [ ] Mount all API routes in `app.ts`.
- [ ] Write integration test: session → message → goal → run → artifact → SSE.
- [ ] Run: `pnpm --filter server test` — all pass.
- [ ] Commit:

```bash
git add server/src/app.ts server/tests/db.test.ts
git commit -m "feat(server): wire all API routes and add integration tests"
```

---

## Phase 4: Agent Layer（核心新增）

### Task 4.1: LLM Provider abstraction

**Files:**
- Create: `server/src/agent/llm-provider.ts`

- [ ] Implement LLM provider using Vercel AI SDK:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export type LLMProvider = "anthropic" | "openai";

export function createLLMProvider(provider: LLMProvider, model?: string) {
  switch (provider) {
    case "anthropic":
      return anthropic(model ?? "claude-sonnet-4-20250514");
    case "openai":
      return openai(model ?? "gpt-4o");
  }
}
```

- [ ] Config: `server/src/config.ts` reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from env, `LLM_PROVIDER` (default: "anthropic").
- [ ] Commit:

```bash
git add server/src/agent/llm-provider.ts
git commit -m "feat(server): add LLM provider abstraction with Vercel AI SDK"
```

---

### Task 4.2: Skill loader + Context builder

**Files:**
- Create: `server/src/agent/skill-loader.ts`
- Create: `server/src/agent/context.ts`

- [ ] Implement SkillLoader:

```typescript
// Load agent.yaml + prompt.md for a given agent name
export function loadAgent(name: string): AgentDefinition {
  const dir = resolve(process.cwd(), "skills/agents", name);
  const yaml = parse(readFileSync(resolve(dir, "agent.yaml"), "utf-8"));
  const prompt = readFileSync(resolve(dir, "prompt.md"), "utf-8");
  const contract = JSON.parse(readFileSync(resolve(dir, "output-contract.json"), "utf-8"));
  return { ...yaml, prompt, contract };
}
```

- [ ] Implement ContextBuilder:

```typescript
// Build full context for an agent run
export function buildContext(db, sessionId, goalId, ticker) {
  return {
    session_history: db.getMessages(sessionId),
    goal: goalId ? db.getGoal(goalId) : null,
    ticker_context: ticker ? buildTickerContext(db, ticker) : null,
    recent_decisions: ticker ? db.getDecisions(ticker) : [],
    recent_lessons: ticker ? db.getLessons(ticker) : [],
  };
}
```

- [ ] Commit:

```bash
git add server/src/agent/skill-loader.ts server/src/agent/context.ts
git commit -m "feat(server): add skill loader and context builder for agent"
```

---

### Task 4.3: Tool registry — adapter tools + system tools

**Files:**
- Create: `server/src/agent/tools.ts`

- [ ] Implement ToolRegistry with Vercel AI SDK `tool()`:

```typescript
import { tool } from "ai";
import { z } from "zod";

// Adapter tools: each adapter capability becomes an agent tool
function createAdapterTools(registry: AdapterRegistry, runId: string) {
  const tools: Record<string, Tool> = {};

  for (const adapter of registry.list()) {
    for (const cap of adapter.capabilities()) {
      const toolName = `${adapter.name}_${cap}`;
      tools[toolName] = tool({
        description: `${adapter.name}: ${cap}`,
        parameters: z.object({
          ticker: z.string().optional(),
          market: z.string().optional(),
          // ... other params per capability
        }),
        execute: async (params) => {
          const raw = await adapter.fetch({ operation: cap, ...params });
          // Save raw artifact
          const { path, checksum } = await artifactWriter.write(...);
          // Normalize to observations
          const observations = adapter.normalize(raw);
          // Save observations to SQLite
          for (const obs of observations) observationStore.insert(obs);
          // Log run event
          eventBus.emit(runId, "tool_result", { tool: toolName, status: "ok" });
          return { observations, raw_ref: path };
        },
      });
    }
  }

  // System tools
  tools["write_artifact"] = tool({
    description: "Write a report or result artifact for the current run",
    parameters: z.object({
      filename: z.string(),
      content: z.string(),
      artifact_type: z.enum(["report", "result", "sources", "decision"]),
    }),
    execute: async ({ filename, content, artifact_type }) => {
      return artifactWriter.write(runId, filename, content, { artifact_type, producer: "server" });
    },
  });

  tools["update_goal_evidence"] = tool({
    description: "Record evidence for the current research goal",
    parameters: z.object({
      text: z.string(),
      criterion_id: z.string().optional(),
      source_name: z.string().optional(),
      confidence: z.number().optional(),
    }),
    execute: async (params) => {
      return goalManager.addEvidence(goalId, { ...params, run_id: runId });
    },
  });

  return tools;
}
```

- [ ] Commit:

```bash
git add server/src/agent/tools.ts
git commit -m "feat(server): implement tool registry with adapter + system tools"
```

---

### Task 4.4: AgentLoop — ReAct loop with streaming

**Files:**
- Create: `server/src/agent/loop.ts`
- Create: `server/src/agent/progress.ts`
- Create: `server/tests/agent/loop.test.ts`

- [ ] Implement AgentLoop using Vercel AI SDK `streamText`:

```typescript
import { streamText } from "ai";

export class AgentLoop {
  constructor(
    private llm: ReturnType<typeof createLLMProvider>,
    private tools: Record<string, Tool>,
    private context: AgentContext,
    private eventBus: EventBus,
    private runId: string,
  ) {}

  async run(prompt: string): Promise<AgentResult> {
    const systemPrompt = this.buildSystemPrompt();
    const messages = [
      { role: "system", asystem, content: systemPrompt },
      ...this.context.session_history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: prompt },
    ];

    const result = streamText({
      model: this.llm,
      messages,
      tools: this.tools,
      maxSteps: 50,  // max tool call rounds
      onStepFinish: ({ toolCalls, toolResults, finishReason }) => {
        // Emit SSE events for each tool call/result
        for (const tc of toolCalls) {
          this.eventBus.emit(this.context.sessionId, "tool_call", {
            tool: tc.toolName, arguments: tc.args, run_id: this.runId,
          });
        }
        for (const tr of toolResults) {
          this.eventBus.emit(this.context.sessionId, "tool_result", {
            tool: tr.toolName, status: "ok", run_id: this.runId,
          });
        }
      },
    });

    // Stream text deltas to SSE
    for await (const delta of result.textStream) {
      this.eventBus.emit(this.context.sessionId, "text_delta", { text: delta });
    }

    return { status: "succeeded", text: await result.text };
  }

  private buildSystemPrompt(): string {
    const agent = loadAgent(this.context.agentName);
    let prompt = agent.prompt;
    // Inject context
    prompt += `\n\n## Current Context\n`;
    prompt += `Ticker: ${this.context.ticker ?? "N/A"}\n`;
    prompt += `Market: ${this.context.market ?? "N/A"}\n`;
    if (this.context.goal) {
      prompt += `Research Goal: ${this.context.goal.objective}\n`;
    }
    if (this.context.ticker_context) {
      prompt += `Ticker Context:\n${JSON.stringify(this.context.ticker_context, null, 2)}\n`;
    }
    return prompt;
  }
}
```

- [ ] Implement ProgressEvent emitter for heartbeat and tool progress.
- [ ] Write tests with mock LLM provider: verify tool calls, SSE events, artifact generation.
- [ ] Commit:

```bash
git add server/src/agent/loop.ts server/src/agent/progress.ts server/tests/agent/loop.test.ts
git commit -m "feat(server): implement AgentLoop with ReAct pattern and SSE streaming"
```

---

### Task 4.5: Wire Agent into session service — POST /messages triggers agent

**Files:**
- Modify: `server/src/api/sessions.ts`
- Modify: `server/src/app.ts`

- [ ] Update `POST /api/sessions/:id/messages` handler:

```typescript
// 1. Save user message to DB
// 2. Determine agent from message context (skill_name or auto-detect from content)
// 3. Create run (status=running)
// 4. Build context (session history + goal + ticker context)
// 5. Load agent prompt
// 6. Create tools (adapters + system tools)
// 7. Start AgentLoop as async task
// 8. Return message + run_id immediately
```

- [ ] Agent loop completion handler:

```typescript
// On success:
//   - Save assistant message to DB
//   - Update run status → succeeded
//   - Emit SSE: run.updated, done
// On failure:
//   - Save error message to DB
//   - Update run status → failed
//   - Emit SSE: error
```

- [ ] Write integration test: send message → agent runs with fixture adapter → artifacts created → SSE events emitted.
- [ ] Commit:

```bash
git add server/src/api/sessions.ts server/src/app.ts
git commit -m "feat(server): wire AgentLoop into message handler — POST /messages triggers agent"
```

---

### Task 4.6: Agent tool progress coalescing + safety timeout

**Files:**
- Modify: `server/src/agent/loop.ts`
- Modify: `server/src/runtime/event-bus.ts`

- [ ] Add progress coalescing: batch rapid `tool_progress` events per animation frame (server-side, throttle to 100ms).
- [ ] Add safety timeout: if agent loop produces no events for 120s, emit warning; 300s → force cancel.
- [ ] Commit:

```bash
git add server/src/agent/loop.ts server/src/runtime/event-bus.ts
git commit -m "feat(server): add tool progress coalescing and agent safety timeout"
```

---

## Phase 5: Web UI

### Task 5.1: Agent store (Zustand) + SSE hook

(Same as original Task 4.1, unchanged)

---

### Task 5.2: Research Desk — timeline + composer + welcome screen

(Same as original Task 4.2, unchanged)

---

### Task 5.3: Context chips + Run card + Artifact card + Goal chip + Source warning

(Same as original Task 4.3, unchanged)

---

### Task 5.4: App Shell + Sidebar + Connection Banner

(Same as original Task 4.4, unchanged)

---

### Task 5.5: Run Detail page

(Same as original Task 4.5, unchanged)

---

### Task 5.6: Dashboard, Data Sources, Ticker Page, Review Queue

(Same as original Task 4.6, unchanged)

---

### Task 5.7: i18n namespace completion

(Same as original Task 4.7, unchanged)

---

## Phase 6: Skill Integration

### Task 6.1: Output Contract docs + sidecar requirements

**Files:**
- Modify: `skills/stock/stock-analyzer/SKILL.md` (append Runtime Output Contract section)
- Modify: `skills/core/trading-debate/SKILL.md` (append section)
- Modify: `skills/stock/market-scanner/SKILL.md` (append section)

- [ ] Append "## Runtime Output Contract" to each skill describing:
  - Required artifacts and schemas
  - How the server agent executes this skill
  - result.json / sources.json format
- [ ] Commit:

```bash
git add skills/stock/stock-analyzer/SKILL.md skills/core/trading-debate/SKILL.md skills/stock/market-scanner/SKILL.md
git commit -m "docs(skills): add Runtime Output Contract to core skills"
```

---

## Execution Order

```
Phase 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5 → 0.6 → 0.7
Phase 1: 1.1 → [1.2, 1.3] → 1.4
Phase 2: [2.1, 2.2] → 2.3
Phase 3: [3.1, 3.2] → 3.3 → [3.4, 3.5, 3.6] → 3.7
Phase 4: [4.1, 4.2] → 4.3 → 4.4 → 4.5 → 4.6
Phase 5: 5.1 → [5.2, 5.4] → 5.3 → [5.5, 5.6] → 5.7
Phase 6: 6.1
```

**Critical path:** 0.1 → 0.3 → 0.5 → 1.1 → 3.1 → 3.3 → 3.7 → 4.1 → 4.3 → 4.4 → 4.5

**Estimated tasks:** 30 total, ~6-10 hours with agentic execution.

**Key difference from original plan:**
- Phase 4 is now the **Agent Layer** — the core of the system
- `POST /messages` directly triggers the built-in AgentLoop
- No external agent handoff — server is self-contained (like Vibe-Trading)
- Agents consume TickerContext via tool calls, never touch external APIs directly
