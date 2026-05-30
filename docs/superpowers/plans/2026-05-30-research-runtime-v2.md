# Research Runtime v2 — Full Implementation Plan (Next.js)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local single-user stock research runtime — Next.js full-stack (App Router + built-in AgentLoop + Anthropic SDK), SQLite persistence, SSE streaming, i18n/dark-mode.

**Architecture:** Single Next.js project. API Route Handlers serve REST + SSE. `src/lib/` holds all server logic (DB, agent, adapters, runtime). React components in `src/components/`. Pages in `src/app/`. Skills and agent definitions in `skills/`. When a user sends a message via the Research Desk, `POST /api/sessions/:id/messages` creates a run and starts the built-in AgentLoop, which streams tool calls and text deltas back via SSE — exactly like Vibe-Trading's architecture but in TypeScript.

**Tech Stack:** Next.js 15, Anthropic SDK, Drizzle ORM, better-sqlite3, Zod, Zustand 5, Tailwind CSS 4, shadcn/ui, react-i18next, Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-05-30-research-runtime-v2-design.md`

---

## Phase 0: Skills 归档 + Project Bootstrap

### Task 0.1: Skills migration to `skills/`

**Files:**
- Move: `core/` → `skills/core/`
- Move: `stock/` → `skills/stock/`
- Move: `futu/` → `skills/futu/`
- Move: `crypto/` → `skills/crypto/`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `scripts/install.sh`, `scripts/update.sh`, `scripts/uninstall.sh`
- Modify: `README.md`

- [ ] Create `skills/` directory.
- [ ] Move all four skill directories into `skills/`.
- [ ] Update `.claude-plugin/plugin.json` paths: `core/` → `skills/core/`, etc.
- [ ] Update `.claude-plugin/marketplace.json` same way.
- [ ] Update `scripts/install.sh`, `scripts/update.sh`, `scripts/uninstall.sh` — add `skills/` prefix.
- [ ] Update all relative links in `README.md`.
- [ ] Verify `git status` shows renames (not delete+create).
- [ ] Commit:

```bash
git add -A
git commit -m "refactor: move all skills into skills/ directory"
```

---

### Task 0.2: Agent definitions in `skills/agents/`

**Files:**
- Create: `skills/agents/stock-analyzer/agent.yaml`
- Create: `skills/agents/stock-analyzer/prompt.md`
- Create: `skills/agents/stock-analyzer/output-contract.json`
- (Same for: market-scanner, event-calendar, trading-debate, crypto-research, portfolio-review)

- [ ] Create `agent.yaml` for each agent:

```yaml
# skills/agents/stock-analyzer/agent.yaml
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
required_artifacts: [report.md, result.json, sources.json]
optional_artifacts: []
data_sources: [futu, tavily, hyperliquid]
```

- [ ] Create `prompt.md` for each agent — extracted from SKILL.md core principles, adapted for server-side execution.
- [ ] Create `output-contract.json` — JSON Schema for result.json.
- [ ] Commit:

```bash
git add skills/agents/
git commit -m "feat(skills): add 6 agent definitions with prompts and output contracts"
```

---

### Task 0.3: Next.js project initialization

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `drizzle.config.ts`
- Create: `vitest.config.ts`
- Create: `components.json` (shadcn/ui)
- Modify: `.gitignore` (already updated)

- [ ] Initialize Next.js:

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Or manually create `package.json`:

```json
{
  "name": "stock-skills",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/lib/db/migrate.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@tanstack/react-table": "^8.20.0",
    "better-sqlite3": "^11.8.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "drizzle-orm": "^0.38.0",
    "i18next": "^24.0.0",
    "i18next-browser-languagedetector": "^8.0.0",
    "lucide-react": "^0.460.0",
    "nanoid": "^5.1.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-i18next": "^15.0.0",
    "react-markdown": "^9.0.0",
    "rehype-highlight": "^7.0.0",
    "remark-gfm": "^4.0.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^2.6.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.30.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] Create `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling better-sqlite3 (it's a native module)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "analysis", "skills"]
}
```

- [ ] Create `biome.json` (same as before).
- [ ] Create `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./analysis/stock_skills.sqlite" },
});
```

- [ ] Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 10_000,
  },
});
```

- [ ] Run `pnpm install`.
- [ ] Verify `pnpm dev` starts on `:3000`.
- [ ] Commit:

```bash
git add package.json next.config.ts tsconfig.json biome.json drizzle.config.ts vitest.config.ts pnpm-lock.yaml
git commit -m "chore: initialize Next.js project with Tailwind, Drizzle, Vitest, Biome"
```

---

### Task 0.4: shadcn/ui + Tailwind theme + CSS variables

**Files:**
- Create/Modify: `src/app/globals.css`
- Create: `src/lib/utils.ts`

- [ ] Initialize shadcn/ui:

```bash
pnpm dlx shadcn@latest init
```

- [ ] Update `src/app/globals.css` with the spec's dual-theme CSS variables (light + dark, HSL values from spec).
- [ ] Create `src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { tailwindMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return tailwindMerge(clsx(inputs));
}
```

- [ ] Verify dark mode toggle works (add `dark` class to `<html>`).
- [ ] Commit:

```bash
git add src/app/globals.css src/lib/utils.ts components.json
git commit -m "feat: initialize shadcn/ui with dual-theme CSS variables (light + dark)"
```

---

### Task 0.5: Config + DB schema + migration

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/migrate.ts`
- Generate: `src/lib/db/migrations/`

- [ ] Create `src/lib/config.ts`:

```typescript
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export interface Config {
  analysisRoot: string;
  dbPath: string;
  token: string;
  maxUploadBytes: number;
  llmProvider: "anthropic" | "openai";
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const analysisRoot = process.env.STOCK_SKILLS_ANALYSIS_ROOT
    ?? resolve(process.cwd(), "analysis");
  const dbPath = resolve(analysisRoot, "stock_skills.sqlite");
  const token = loadOrCreateToken(analysisRoot);

  if (!existsSync(analysisRoot)) mkdirSync(analysisRoot, { recursive: true });
  const artifactsDir = resolve(analysisRoot, "artifacts");
  if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

  _config = {
    analysisRoot,
    dbPath,
    token,
    maxUploadBytes: 50 * 1024 * 1024,
    llmProvider: (process.env.LLM_PROVIDER as "anthropic" | "openai") ?? "anthropic",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  };
  return _config;
}

function loadOrCreateToken(analysisRoot: string): string {
  const envToken = process.env.STOCK_SKILLS_TOKEN;
  if (envToken) return envToken;
  const tokenFile = resolve(analysisRoot, ".token");
  if (existsSync(tokenFile)) return readFileSync(tokenFile, "utf-8").trim();
  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenFile, token, "utf-8");
  return token;
}
```

- [ ] Create `src/lib/db/schema.ts` — Drizzle schema for all 14 tables (sessions, messages, research_goals, goal_criteria, goal_evidence, runs, artifacts, run_events, session_events, observations, decisions, lessons, data_sources). Use `sqliteTable`, `text`, `integer`, `real`. Include partial unique index for research_goals.
- [ ] Create `src/lib/db/index.ts`:

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import * as schema from "./schema.js";
import { getConfig } from "../config.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const config = getConfig();
  const sqlite = new Database(config.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function runMigrations() {
  const db = getDb();
  const migrationsFolder = resolve(import.meta.dirname ?? __dirname, "migrations");
  migrate(db, { migrationsFolder });
}

export type Database = ReturnType<typeof getDb>;
```

- [ ] Create `src/lib/db/migrate.ts`:

```typescript
import { runMigrations } from "./index.js";
runMigrations();
console.log("Migrations applied.");
```

- [ ] Generate migration: `pnpm db:generate`.
- [ ] Run migration: `pnpm db:migrate`.
- [ ] Commit:

```bash
git add src/lib/config.ts src/lib/db/
git commit -m "feat: add config, Drizzle schema (14 tables), and migration"
```

---

## Phase 1: Foundation

### Task 1.1: Artifact writer

**Files:**
- Create: `src/lib/runtime/artifact-writer.ts`
- Create: `tests/runtime/artifact-writer.test.ts`

- [ ] Write tests: write file under analysis root → succeeds with checksum; path traversal → throws; checksum matches SHA-256.
- [ ] Implement:

```typescript
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { getConfig } from "../config.js";

export function writeArtifact(
  runDir: string,
  filename: string,
  content: string | Buffer,
): { path: string; checksum: string; sizeBytes: number } {
  const config = getConfig();
  const fullPath = resolve(config.analysisRoot, "artifacts", runDir, filename);
  // Path boundary check
  const rel = relative(resolve(config.analysisRoot, "artifacts"), fullPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path traversal detected: ${filename}`);
  }
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  const buf = typeof content === "string" ? Buffer.from(content) : content;
  writeFileSync(fullPath, buf);
  const checksum = createHash("sha256").update(buf).digest("hex");
  return { path: fullPath, checksum, sizeBytes: buf.length };
}
```

- [ ] Run: `pnpm test tests/runtime/artifact-writer.test.ts`
- [ ] Commit:

```bash
git add src/lib/runtime/artifact-writer.ts tests/runtime/artifact-writer.test.ts
git commit -m "feat: implement artifact writer with path boundary and checksum"
```

---

### Task 1.2: Auth middleware

**Files:**
- Create: `src/lib/auth/middleware.ts`
- Create: `src/lib/auth/upload-guard.ts`
- Create: `tests/auth/security.test.ts`

- [ ] Write security tests: missing token → 401; wrong Origin → 403; missing X-Requested-With → 403; path traversal → 400; blocked extension → 422; oversized → 413.
- [ ] Implement `middleware.ts` — a helper function that Route Handlers call:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "../config.js";

export function validateAuth(req: NextRequest): NextResponse | null {
  const config = getConfig();
  const method = req.method;

  // GET requests pass without auth
  if (method === "GET" || method === "HEAD") return null;

  // Origin check
  const origin = req.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, req)) {
    return NextResponse.json({ error: "Forbidden: invalid Origin" }, { status: 403 });
  }

  // CSRF check
  const xrw = req.headers.get("x-requested-with");
  if (xrw !== "fetch") {
    return NextResponse.json({ error: "Forbidden: missing X-Requested-With" }, { status: 403 });
  }

  // Token check
  const auth = req.headers.get("authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token || token !== config.token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // valid
}

function isAllowedOrigin(origin: string, req: NextRequest): boolean {
  const url = new URL(req.url);
  return origin === `${url.protocol}//${url.host}`;
}
```

- [ ] Implement `upload-guard.ts` — size, path boundary, blocked extensions.
- [ ] Run: `pnpm test tests/auth/security.test.ts`
- [ ] Commit:

```bash
git add src/lib/auth/ tests/auth/security.test.ts
git commit -m "feat: implement auth middleware with Origin, CSRF, token, and upload guard"
```

---

### Task 1.3: Runtime — EventBus + RunManager + GoalManager

**Files:**
- Create: `src/lib/runtime/event-bus.ts`
- Create: `src/lib/runtime/run-manager.ts`
- Create: `src/lib/runtime/goal-manager.ts`

- [ ] Implement EventBus (same design as Vibe-Trading: session-scoped, 500-event buffer, emit/subscribe, `toSSE()` formatting).
- [ ] Implement RunManager: create run, transition status, record run_events.
- [ ] Implement GoalManager: create goal (supersede old active), add evidence, update status with expected_goal_id validation.
- [ ] Commit:

```bash
git add src/lib/runtime/
git commit -m "feat: implement EventBus, RunManager, and GoalManager"
```

---

### Task 1.4: Health endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] Implement:

```typescript
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  const config = getConfig();
  return NextResponse.json({
    status: "ok",
    version: "0.1.0",
    analysis_root: config.analysisRoot,
  });
}
```

- [ ] Test: `curl http://localhost:3000/api/health` returns JSON.
- [ ] Commit:

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add health endpoint"
```

---

## Phase 2: Adapters + Observations

### Task 2.1: Adapter interface + Registry + Fixture adapter

**Files:**
- Create: `src/lib/adapters/base.ts`
- Create: `src/lib/adapters/registry.ts`
- Create: `src/lib/adapters/fixture/index.ts`
- Create: `tests/fixtures/futu_nvda_snapshot.json`
- Create: `tests/adapters/fixture.test.ts`

- [ ] Define `DataSourceAdapter` interface in `base.ts`:

```typescript
export interface SourceHealth {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency_ms?: number;
  last_checked_at?: string;
  last_error?: string;
}

export interface AdapterRequest {
  operation: string;
  ticker?: string;
  market?: string;
  params?: Record<string, unknown>;
}

export interface RawResponse {
  data: unknown;
  latency_ms: number;
  source: string;
  operation: string;
  fetched_at: string;
}

export interface Observation {
  id: string;
  ticker: string;
  market?: string;
  category: string;
  source_name: string;
  observed_at?: string;
  fetched_at: string;
  freshness_expires_at?: string;
  status: "ok" | "degraded" | "unavailable" | "stale" | "failed";
  payload_json: string;
  raw_ref?: string;
  warnings_json?: string;
}

export interface DataSourceAdapter {
  name: string;
  healthCheck(): Promise<SourceHealth>;
  fetch(request: AdapterRequest): Promise<RawResponse>;
  normalize(raw: RawResponse): Observation[];
  capabilities(): string[];
}
```

- [ ] Implement AdapterRegistry: `register()`, `get()`, `list()`, `healthCheckAll()`.
- [ ] Create fixture adapter with canned NVDA data.
- [ ] Write fixture test.
- [ ] Commit:

```bash
git add src/lib/adapters/ tests/fixtures/ tests/adapters/
git commit -m "feat: add adapter interface, registry, and fixture adapter"
```

---

### Task 2.2: Observation store + freshness

**Files:**
- Create: `src/lib/observations/schemas.ts`
- Create: `src/lib/observations/store.ts`
- Create: `src/lib/observations/freshness.ts`
- Create: `tests/observations/store.test.ts`

- [ ] Implement category value schemas (Zod): quote, kline, technical, news, event, funding, capital_flow, order_book, options, valuation, financials, benchmark, source_health.
- [ ] Implement ObservationStore: `insert()`, `query()`, `getUnexpired()`.
- [ ] Implement freshness policy lookup table.
- [ ] Write tests.
- [ ] Commit:

```bash
git add src/lib/observations/ tests/observations/
git commit -m "feat: add observation store with category schemas and freshness policy"
```

---

### Task 2.3: TickerContext builder

**Files:**
- Create: `src/lib/views/ticker-context.ts`

- [ ] Implement: query SQLite for latest runs, unexpired observations, open decisions, due reviews, data gaps, source health → return `TickerContext` object.
- [ ] Commit:

```bash
git add src/lib/views/
git commit -m "feat: add TickerContext builder from SQLite"
```

---

## Phase 3: REST API + SSE

### Task 3.1: Sessions + Messages API

**Files:**
- Create: `src/app/api/sessions/route.ts` (POST/GET)
- Create: `src/app/api/sessions/[id]/route.ts` (GET/PATCH/DELETE)
- Create: `src/app/api/sessions/[id]/messages/route.ts` (POST/GET)
- Create: `src/app/api/sessions/[id]/cancel/route.ts`
- Create: `tests/api/sessions.test.ts`

- [ ] Implement all endpoints.
- [ ] `POST /api/sessions/:id/messages` saves message AND creates a run if context has ticker/skill_name.
- [ ] Write tests covering CRUD + schema validation.
- [ ] Commit:

```bash
git add src/app/api/sessions/ tests/api/sessions.test.ts
git commit -m "feat: implement sessions + messages API"
```

---

### Task 3.2: Goals + Evidence API

**Files:**
- Create: `src/app/api/sessions/[id]/goal/route.ts`
- Create: `src/app/api/sessions/[id]/goal/evidence/route.ts`
- Create: `src/app/api/sessions/[id]/goal/status/route.ts`
- Create: `tests/api/goals.test.ts`

- [ ] Implement goal CRUD + evidence + status.
- [ ] Write tests: stale expected_goal_id → 409; supersede old goal.
- [ ] Commit:

```bash
git add src/app/api/sessions/ tests/api/goals.test.ts
git commit -m "feat: implement goals + evidence API"
```

---

### Task 3.3: Runs + Artifacts API

**Files:**
- Create: `src/app/api/runs/route.ts`
- Create: `src/app/api/runs/[id]/route.ts`
- Create: `src/app/api/runs/[id]/cancel/route.ts`
- Create: `src/app/api/runs/[id]/artifacts/route.ts`
- Create: `src/app/api/runs/[id]/report/route.ts`
- Create: `src/app/api/uploads/route.ts`
- Create: `tests/api/runs.test.ts`

- [ ] Implement runs lifecycle + artifacts + report + upload.
- [ ] Write tests.
- [ ] Commit:

```bash
git add src/app/api/runs/ src/app/api/uploads/ tests/api/runs.test.ts
git commit -m "feat: implement runs + artifacts + upload API"
```

---

### Task 3.4: Ticker + DataSources + Reviews API

**Files:**
- Create: `src/app/api/tickers/[ticker]/context/route.ts`
- Create: `src/app/api/tickers/[ticker]/runs/route.ts`
- Create: `src/app/api/tickers/[ticker]/decisions/route.ts`
- Create: `src/app/api/tickers/[ticker]/lessons/route.ts`
- Create: `src/app/api/data-sources/health/route.ts`
- Create: `src/app/api/data-sources/check/route.ts`
- Create: `src/app/api/reviews/due/route.ts`
- Create: `src/app/api/decisions/route.ts`
- Create: `src/app/api/decisions/[id]/route.ts`
- Create: `src/app/api/lessons/route.ts`

- [ ] Implement all endpoints. Ticker context delegates to TickerContext builder.
- [ ] Commit:

```bash
git add src/app/api/tickers/ src/app/api/data-sources/ src/app/api/reviews/ src/app/api/decisions/ src/app/api/lessons/
git commit -m "feat: implement ticker context, data sources, reviews, decisions, and lessons API"
```

---

### Task 3.5: SSE event stream

**Files:**
- Create: `src/app/api/sessions/[id]/events/route.ts`
- Create: `tests/api/sse.test.ts`

- [ ] Implement SSE endpoint using Next.js `ReadableStream`:

```typescript
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const lastEventId = req.headers.get("Last-Event-ID")
    ?? req.nextUrl.searchParams.get("Last-Event-ID");
  const replay = req.nextUrl.searchParams.get("replay");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        controller.enqueue(encoder.encode(event.toSSE()));
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
      }, 30_000);

      // Replay missed events
      if (lastEventId) {
        const missed = eventBus.replay(sessionId, lastEventId);
        for (const event of missed) {
          controller.enqueue(encoder.encode(event.toSSE()));
        }
      }

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

- [ ] Write tests: event id present, heartbeat, Last-Event-ID replay.
- [ ] Commit:

```bash
git add src/app/api/sessions/[id]/events/route.ts tests/api/sse.test.ts
git commit -m "feat: implement SSE event stream with replay buffer and heartbeat"
```

---

## Phase 4: Agent Layer

### Task 4.1: LLM provider

**Files:**
- Create: `src/lib/agent/llm-provider.ts`

- [ ] Implement using Anthropic SDK:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";

let _client: Anthropic | null = null;

export function getLLMClient(): Anthropic {
  if (_client) return _client;
  const config = getConfig();
  _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
}
```

- [ ] Commit:

```bash
git add src/lib/agent/llm-provider.ts
git commit -m "feat: add LLM provider (Anthropic SDK)"
```

---

### Task 4.2: Skill loader + Context builder

**Files:**
- Create: `src/lib/agent/skill-loader.ts`
- Create: `src/lib/agent/context.ts`

- [ ] Implement SkillLoader: read `skills/agents/*/agent.yaml` + `prompt.md` + `output-contract.json`.
- [ ] Implement ContextBuilder: assemble session history + goal + ticker context + recent decisions/lessons for the agent.
- [ ] Commit:

```bash
git add src/lib/agent/skill-loader.ts src/lib/agent/context.ts
git commit -m "feat: add skill loader and context builder"
```

---

### Task 4.3: Tool registry

**Files:**
- Create: `src/lib/agent/tools.ts`

- [ ] Implement ToolRegistry using Anthropic SDK `tools` format:

```typescript
import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";

export function createTools(
  adapterRegistry: AdapterRegistry,
  artifactWriter: ArtifactWriter,
  goalManager: GoalManager,
  runId: string,
  sessionId: string,
): Tool[] {
  const tools: Tool[] = [];

  // Adapter tools: each adapter capability → Anthropic tool
  for (const adapter of adapterRegistry.list()) {
    for (const cap of adapter.capabilities()) {
      tools.push({
        name: `${adapter.name}_${cap.replace(/\./g, "_")}`,
        description: `${adapter.name}: ${cap}`,
        input_schema: {
          type: "object" as const,
          properties: {
            ticker: { type: "string", description: "Stock/crypto ticker" },
            market: { type: "string", description: "Market (US/HK/CN)" },
          },
        },
      });
    }
  }

  // System tools
  tools.push({
    name: "write_artifact",
    description: "Write a report, result, or other artifact for the current run",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: { type: "string" },
        content: { type: "string" },
        artifact_type: { type: "string", enum: ["report", "result", "sources", "decision"] },
      },
      required: ["filename", "content", "artifact_type"],
    },
  });

  tools.push({
    name: "update_goal_evidence",
    description: "Record evidence for the current research goal",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string" },
        criterion_id: { type: "string" },
        source_name: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["text"],
    },
  });

  return tools;
}
```

- [ ] Implement tool execution handler: dispatch to adapters, artifact writer, or goal manager.
- [ ] Commit:

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: implement tool registry with adapter + system tools"
```

---

### Task 4.4: AgentLoop — ReAct with Anthropic streaming

**Files:**
- Create: `src/lib/agent/loop.ts`
- Create: `tests/agent/loop.test.ts`

- [ ] Implement AgentLoop:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm-provider.js";
import { EventBus } from "../runtime/event-bus.js";

export interface AgentResult {
  status: "succeeded" | "failed";
  text?: string;
  error?: string;
}

export class AgentLoop {
  constructor(
    private client: Anthropic,
    private model: string,
    private systemPrompt: string,
    private tools: Anthropic.Tool[],
    private toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>,
    private eventBus: EventBus,
    private sessionId: string,
    private runId: string,
  ) {}

  async run(userMessage: string, history: Array<{ role: string; content: string }>): Promise<AgentResult> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: userMessage },
    ];

    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: this.systemPrompt,
        messages,
        tools: this.tools,
      });

      // Process tool use blocks
      const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
      const textBlocks = response.content.filter(b => b.type === "text");

      // Stream text deltas via SSE
      for (const block of textBlocks) {
        this.eventBus.emit(this.sessionId, "text_delta", { text: (block as any).text });
      }

      if (response.stop_reason === "end_turn") {
        // Agent is done
        const finalText = textBlocks.map(b => (b as any).text).join("\n");
        return { status: "succeeded", text: finalText };
      }

      if (response.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
        // Execute tools and continue
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolBlock of toolUseBlocks) {
          const tb = toolBlock as Anthropic.ToolUseBlock;
          this.eventBus.emit(this.sessionId, "tool_call", {
            tool: tb.name, arguments: tb.input, run_id: this.runId,
          });

          try {
            const result = await this.toolExecutor(tb.name, tb.input as Record<string, unknown>);
            this.eventBus.emit(this.sessionId, "tool_result", {
              tool: tb.name, status: "ok", run_id: this.runId,
            });
            toolResults.push({ tool_use_id: tb.id, content: result });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.eventBus.emit(this.sessionId, "tool_result", {
              tool: tb.name, status: "error", error: errorMsg, run_id: this.runId,
            });
            toolResults.push({ tool_use_id: tb.id, content: `Error: ${errorMsg}`, is_error: true });
          }
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      break;
    }

    return { status: "failed", error: "Max iterations reached" };
  }
}
```

- [ ] Write tests with mock Anthropic client.
- [ ] Commit:

```bash
git add src/lib/agent/loop.ts tests/agent/loop.test.ts
git commit -m "feat: implement AgentLoop with Anthropic SDK streaming and tool use"
```

---

### Task 4.5: Wire Agent into message handler

**Files:**
- Modify: `src/app/api/sessions/[id]/messages/route.ts`

- [ ] Update `POST` handler:

```typescript
// 1. Save user message to DB
// 2. Determine agent name from message context
// 3. Create run (status=running)
// 4. Load agent prompt via SkillLoader
// 5. Build context via ContextBuilder
// 6. Create tools via createTools()
// 7. Start AgentLoop as background task (don't await — let SSE stream results)
// 8. Return message + run_id immediately
```

- [ ] Background task completion: save assistant message, update run status, emit SSE events.
- [ ] Commit:

```bash
git add src/app/api/sessions/[id]/messages/route.ts
git commit -m "feat: wire AgentLoop into POST /messages — auto-trigger agent on message"
```

---

### Task 4.6: Progress coalescing + safety timeout

**Files:**
- Modify: `src/lib/agent/loop.ts`
- Modify: `src/lib/runtime/event-bus.ts`

- [ ] Add progress throttling: batch rapid events to 100ms intervals.
- [ ] Add safety timeout: 120s no events → warning; 300s → force cancel.
- [ ] Commit:

```bash
git add src/lib/agent/loop.ts src/lib/runtime/event-bus.ts
git commit -m "feat: add agent progress coalescing and safety timeout"
```

---

## Phase 5: Web UI

### Task 5.1: App Shell + Sidebar + Connection Banner

**Files:**
- Create: `src/app/layout.tsx` (modify default)
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/ConnectionBanner.tsx`
- Create: `src/hooks/useSSE.ts`
- Create: `src/hooks/useTheme.ts`
- Create: `src/stores/agent.ts`

- [ ] Implement root layout with providers (i18n, theme, zustand).
- [ ] Implement AppShell: sidebar (240px/48px collapsible) + main area + connection banner.
- [ ] Implement Sidebar: nav links (Research Desk, Dashboard, Data Sources, Reviews), sessions list, dark mode toggle, language switcher.
- [ ] Implement ConnectionBanner: yellow bar on SSE reconnecting.
- [ ] Implement useSSE hook (reconnect, LRU dedup, Last-Event-ID).
- [ ] Implement useTheme hook (localStorage + prefers-color-scheme).
- [ ] Implement Zustand agent store.
- [ ] Commit:

```bash
git add src/app/layout.tsx src/components/layout/ src/hooks/ src/stores/
git commit -m "feat: implement App Shell, Sidebar, SSE hook, theme, and agent store"
```

---

### Task 5.2: Research Desk page

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/research/Timeline.tsx`
- Create: `src/components/research/MessageBubble.tsx`
- Create: `src/components/research/ThinkingTimeline.tsx`
- Create: `src/components/research/Composer.tsx`
- Create: `src/components/research/WelcomeScreen.tsx`
- Create: `src/components/research/ContextChips.tsx`
- Create: `src/components/research/RunCard.tsx`
- Create: `src/components/research/ArtifactCard.tsx`
- Create: `src/components/research/SourceWarning.tsx`
- Create: `src/components/research/GoalChip.tsx`

- [ ] Implement Research Desk as default page (`/`).
- [ ] Implement Timeline: message grouping (single vs timeline), merged with run events.
- [ ] Implement Composer: textarea + Enter/Shift+Enter + Stop + `+` menu.
- [ ] Implement all research components.
- [ ] Wire SSE event handlers.
- [ ] Commit:

```bash
git add src/app/page.tsx src/components/research/
git commit -m "feat: implement Research Desk with timeline, composer, and context chips"
```

---

### Task 5.3: i18n initialization

**Files:**
- Create: `src/i18n/index.ts`
- Create: `src/i18n/locales/zh-CN/common.json`
- Create: `src/i18n/locales/zh-CN/research.json`
- Create: `src/i18n/locales/en-US/common.json`
- Create: `src/i18n/locales/en-US/research.json`

- [ ] Initialize react-i18next with LanguageDetector, zh-CN default.
- [ ] Create common + research namespace translations.
- [ ] Commit:

```bash
git add src/i18n/
git commit -m "feat: initialize i18n with zh-CN/en-US common + research namespaces"
```

---

### Task 5.4: Run Detail page

**Files:**
- Create: `src/app/runs/[runId]/page.tsx`
- Create: `src/components/run/ReportTab.tsx`
- Create: `src/components/run/ResultTab.tsx`
- Create: `src/components/run/SourcesTab.tsx`
- Create: `src/components/run/LogsTab.tsx`
- Create: `src/components/run/TrustPanel.tsx`

- [ ] Implement Run Detail with tabs (Report, Result JSON, Sources, Logs, Trust).
- [ ] Implement each tab component.
- [ ] Trust Panel: schema version, checksums, warnings.
- [ ] Commit:

```bash
git add src/app/runs/ src/components/run/
git commit -m "feat: implement Run Detail page with tabs and trust panel"
```

---

### Task 5.5: Dashboard, Ticker Page, Data Sources, Review Queue

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/tickers/[ticker]/page.tsx`
- Create: `src/app/data-sources/page.tsx`
- Create: `src/app/reviews/page.tsx`
- Create: `src/components/dashboard/RunsTable.tsx`
- Create: `src/components/dashboard/SourceHealthGrid.tsx`
- Create: `src/components/dashboard/DueReviewsList.tsx`
- Create: `src/components/common/DataTable.tsx`
- Create: `src/components/common/Skeleton.tsx`
- Create: `src/components/common/ErrorBoundary.tsx`

- [ ] Implement all pages.
- [ ] Commit:

```bash
git add src/app/dashboard/ src/app/tickers/ src/app/data-sources/ src/app/reviews/ src/components/dashboard/ src/components/common/
git commit -m "feat: implement Dashboard, Ticker Page, Data Sources, and Review Queue"
```

---

### Task 5.6: i18n namespace completion

**Files:**
- Create: `src/i18n/locales/zh-CN/dashboard.json`
- Create: `src/i18n/locales/zh-CN/ticker.json`
- Create: `src/i18n/locales/zh-CN/run.json`
- Create: `src/i18n/locales/zh-CN/sources.json`
- Create: `src/i18n/locales/zh-CN/reviews.json`
- (Same for en-US)

- [ ] Complete all namespace files.
- [ ] Verify all pages use `useTranslation()`.
- [ ] Commit:

```bash
git add src/i18n/
git commit -m "feat: complete i18n namespaces for all pages"
```

---

## Phase 6: Skill Integration

### Task 6.1: Output Contract docs

**Files:**
- Modify: `skills/stock/stock-analyzer/SKILL.md`
- Modify: `skills/core/trading-debate/SKILL.md`
- Modify: `skills/stock/market-scanner/SKILL.md`

- [ ] Append "## Runtime Output Contract" section to each skill.
- [ ] Commit:

```bash
git add skills/stock/stock-analyzer/SKILL.md skills/core/trading-debate/SKILL.md skills/stock/market-scanner/SKILL.md
git commit -m "docs(skills): add Runtime Output Contract to core skills"
```

---

## Execution Order

```
Phase 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5
Phase 1: [1.1, 1.2] → 1.3 → 1.4
Phase 2: [2.1, 2.2] → 2.3
Phase 3: [3.1, 3.2] → 3.3 → [3.4, 3.5]
Phase 4: [4.1, 4.2] → 4.3 → 4.4 → 4.5 → 4.6
Phase 5: 5.1 → [5.2, 5.3] → [5.4, 5.5] → 5.6
Phase 6: 6.1
```

**Critical path:** 0.1 → 0.3 → 0.5 → 1.1 → 1.3 → 3.1 → 3.3 → 4.1 → 4.3 → 4.4 → 4.5

**Total:** 26 tasks, ~6-10 hours agentic execution.

---

## Adversarial Review Revisions (2026-05-30)

Three parallel adversarial reviews (Technical Architect, Product Manager, UX Designer) identified issues. All revisions below are **mandatory** and override the original plan sections.

### R1: TaskRunner — AgentLoop 生命周期管理 [架构师 P0]

**问题：** AgentLoop 不能直接放在 Route Handler 中 fire-and-forget。Next.js 的请求生命周期不可靠。

**修正：** 新增 `src/lib/agent/task-runner.ts`，在 Task 4.3 和 4.4 之间插入 **Task 4.3b: TaskRunner**:

```typescript
// src/lib/agent/task-runner.ts
export class TaskRunner {
  private tasks = new Map<string, AbortController>();
  private maxConcurrent = 2;

  enqueue(runId: string, fn: (signal: AbortSignal) => Promise<void>) {
    if (this.tasks.size >= this.maxConcurrent) {
      throw new Error("Max concurrent tasks reached");
    }
    const ac = new AbortController();
    this.tasks.set(runId, ac);

    // 10 minute timeout
    const timeout = setTimeout(() => ac.abort(), 10 * 60 * 1000);

    fn(ac.signal).finally(() => {
      clearTimeout(timeout);
      this.tasks.delete(runId);
    });
  }

  cancel(runId: string): boolean {
    const ac = this.tasks.get(runId);
    if (ac) { ac.abort(); this.tasks.delete(runId); return true; }
    return false;
  }

  isRunning(runId: string): boolean {
    return this.tasks.has(runId);
  }
}

export const taskRunner = new TaskRunner(); // singleton
```

**Task 4.5 Wire Agent** 改为：`POST /messages` → 保存 message → `taskRunner.enqueue()` → 立即返回 200。不 await AgentLoop。

### R2: AgentLoop 必须使用流式 API [架构师 P1]

**问题：** 原始代码用 `this.client.messages.create()`（非流式），前端无实时反馈。

**修正：** Task 4.4 的 AgentLoop 代码改为 `this.client.messages.create({ stream: true })`（或 `.stream()` 方法），逐 token 推 `text_delta` SSE 事件。完整流式代码见 spec 的 Agent 执行架构章节。

关键变更：
- 非流式 `await this.client.messages.create(...)` → 流式 `this.client.messages.stream(...)`
- `for await (const event of stream)` 处理 `content_block_delta` 事件
- `AbortController` 支持取消（从 TaskRunner 传入 signal）

### R3: SQLite busy_timeout [架构师 P2]

**修正：** 在 `src/lib/db/index.ts` 的 `getDb()` 中添加：

```typescript
sqlite.pragma("busy_timeout = 5000"); // 5秒重试
```

### R4: SSE replay buffer 过滤 [架构师 P2]

**修正：** `src/lib/runtime/event-bus.ts` 的 `emit()` 方法中，只有以下事件类型进入 replay buffer：
- `run.created`, `run.updated`, `artifact.created`, `goal.created`, `goal.evidence`, `goal.updated`, `error`

以下事件**不进 replay buffer**（实时流，断线即失）：
- `text_delta`, `tool_call`, `tool_result`, `thinking_done`, `tool_progress`, `heartbeat`

客户端重连时如果 replay buffer 为空或缺失，从 `GET /messages` + `GET /runs` 重建 timeline。

### R5: 信息架构简化 [设计师]

**修正：**
- 砍掉 `/dashboard` 路由。Dashboard 组件（RunsTable, SourceHealthGrid, DueReviewsList）改用于 Research Desk sidebar 的 Overview 区。
- Run Detail 从 6 tabs → 3 tabs：**Report**（Markdown + JSON toggle）| **Data**（sources + artifacts + trust summary bar）| **Logs**
- Composer `+` menu 简化为 3 项：Upload / Attach context / Set goal
- Workflow 选择改为 composer 下方按钮行：`[Analyze]` `[Debate]` `[Scan]` `[Review]`
- Session list 用右键 context menu 替代 hover-reveal
- Dark mode 默认 dark（金融终端惯例）
- Timeline 引入 Turn 折叠：一轮对话打包为可折叠单元，默认展开最新 2 个

### R6: Python 残留清理 [架构师 次要]

**修正：** Phase 0 Task 0.1 中，skills 迁移后，删除以下 Python 文件：
- `pyproject.toml`
- `server/__init__.py`
- `server/api/__init__.py`

### R7: 代码修正 [架构师 次要]

- `src/lib/utils.ts`：`import { tailwindMerge }` → `import { twMerge } from "tailwind-merge"`
- DB init 加 `sqlite.pragma("busy_timeout = 5000")`

### 执行顺序更新

```
Phase 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5
Phase 1: [1.1, 1.2] → 1.3 → 1.4
Phase 2: [2.1, 2.2] → 2.3
Phase 3: [3.1, 3.2] → 3.3 → [3.4, 3.5]
Phase 4: [4.1, 4.2] → 4.3 → 4.3b(TaskRunner) → 4.4 → 4.5 → 4.6
Phase 5: 5.1 → [5.2, 5.3] → [5.4, 5.5] → 5.6
Phase 6: 6.1
```
