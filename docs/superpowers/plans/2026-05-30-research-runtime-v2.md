# Research Runtime v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local single-user stock research runtime with TypeScript full-stack (Hono server + React web desk), SQLite persistence, SSE streaming, and i18n/dark-mode support.

**Architecture:** pnpm monorepo with three packages (`shared/`, `server/`, `web/`). Server is Hono + Drizzle ORM + better-sqlite3. Web is React 19 + Vite + Tailwind 4 + shadcn/ui. Shared types and Zod schemas ensure type safety across the boundary. All API state changes go through REST endpoints; agents never write SQLite directly.

**Tech Stack:** Hono, Drizzle ORM, better-sqlite3, Zod, React 19, Vite 6, Tailwind CSS 4, shadcn/ui, Zustand 5, react-i18next, Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-05-30-research-runtime-v2-design.md`

---

## File Structure

### Root Config

| File | Responsibility |
|------|---------------|
| `pnpm-workspace.yaml` | Monorepo workspace definition |
| `package.json` | Root scripts: dev, test, lint, build |
| `tsconfig.base.json` | Shared TS config (strict, ES2022, module resolution) |
| `biome.json` | Lint + format rules |
| `.gitignore` | Already updated |

### `shared/` — Cross-package types and schemas

| File | Responsibility |
|------|---------------|
| `shared/package.json` | Package manifest, no dependencies |
| `shared/tsconfig.json` | Extends base |
| `shared/src/index.ts` | Barrel export |
| `shared/src/constants.ts` | All enum values: session status, run status, goal status, artifact types, message roles, observation categories, workflow types, execution modes, owner values |
| `shared/src/types.ts` | TypeScript interfaces: Session, Message, Goal, Criterion, Evidence, Run, Artifact, RunEvent, SessionEvent, Observation, Decision, Lesson, DataSource, TickerContext, SourceHealth |
| `shared/src/schemas.ts` | Zod schemas for API request/response validation |

### `server/` — Hono API server

| File | Responsibility |
|------|---------------|
| `server/package.json` | Dependencies: hono, better-sqlite3, drizzle-orm, zod, etc. |
| `server/tsconfig.json` | Extends base |
| `server/vitest.config.ts` | Test config |
| `server/drizzle.config.ts` | Drizzle migration config |
| `server/src/index.ts` | CLI entry: parse args, start server |
| `server/src/config.ts` | Load config: analysis root, token, host, port |
| `server/src/app.ts` | Hono app assembly: mount all routes, middleware |
| `server/src/db/schema.ts` | Drizzle schema: all 14 tables |
| `server/src/db/index.ts` | Create db instance, run migrations |
| `server/src/db/migrate.ts` | Migration runner |
| `server/src/db/migrations/0000_init.sql` | Initial migration SQL |
| `server/src/auth/token.ts` | Generate/load local session token |
| `server/src/auth/middleware.ts` | Origin, CSRF, token validation middleware |
| `server/src/auth/upload-guard.ts` | Size, path boundary, type validation |
| `server/src/runtime/artifact-writer.ts` | Write artifacts with checksum, path boundary, schema version |
| `server/src/runtime/event-bus.ts` | Session-scoped SSE event bus with replay buffer |
| `server/src/runtime/run-manager.ts` | Run lifecycle state machine |
| `server/src/runtime/goal-manager.ts` | Goal lifecycle: single active per session |
| `server/src/observations/schemas.ts` | Category value schemas (quote, kline, technical, etc.) |
| `server/src/observations/normalizer.ts` | Raw → canonical Observation |
| `server/src/observations/freshness.ts` | Freshness policy defaults |
| `server/src/adapters/base.ts` | DataSourceAdapter interface |
| `server/src/adapters/fixture/index.ts` | Fixture adapter for testing |
| `server/src/api/health.ts` | GET /api/health |
| `server/src/api/sessions.ts` | Sessions + messages CRUD |
| `server/src/api/goals.ts` | Goals + criteria + evidence |
| `server/src/api/runs.ts` | Run lifecycle |
| `server/src/api/artifacts.ts` | Artifact upload/download/list |
| `server/src/api/tickers.ts` | Ticker context |
| `server/src/api/data-sources.ts` | Source health |
| `server/src/api/reviews.ts` | Decisions + lessons |
| `server/src/api/sse.ts` | SSE event stream endpoint |
| `server/src/api/uploads.ts` | File upload |
| `server/tests/fixtures/` | Test fixtures (futu_snapshot.json etc.) |
| `server/tests/db.test.ts` | DB schema + migration tests |
| `server/tests/sessions.test.ts` | Sessions + messages API tests |
| `server/tests/goals.test.ts` | Goals API tests |
| `server/tests/runs.test.ts` | Runs lifecycle tests |
| `server/tests/artifacts.test.ts` | Artifact writer + API tests |
| `server/tests/sse.test.ts` | SSE tests |
| `server/tests/security.test.ts` | Auth + path traversal + upload tests |
| `server/tests/observations.test.ts` | Observation schema + normalizer tests |
| `server/tests/adapters/fixture.test.ts` | Fixture adapter tests |

### `web/` — React frontend

| File | Responsibility |
|------|---------------|
| `web/package.json` | Dependencies: react, react-router, zustand, shadcn deps, i18next, etc. |
| `web/tsconfig.json` | Extends base |
| `web/vite.config.ts` | Dev proxy, @/ alias, chunk splitting |
| `web/index.html` | Entry HTML with Google Fonts |
| `web/src/main.tsx` | React 19 createRoot entry |
| `web/src/index.css` | Tailwind base + CSS variable themes (light + dark) |
| `web/src/router.tsx` | Lazy-loaded routes |
| `web/src/lib/api.ts` | API client + types |
| `web/src/lib/api-auth.ts` | Token storage in localStorage |
| `web/src/lib/utils.ts` | cn() className helper |
| `web/src/lib/formatters.ts` | Number/date formatters |
| `web/src/hooks/useSSE.ts` | SSE hook: reconnect, dedup, heartbeat |
| `web/src/hooks/useTheme.ts` | Dark mode toggle + prefers-color-scheme |
| `web/src/stores/agent.ts` | Zustand: messages, session, streaming, toolCalls, sseStatus |
| `web/src/types/index.ts` | Frontend types |
| `web/src/i18n/index.ts` | i18next init |
| `web/src/i18n/locales/zh-CN/*.json` | Chinese translations (7 files) |
| `web/src/i18n/locales/en-US/*.json` | English translations (7 files) |
| `web/src/pages/ResearchDesk.tsx` | Main page |
| `web/src/pages/Dashboard.tsx` | Runs summary |
| `web/src/pages/TickerPage.tsx` | Ticker context |
| `web/src/pages/RunDetail.tsx` | Run detail tabs |
| `web/src/pages/DataSources.tsx` | Source health |
| `web/src/pages/ReviewQueue.tsx` | Review queue |
| `web/src/components/layout/AppShell.tsx` | Sidebar + main + connection banner |
| `web/src/components/layout/Sidebar.tsx` | Nav + sessions list |
| `web/src/components/layout/ConnectionBanner.tsx` | SSE reconnect status |
| `web/src/components/research/Timeline.tsx` | Message + run card + artifact card |
| `web/src/components/research/MessageBubble.tsx` | User/assistant/system message |
| `web/src/components/research/ThinkingTimeline.tsx` | Expandable tool call sequence |
| `web/src/components/research/Composer.tsx` | Textarea + + menu |
| `web/src/components/research/ContextChips.tsx` | Ticker, goal, attachment chips |
| `web/src/components/research/RunCard.tsx` | Inline run status |
| `web/src/components/research/ArtifactCard.tsx` | Artifact reference |
| `web/src/components/research/SourceWarning.tsx` | Source degradation warning |
| `web/src/components/research/GoalChip.tsx` | Goal progress chip |
| `web/src/components/research/WelcomeScreen.tsx` | Empty session prompt grid |
| `web/src/components/run/ReportTab.tsx` | Markdown report |
| `web/src/components/run/ResultTab.tsx` | result.json viewer |
| `web/src/components/run/SourcesTab.tsx` | sources.json + provenance |
| `web/src/components/run/LogsTab.tsx` | run_events log |
| `web/src/components/run/TrustPanel.tsx` | Checksums + schema version |
| `web/src/components/dashboard/RunsTable.tsx` | Runs table |
| `web/src/components/dashboard/SourceHealthGrid.tsx` | Source health cards |
| `web/src/components/dashboard/DueReviewsList.tsx` | Due reviews list |
| `web/src/components/common/DataTable.tsx` | shadcn-based table |
| `web/src/components/common/Skeleton.tsx` | Loading skeleton |
| `web/src/components/common/ErrorBoundary.tsx` | Error boundary |
| `web/tests/smoke.test.tsx` | App startup smoke test |

---

## Phase 0: Project Bootstrap

### Task 0.1: Monorepo root config

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `biome.json`

- [ ] Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "shared"
  - "server"
  - "web"
```

- [ ] Create root `package.json`:

```json
{
  "name": "stock-skills",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter server dev & pnpm --filter web dev",
    "dev:server": "pnpm --filter server dev",
    "dev:web": "pnpm --filter web dev",
    "test": "pnpm --filter server test && pnpm --filter web test",
    "test:server": "pnpm --filter server test",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "build": "pnpm --filter shared build && pnpm --filter server build && pnpm --filter web build"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

- [ ] Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["node_modules", "dist", "analysis", ".git"]
  }
}
```

- [ ] Run `pnpm install` to verify workspace setup.
- [ ] Commit:

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json biome.json
git commit -m "chore: initialize pnpm monorepo with shared TS config and Biome"
```

---

### Task 0.2: shared/ package — types, schemas, constants

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/constants.ts`
- Create: `shared/src/types.ts`
- Create: `shared/src/schemas.ts`

- [ ] Create `shared/package.json`:

```json
{
  "name": "@stock-skills/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

- [ ] Create `shared/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] Create `shared/src/constants.ts` — all enum values as const objects (see spec data model for complete list). Key enums:
  - `SessionStatus`: active, running, waiting_for_agent, failed, archived
  - `RunStatus`: queued, running, waiting_for_agent, waiting_for_artifacts, succeeded, succeeded_with_warnings, failed, cancelled
  - `GoalStatus`: active, paused, waiting_user, needs_refresh, insufficient_evidence, blocked, budget_limited, complete, cancelled, superseded
  - `MessageRole`: user, assistant, system, tool, event
  - `MessageType`: plain, thinking, tool_call, tool_result, run_card, artifact_card, source_warning, goal_event, error
  - `ArtifactType`: input, report, result, sources, decision, log, source_raw, export
  - `WorkflowType`: data_workflow, agent_workflow
  - `ExecutionMode`: server_direct, agent_handoff, manual_import
  - `Owner`: server, codex, web_agent, human, none
  - `ObservationCategory`: quote, kline, technical, technical_anomaly, news, sentiment, digest, event, funding, capital_flow, capital_distribution, order_book, options, derivative_anomaly, valuation, financials, company_profile, corporate_actions, peers, sector, benchmark, relative_strength, source_health
  - `ObservationStatus`: ok, degraded, unavailable, not_applicable, stale, failed
  - `CriterionStatus`: pending, covered, waived, failed
  - `DecisionRating`: Buy, Overweight, Hold, Underweight, Sell
  - `DecisionStatus`: pending, reviewed, expired
  - `Severity`: info, warning, error

- [ ] Create `shared/src/types.ts` — TypeScript interfaces matching all 14 tables + domain views (TickerContext, RunSummary, SourceHealth, GoalSnapshot, etc.)

- [ ] Create `shared/src/schemas.ts` — Zod schemas for:
  - CreateSessionRequest: `{ title?: string }`
  - SendMessageRequest: `{ content: string, context?: { ticker?, workflow_type?, skill_name? } }`
  - CreateGoalRequest: `{ objective, criteria: string[], risk_tier?, turn_budget? }`
  - CreateGoalEvidenceRequest: `{ expected_goal_id, text, criterion_id?, ... }`
  - UpdateGoalStatusRequest: `{ expected_goal_id, status }`
  - CreateRunRequest: `{ skill_name, session_id?, goal_id?, ticker?, market?, intent?, workflow_type, execution_mode?, caller? }`
  - SubmitArtifactRequest: `{ artifact_type, schema_version?, content_type?, producer, body? }`

- [ ] Create `shared/src/index.ts`:

```typescript
export * from "./constants.js";
export * from "./types.js";
export * from "./schemas.js";
```

- [ ] Verify: `cd shared && npx tsc --noEmit` passes.
- [ ] Commit:

```bash
git add shared/
git commit -m "feat(shared): add types, schemas, and constants for all 14 tables"
```

---

### Task 0.3: Server scaffolding — Hono app + config + entry point

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

- [ ] Create `server/package.json`:

```json
{
  "name": "@stock-skills/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@stock-skills/shared": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.7.0",
    "better-sqlite3": "^11.8.0",
    "drizzle-orm": "^0.38.0",
    "nanoid": "^5.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] Create `server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] Create `server/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
```

- [ ] Create `server/src/config.ts`:

```typescript
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export interface Config {
  host: string;
  port: number;
  analysisRoot: string;
  token: string;
  dbPath: string;
  maxUploadBytes: number;
}

export function loadConfig(): Config {
  const host = process.env.STOCK_SKILLS_HOST ?? "127.0.0.1";
  const port = Number(process.env.STOCK_SKILLS_PORT ?? "3001");
  const analysisRoot = process.env.STOCK_SKILLS_ANALYSIS_ROOT
    ?? resolve(process.cwd(), "analysis");
  const token = loadOrCreateToken(analysisRoot);
  const dbPath = resolve(analysisRoot, "stock_skills.sqlite");
  const maxUploadBytes = 50 * 1024 * 1024; // 50MB

  // Ensure analysis root exists
  if (!existsSync(analysisRoot)) {
    mkdirSync(analysisRoot, { recursive: true });
  }
  const artifactsDir = resolve(analysisRoot, "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  return { host, port, analysisRoot, token, dbPath, maxUploadBytes };
}

function loadOrCreateToken(analysisRoot: string): string {
  const envToken = process.env.STOCK_SKILLS_TOKEN;
  if (envToken) return envToken;

  const tokenFile = resolve(analysisRoot, ".token");
  if (existsSync(tokenFile)) {
    return readFileSync(tokenFile, "utf-8").trim();
  }

  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenFile, token, "utf-8");
  return token;
}
```

- [ ] Create `server/src/app.ts`:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Config } from "./config.js";

export function createApp(config: Config): Hono {
  const app = new Hono();

  app.use("*", cors({
    origin: [`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }));

  // Health check (no auth required)
  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
      analysis_root: config.analysisRoot,
    });
  });

  // TODO: mount remaining routes in Phase 1-3

  return app;
}
```

- [ ] Create `server/src/index.ts`:

```typescript
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Stock Skills server running at http://${config.host}:${info.port}`);
  console.log(`Token: ${config.token}`);
  console.log(`Analysis root: ${config.analysisRoot}`);
});
```

- [ ] Run: `pnpm --filter server dev` — verify server starts on `:3001`.
- [ ] Run: `curl http://127.0.0.1:3001/api/health` — verify JSON response.
- [ ] Commit:

```bash
git add server/
git commit -m "feat(server): scaffold Hono app with config, health endpoint, and Vitest"
```

---

### Task 0.4: Web scaffolding — Vite + React 19 + Tailwind 4 + shadcn/ui

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/index.css`
- Create: `web/src/router.tsx`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/api-auth.ts`
- Create: `web/src/lib/formatters.ts`
- Create: `web/src/hooks/useTheme.ts`
- Create: `web/src/i18n/index.ts`
- Create: `web/src/i18n/locales/zh-CN/common.json`
- Create: `web/src/i18n/locales/en-US/common.json`
- Create: `web/src/pages/ResearchDesk.tsx`
- Create: `web/src/components/layout/AppShell.tsx`
- Create: `web/src/components/layout/Sidebar.tsx`

- [ ] Initialize Vite project:

```bash
cd /Users/hengistchan/Code/ana-stock/stock-skills
pnpm create vite web --template react-ts
cd web
```

- [ ] Update `web/package.json` to include all required dependencies:

```json
{
  "name": "@stock-skills/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@stock-skills/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "zustand": "^5.0.0",
    "i18next": "^24.0.0",
    "react-i18next": "^15.0.0",
    "i18next-browser-languagedetector": "^8.0.0",
    "lucide-react": "^0.460.0",
    "react-markdown": "^9.0.0",
    "rehype-highlight": "^7.0.0",
    "remark-gfm": "^4.0.1",
    "sonner": "^2.0.7",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@tanstack/react-table": "^8.20.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.4.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] Configure `web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
```

- [ ] Update `web/tsconfig.json` to extend base with path alias.
- [ ] Create `web/index.html` with Google Fonts preconnect for Inter and JetBrains Mono.
- [ ] Create `web/src/index.css` with Tailwind 4 import + CSS variable theme tokens (light + dark, matching spec color values).
- [ ] Create `web/src/main.tsx` — import i18n, render `<App />` with `<BrowserRouter>`.
- [ ] Create `web/src/router.tsx` — lazy-loaded routes: `/` → ResearchDesk, `/dashboard`, `/tickers/:ticker`, `/runs/:runId`, `/data-sources`, `/reviews`. All wrapped in `<AppShell>`.
- [ ] Create `web/src/lib/utils.ts` — `cn()` with clsx + tailwind-merge.
- [ ] Create `web/src/lib/api.ts` — flat `api` object with all REST + SSE URL builders, matching spec API surface. Uses `request<T>()` helper with auth headers.
- [ ] Create `web/src/lib/api-auth.ts` — localStorage token storage.
- [ ] Create `web/src/lib/formatters.ts` — number (comma, %, currency) and date formatters.
- [ ] Create `web/src/hooks/useTheme.ts` — dark mode toggle, `localStorage("theme")`, `prefers-color-scheme` default.
- [ ] Create `web/src/i18n/index.ts` — i18next init with LanguageDetector, zh-CN default, namespace loading.
- [ ] Create `web/src/i18n/locales/zh-CN/common.json` and `en-US/common.json` with nav labels, button text, status badges, error messages.
- [ ] Create `web/src/pages/ResearchDesk.tsx` — placeholder: "Research Desk" heading.
- [ ] Create `web/src/components/layout/AppShell.tsx` — sidebar + main area with `<Outlet>`.
- [ ] Create `web/src/components/layout/Sidebar.tsx` — nav links, sessions list placeholder, dark mode toggle, language switcher.
- [ ] Run `pnpm install` from root.
- [ ] Run `pnpm --filter web dev` — verify app starts on `:5173`, shows Research Desk.
- [ ] Commit:

```bash
git add web/
git commit -m "feat(web): scaffold Vite + React 19 + Tailwind 4 + shadcn/ui + i18n + dark mode"
```

---

### Task 0.5: Smoke test — verify full stack starts

**Files:**
- Create: `web/tests/smoke.test.tsx`

- [ ] Write smoke test:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../src/App";

describe("App", () => {
  it("renders Research Desk as default route", () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(screen.getByText(/Research Desk/i)).toBeDefined();
  });
});
```

- [ ] Run: `pnpm test` — all tests pass.
- [ ] Run: `pnpm dev` — server on `:3001`, web on `:5173`, health check works.
- [ ] Commit:

```bash
git add web/tests/
git commit -m "test(web): add smoke test for default route"
```

---

## Phase 1: Foundation

### Task 1.1: Drizzle schema + migration — all 14 tables

**Files:**
- Create: `server/drizzle.config.ts`
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/index.ts`
- Generate: `server/src/db/migrations/0000_init.sql`

- [ ] Install drizzle-kit: `pnpm --filter server add -D drizzle-kit`.
- [ ] Create `server/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./analysis/stock_skills.sqlite",
  },
});
```

- [ ] Create `server/src/db/schema.ts` — Drizzle schema defining all 14 tables from the spec. Use `sqliteTable`, `text`, `integer`, `real`, `uniqueIndex`. Include partial unique index for `research_goals` (one non-terminal goal per session).
- [ ] Create `server/src/db/index.ts`:

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = resolve(import.meta.dirname ?? __dirname, "migrations");
  migrate(db, { migrationsFolder });

  return db;
}

export type Database = ReturnType<typeof createDb>;
```

- [ ] Generate migration: `pnpm --filter server db:generate`.
- [ ] Create `server/src/db/migrate.ts`:

```typescript
import { createDb } from "./index.js";
import { loadConfig } from "../config.js";

const config = loadConfig();
createDb(config.dbPath);
console.log("Migrations applied to", config.dbPath);
```

- [ ] Update `server/src/app.ts` to accept `db` parameter and store in context.
- [ ] Commit:

```bash
git add server/src/db/ server/drizzle.config.ts
git commit -m "feat(server): add Drizzle schema for all 14 tables with migration"
```

---

### Task 1.2: Artifact writer — path boundary + checksum

**Files:**
- Create: `server/src/runtime/artifact-writer.ts`
- Create: `server/tests/artifacts.test.ts`

- [ ] Write tests for artifact writer:
  - Write a file under analysis root → succeeds, returns checksum
  - Attempt path traversal (`../../../etc/passwd`) → throws 400
  - Checksum matches SHA-256 of content
  - schema_version and producer recorded

- [ ] Implement `server/src/runtime/artifact-writer.ts`:
  - `writeArtifact(analysisRoot, runDir, filename, content, opts)` → `{ path, checksum, sizeBytes }`
  - `resolve()` then verify resolved path starts with analysisRoot
  - SHA-256 checksum calculation
  - Create directory structure if needed

- [ ] Run: `pnpm --filter server test tests/artifacts.test.ts`
- [ ] Commit:

```bash
git add server/src/runtime/artifact-writer.ts server/tests/artifacts.test.ts
git commit -m "feat(server): implement artifact writer with path boundary and checksum"
```

---

### Task 1.3: Auth — token + Origin/CSRF middleware

**Files:**
- Create: `server/src/auth/token.ts`
- Create: `server/src/auth/middleware.ts`
- Create: `server/src/auth/upload-guard.ts`
- Create: `server/tests/security.test.ts`

- [ ] Write security tests:
  - Missing token → 401
  - Wrong Origin → 403
  - Missing X-Requested-With → 403
  - Valid request → passes middleware
  - Path traversal in upload → 400
  - Blocked file extension → 422
  - Oversized upload → 413

- [ ] Implement `server/src/auth/token.ts` — load token from config, constant-time compare.
- [ ] Implement `server/src/auth/middleware.ts`:

```typescript
// Hono middleware that:
// 1. Checks Origin header (write methods only)
// 2. Checks X-Requested-With: fetch (write methods only)
// 3. Checks Authorization: Bearer <token> (write methods only)
// GET requests pass without auth (read-only local tool)
```

- [ ] Implement `server/src/auth/upload-guard.ts`:
  - Max size check
  - Path boundary check (reuse artifact-writer logic)
  - Blocked extension list: `.exe`, `.sh`, `.py`, `.bat`, `.cmd`, `.msi`, `.dmg`, `.zip`, `.tar`, `.gz`

- [ ] Run: `pnpm --filter server test tests/security.test.ts`
- [ ] Commit:

```bash
git add server/src/auth/ server/tests/security.test.ts
git commit -m "feat(server): implement auth middleware with Origin, CSRF, token, and upload guard"
```

---

### Task 1.4: Health endpoint test + wire auth into app

**Files:**
- Modify: `server/src/app.ts`

- [ ] Mount auth middleware on write routes (POST/PATCH/DELETE).
- [ ] Write API test for `GET /api/health` using `app.request()`:

```typescript
it("GET /api/health returns ok status", async () => {
  const res = await app.request("/api/health");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.version).toBeDefined();
});
```

- [ ] Run: `pnpm --filter server test`
- [ ] Commit:

```bash
git add server/src/app.ts
git commit -m "feat(server): wire auth middleware and health test"
```

---

## Phase 2: Adapters + Observations

### Task 2.1: Adapter interface + Fixture adapter

**Files:**
- Create: `server/src/adapters/base.ts`
- Create: `server/src/adapters/fixture/index.ts`
- Create: `server/tests/fixtures/futu_snapshot.json`
- Create: `server/tests/adapters/fixture.test.ts`

- [ ] Define `DataSourceAdapter` interface in `base.ts` (see spec).
- [ ] Create fixture adapter with canned data for NVDA quote, kline, news.
- [ ] Write fixture test: `fixture.normalize(futu_snapshot)` → returns valid Observations.
- [ ] Commit:

```bash
git add server/src/adapters/ server/tests/
git commit -m "feat(server): add adapter interface and fixture adapter with test fixtures"
```

---

### Task 2.2: Observation schemas + normalizer + freshness

**Files:**
- Create: `server/src/observations/schemas.ts`
- Create: `server/src/observations/normalizer.ts`
- Create: `server/src/observations/freshness.ts`
- Create: `server/tests/observations.test.ts`

- [ ] Define category value schemas using Zod (quote, kline, technical, news, event, funding, capital_flow, order_book, options, valuation, financials, benchmark, source_health).
- [ ] Implement normalizer: validates raw payload against category schema, returns canonical Observation.
- [ ] Implement freshness policy defaults (quote 4h, kline 1h, news 24h, funding 1h, etc.).
- [ ] Write tests: valid payload → ok; missing required field → error; stale timestamp → status=stale.
- [ ] Commit:

```bash
git add server/src/observations/ server/tests/observations.test.ts
git commit -m "feat(server): add observation schemas, normalizer, and freshness policy"
```

---

## Phase 3: REST API + SSE

### Task 3.1: Sessions + Messages API

**Files:**
- Create: `server/src/api/sessions.ts`
- Create: `server/tests/sessions.test.ts`

- [ ] Implement endpoints: POST/GET/PATCH/DELETE sessions, POST/GET messages, POST cancel.
- [ ] Write tests covering full CRUD + message ordering + schema validation.
- [ ] Mount in `app.ts`.
- [ ] Commit:

```bash
git add server/src/api/sessions.ts server/tests/sessions.test.ts
git commit -m "feat(server): implement sessions + messages API with tests"
```

---

### Task 3.2: Goals + Criteria + Evidence API

**Files:**
- Create: `server/src/runtime/goal-manager.ts`
- Create: `server/src/api/goals.ts`
- Create: `server/tests/goals.test.ts`

- [ ] Implement goal manager: single active per session, supersede old goal on new create, expected_goal_id validation.
- [ ] Implement endpoints: POST/GET/PATCH goal, POST evidence, PATCH status.
- [ ] Write tests: create goal → criteria created; stale expected_goal_id → 409; supersede old goal.
- [ ] Commit:

```bash
git add server/src/runtime/goal-manager.ts server/src/api/goals.ts server/tests/goals.test.ts
git commit -m "feat(server): implement goals API with single-active-per-session constraint"
```

---

### Task 3.3: Runs lifecycle API

**Files:**
- Create: `server/src/runtime/run-manager.ts`
- Create: `server/src/api/runs.ts`
- Create: `server/tests/runs.test.ts`

- [ ] Implement run manager state machine (data_workflow: queued→running→succeeded; agent_workflow: queued→waiting_for_agent→running→waiting_for_artifacts→succeeded).
- [ ] Implement endpoints: POST/GET runs, POST claim/start/request-complete/fail/cancel.
- [ ] Write tests: create run → status=queued; claim → owner set; request-complete → validates required artifacts.
- [ ] Commit:

```bash
git add server/src/runtime/run-manager.ts server/src/api/runs.ts server/tests/runs.test.ts
git commit -m "feat(server): implement runs lifecycle API with state machine"
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

- [ ] Implement ticker context: latest runs, open decisions, recent observations, data gaps.
- [ ] Implement data sources: list + health status.
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

- [ ] Implement event bus: session-scoped, 500-event replay buffer, thread-safe emit.
- [ ] Implement SSE endpoint: `GET /api/sessions/:id/events`, Last-Event-ID support, 30s heartbeat.
- [ ] Write tests: event id present, heartbeat fires, Last-Event-ID replay works, dedupe-safe shape.
- [ ] Commit:

```bash
git add server/src/runtime/event-bus.ts server/src/api/sse.ts server/tests/sse.test.ts
git commit -m "feat(server): implement SSE event stream with replay buffer and heartbeat"
```

---

### Task 3.7: Wire all API routes into app + integration tests

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/tests/db.test.ts`

- [ ] Mount all API routes in `app.ts`.
- [ ] Write integration test: full session→message→goal→run→artifact→SSE flow.
- [ ] Run: `pnpm --filter server test` — all pass.
- [ ] Commit:

```bash
git add server/src/app.ts server/tests/db.test.ts
git commit -m "feat(server): wire all API routes and add integration tests"
```

---

## Phase 4: Web UI

### Task 4.1: Agent store (Zustand) + SSE hook

**Files:**
- Create: `web/src/stores/agent.ts`
- Create: `web/src/hooks/useSSE.ts`
- Create: `web/src/types/index.ts`

- [ ] Implement Zustand store: messages, sessionId, status, streamingText, toolCalls, sseStatus, sseRetryAttempt, sessionLoading, session LRU cache (5 entries).
- [ ] Implement useSSE hook: exponential backoff reconnect, LRU dedup (500), Last-Event-ID resume, status callback.
- [ ] Create frontend types matching shared types.
- [ ] Commit:

```bash
git add web/src/stores/agent.ts web/src/hooks/useSSE.ts web/src/types/index.ts
git commit -m "feat(web): implement Zustand store and SSE hook"
```

---

### Task 4.2: Research Desk — timeline + composer + welcome screen

**Files:**
- Modify: `web/src/pages/ResearchDesk.tsx`
- Create: `web/src/components/research/Timeline.tsx`
- Create: `web/src/components/research/MessageBubble.tsx`
- Create: `web/src/components/research/ThinkingTimeline.tsx`
- Create: `web/src/components/research/Composer.tsx`
- Create: `web/src/components/research/WelcomeScreen.tsx`

- [ ] Implement Timeline: message grouping (single vs timeline), merged with run events.
- [ ] Implement MessageBubble: user (right-aligned), assistant (markdown), system, tool, event.
- [ ] Implement ThinkingTimeline: expandable tool call sequence with tree connector UI.
- [ ] Implement Composer: multi-line textarea, Enter to send, Shift+Enter newline, Stop button.
- [ ] Implement WelcomeScreen: example prompt grid for empty sessions.
- [ ] Wire SSE event handlers in ResearchDesk: text_delta, tool_call, tool_result, attempt.completed, attempt.failed.
- [ ] Commit:

```bash
git add web/src/pages/ResearchDesk.tsx web/src/components/research/
git commit -m "feat(web): implement Research Desk with timeline, composer, and welcome screen"
```

---

### Task 4.3: Context chips + Run card + Artifact card + Goal chip + Source warning

**Files:**
- Create: `web/src/components/research/ContextChips.tsx`
- Create: `web/src/components/research/RunCard.tsx`
- Create: `web/src/components/research/ArtifactCard.tsx`
- Create: `web/src/components/research/GoalChip.tsx`
- Create: `web/src/components/research/SourceWarning.tsx`

- [ ] Implement ContextChips: ticker, goal, attachment, workflow, owner — displayed above composer.
- [ ] Implement RunCard: inline run status with skill_name, ticker, status badge, timing.
- [ ] Implement ArtifactCard: artifact reference with type, size, checksum preview.
- [ ] Implement GoalChip: goal progress bar with criteria met/total, expandable detail.
- [ ] Implement SourceWarning: amber warning for source degradation.
- [ ] Commit:

```bash
git add web/src/components/research/ContextChips.tsx web/src/components/research/RunCard.tsx \
       web/src/components/research/ArtifactCard.tsx web/src/components/research/GoalChip.tsx \
       web/src/components/research/SourceWarning.tsx
git commit -m "feat(web): add context chips, run card, artifact card, goal chip, and source warning"
```

---

### Task 4.4: App Shell + Sidebar + Connection Banner

**Files:**
- Modify: `web/src/components/layout/AppShell.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Create: `web/src/components/layout/ConnectionBanner.tsx`

- [ ] Implement AppShell: sidebar + main area, collapsible (240px → 48px), `localStorage("sidebar")`.
- [ ] Implement Sidebar: nav links (Research Desk, Dashboard, Data Sources, Reviews), sessions list with status dots, inline rename/delete, dark mode toggle, language switcher.
- [ ] Implement ConnectionBanner: yellow warning bar when SSE reconnecting.
- [ ] Commit:

```bash
git add web/src/components/layout/
git commit -m "feat(web): implement app shell with collapsible sidebar, sessions list, and connection banner"
```

---

### Task 4.5: Run Detail page

**Files:**
- Create: `web/src/pages/RunDetail.tsx`
- Create: `web/src/components/run/ReportTab.tsx`
- Create: `web/src/components/run/ResultTab.tsx`
- Create: `web/src/components/run/SourcesTab.tsx`
- Create: `web/src/components/run/LogsTab.tsx`
- Create: `web/src/components/run/TrustPanel.tsx`

- [ ] Implement RunDetail: tabs (Report, Result JSON, Sources, Logs, Trust), load run data.
- [ ] Implement ReportTab: react-markdown with syntax highlighting.
- [ ] Implement ResultTab: JSON viewer with collapsible sections.
- [ ] Implement SourcesTab: sources.json table with provenance links.
- [ ] Implement LogsTab: run_events log table.
- [ ] Implement TrustPanel: schema version, generated_at, data sources, warnings, artifact checksums (SHA-256 truncated), reproducibility.
- [ ] Commit:

```bash
git add web/src/pages/RunDetail.tsx web/src/components/run/
git commit -m "feat(web): implement Run Detail page with report, sources, logs, and trust panel"
```

---

### Task 4.6: Dashboard, Data Sources, Ticker Page, Review Queue

**Files:**
- Create: `web/src/pages/Dashboard.tsx`
- Create: `web/src/pages/DataSources.tsx`
- Create: `web/src/pages/TickerPage.tsx`
- Create: `web/src/pages/ReviewQueue.tsx`
- Create: `web/src/components/dashboard/RunsTable.tsx`
- Create: `web/src/components/dashboard/SourceHealthGrid.tsx`
- Create: `web/src/components/dashboard/DueReviewsList.tsx`
- Create: `web/src/components/common/DataTable.tsx`
- Create: `web/src/components/common/Skeleton.tsx`
- Create: `web/src/components/common/ErrorBoundary.tsx`

- [ ] Implement Dashboard: summary cards (running/failed/due reviews/source health), runs table, due reviews list.
- [ ] Implement DataSources: source health table, enabled toggles, selected source detail.
- [ ] Implement TickerPage: ticker header, action buttons (Analyze/Debate/Review), tabs (Context/Runs/Decisions/Lessons/Observations).
- [ ] Implement ReviewQueue: due/upcoming/reviewed filters, decision table, lesson editor.
- [ ] Implement DataTable: shadcn-based reusable table component.
- [ ] Implement Skeleton + ErrorBoundary: loading and error states.
- [ ] Commit:

```bash
git add web/src/pages/Dashboard.tsx web/src/pages/DataSources.tsx web/src/pages/TickerPage.tsx \
       web/src/pages/ReviewQueue.tsx web/src/components/dashboard/ web/src/components/common/
git commit -m "feat(web): implement Dashboard, Data Sources, Ticker Page, and Review Queue"
```

---

### Task 4.7: i18n namespace completion

**Files:**
- Create: `web/src/i18n/locales/zh-CN/research.json`
- Create: `web/src/i18n/locales/zh-CN/dashboard.json`
- Create: `web/src/i18n/locales/zh-CN/ticker.json`
- Create: `web/src/i18n/locales/zh-CN/run.json`
- Create: `web/src/i18n/locales/zh-CN/sources.json`
- Create: `web/src/i18n/locales/zh-CN/reviews.json`
- Create: `web/src/i18n/locales/en-US/` (same files)

- [ ] Complete all i18n namespace files with UI chrome translations.
- [ ] Verify all pages use `useTranslation()` for UI labels.
- [ ] Commit:

```bash
git add web/src/i18n/
git commit -m "feat(web): complete i18n namespaces for all pages (zh-CN + en-US)"
```

---

## Phase 5: Skill Integration

### Task 5.1: Output Contract docs for skills

**Files:**
- Modify: `stock/stock-analyzer/SKILL.md` (append section)
- Modify: `core/trading-debate/SKILL.md` (append section)
- Modify: `stock/market-scanner/SKILL.md` (append section)

- [ ] Append "## Runtime Output Contract" section to each skill:
  - Required artifacts: `result.json`, `sources.json`
  - Optional: `decision.json` (trading-debate only)
  - Schema for result.json and sources.json
  - How to submit via `POST /api/runs/:id/artifacts`
  - Markdown report as human-readable layer
- [ ] Commit:

```bash
git add stock/stock-analyzer/SKILL.md core/trading-debate/SKILL.md stock/market-scanner/SKILL.md
git commit -m "docs(skills): add Runtime Output Contract to stock-analyzer, trading-debate, market-scanner"
```

---

## Phase 6: Agent Workflow

### Task 6.1: Ticker context + Artifact submit + Decisions/Lessons

**Files:**
- Modify: `server/src/api/tickers.ts`
- Modify: `server/src/api/artifacts.ts`
- Modify: `server/src/api/reviews.ts`

- [ ] Ensure `GET /api/tickers/:ticker/context` returns full TickerContext (latest runs + observations + decisions + gaps + source health).
- [ ] Ensure `POST /api/runs/:id/artifacts` validates required artifacts for agent_workflow before allowing request-complete.
- [ ] Ensure `POST /api/decisions` and `POST /api/lessons` create records with proper foreign keys.
- [ ] Write integration test: agent_workflow full cycle (create run → claim → start → submit artifacts → request-complete → succeeded).
- [ ] Commit:

```bash
git add server/src/api/
git commit -m "feat(server): complete agent workflow endpoints with artifact validation"
```

---

## Execution Order

```
Phase 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5    (sequential, each depends on prior)
Phase 1: 1.1 → 1.2 + 1.3 (parallel) → 1.4  (1.2 and 1.3 independent)
Phase 2: 2.1 + 2.2 (parallel)               (independent tasks)
Phase 3: 3.1 + 3.2 (parallel) → 3.3 → 3.4 + 3.5 + 3.6 (parallel) → 3.7
Phase 4: 4.1 → 4.2 + 4.4 (parallel) → 4.3 → 4.5 + 4.6 (parallel) → 4.7
Phase 5: 5.1
Phase 6: 6.1
```

**Critical path:** 0.1 → 0.2 → 0.3 → 1.1 → 3.1 → 3.3 → 3.7 → 4.1 → 4.2

**Estimated tasks:** 27 total, ~4-8 hours with agentic execution.
