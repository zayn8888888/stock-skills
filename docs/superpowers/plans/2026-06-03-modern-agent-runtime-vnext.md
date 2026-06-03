# Modern Agent Runtime vNext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed API/SSE/DB/runner path with a debt-free vNext runtime: canonical DB, `RuntimeCommand`, `RuntimeEvent`, modern OpenAI Agents + Mastra runners, AG-UI projection, and no old REST/SSE/Pi hot-path fallback.

**Architecture:** The app stays a localhost-first Next.js/TypeScript Research Desk. All writes enter through `RuntimeCommandService`; all state changes are persisted as append-only `runtime_events`; UI consumes only `event: runtime.event`; AG-UI is an external protocol projection; old DB tables are migration input only.

**Tech Stack:** Next.js 15, React 19, Zustand, Drizzle, SQLite/better-sqlite3, Vitest, Biome, `@openai/agents`, `@mastra/core`, `@ag-ui/core`, `@ag-ui/client`, native TypeScript Futu/OpenD adapter.

---

## References

- Spec: `docs/superpowers/specs/2026-06-02-research-runtime-protocol-refactor-design.md`
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk/
- OpenAI AgentKit / agent guidance: https://platform.openai.com/docs/guides/agents
- AG-UI introduction: https://docs.ag-ui.com/introduction
- AG-UI JS core events: https://docs.ag-ui.com/sdk/js/core/events
- Mastra framework: https://mastra.ai/framework

## Hard Rules

- No `LegacyRestAdapter`, `LegacySseAdapter`, or `LegacyPiRunnerAdapter`.
- No server-sent `text_delta`, `thinking_delta`, `tool_call`, `tool_result`, or `run.updated`.
- No runtime import of `src/lib/agent/pi-runner.ts`, `src/lib/agent/pi-tools.ts`, or `@earendil-works/pi-*`.
- Old SQLite tables can be read only by migration scripts and fixture tests.
- Frontend reducer accepts only canonical `RuntimeEvent`.
- Old API paths are deleted after their callers move to canonical routes; do not leave wrappers.

## File Map

Create:

- `src/lib/runtime/events.ts` - `RuntimeEvent` type union, Zod validators, builders.
- `src/lib/runtime/commands.ts` - `RuntimeCommand` type union, validators, idempotency helpers.
- `src/lib/runtime/state-machine.ts` - run/tool/message transition guards.
- `src/lib/runtime/store.ts` - `RuntimeStore` interface and transaction boundary.
- `src/lib/runtime/repositories.ts` - Drizzle repositories for canonical tables.
- `src/lib/runtime/event-log.ts` - append/query event log service.
- `src/lib/runtime/command-service.ts` - canonical mutating command handler.
- `src/lib/runtime/research-runtime.ts` - run orchestration and runner coordination.
- `src/lib/runtime/projectors.ts` - runtime SSE, AG-UI, timeline projections.
- `src/lib/runtime/timeline.ts` - session/run timeline query service.
- `src/lib/runtime/no-debt.ts` - central allowlists for migration-only old symbols.
- `src/lib/runners/base.ts` - `RunnerAdapter`, `RunnerContext`, `RuntimeEventSink`.
- `src/lib/runners/mock.ts` - deterministic test runner.
- `src/lib/runners/openai-agents.ts` - OpenAI Agents SDK runner.
- `src/lib/runners/mastra-workflow.ts` - Mastra workflow runner.
- `src/lib/runners/registry.ts` - runner provider registry and selection.
- `src/lib/ag-ui/projector.ts` - `RuntimeEvent` -> AG-UI events.
- `src/lib/ag-ui/command.ts` - AG-UI input -> `RuntimeCommand`.
- `src/lib/artifacts/service.ts` - artifact metadata and file write service.
- `src/lib/migrations/vnext-importer.ts` - old DB -> vNext importer, not imported by app routes.
- `src/lib/migrations/vnext-consistency.ts` - post-import checks.
- `scripts/backup-analysis.ts` - SQLite/artifact backup helper.
- `scripts/migrate-vnext.ts` - CLI entrypoint for importer and checker.
- `scripts/check-no-runtime-debt.ts` - guard for deleted hot-path symbols.
- `src/app/api/runtime/commands/route.ts` - only mutating endpoint.
- `src/app/api/runs/[id]/events/route.ts` - run event query.
- `src/app/api/runs/[id]/timeline/route.ts` - run detail read model.
- `src/app/api/sessions/[id]/timeline/route.ts` - session timeline read model.
- `src/app/api/ag-ui/research/route.ts` - AG-UI endpoint.
- `src/stores/runtime-reducer.ts` - canonical client reducer.
- `tests/runtime/events.test.ts`
- `tests/runtime/commands.test.ts`
- `tests/runtime/state-machine.test.ts`
- `tests/runtime/store.test.ts`
- `tests/runtime/event-log.test.ts`
- `tests/runtime/command-service.test.ts`
- `tests/runtime/projectors.test.ts`
- `tests/runtime/timeline.test.ts`
- `tests/runtime/no-runtime-debt.test.ts`
- `tests/runners/mock.test.ts`
- `tests/runners/openai-agents.test.ts`
- `tests/runners/mastra-workflow.test.ts`
- `tests/ag-ui/projector.test.ts`
- `tests/migrations/backup-analysis.test.ts`
- `tests/migrations/vnext-importer.test.ts`
- `tests/e2e/research-runtime.spec.ts`

Modify:

- `package.json` - add modern deps and scripts; remove Pi deps at final cleanup.
- `src/lib/db/schema.ts` - replace old event schema with vNext canonical schema.
- `src/lib/db/migrate.ts` - run vNext migrations and seed runner providers.
- `src/lib/runtime/event-bus.ts` - typed event bus only.
- `src/lib/runtime/artifact-writer.ts` - delegate to `ArtifactService` or delete after migration.
- `src/lib/data-source/router.ts` - emit provenance events through `RuntimeEventSink`.
- `src/lib/adapters/futu/index.ts` - expose typed health/provenance without Python scripts.
- `src/hooks/useSSE.ts` - subscribe to canonical `runtime.event` only.
- `src/stores/agent.ts` - replace ad hoc event updates with canonical normalized state.
- `src/app/page.tsx` - call `/api/runtime/commands` and render selector-derived timeline.
- `src/app/api/sessions/[id]/events/route.ts` - canonical SSE endpoint.
- `tests/sse.test.ts`, `tests/event-bus.test.ts`, `tests/use-sse.test.ts`, `tests/agent-store.test.ts` - rewrite around vNext.

Delete before final verification:

- `src/app/api/sessions/[id]/messages/route.ts`
- `src/app/api/sessions/[id]/tool-events/route.ts`
- `src/app/api/sessions/[id]/cancel/route.ts`
- `src/app/api/runs/[id]/cancel/route.ts`
- `src/app/api/runs/[id]/artifacts/route.ts`; replace it with run timeline artifact projection or a canonical `src/app/api/artifacts/[id]/route.ts` if direct artifact downloads are still needed.
- `src/lib/agent/pi-runner.ts`
- `src/lib/agent/pi-tools.ts`
- `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` from `package.json`.

## Task 0: Baseline Backup And Fixtures

**Files:**

- Create: `scripts/backup-analysis.ts`
- Create: `tests/migrations/backup-analysis.test.ts`
- Create: `tests/fixtures/runtime-v0/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add backup script test**

Create a Vitest test that runs the backup helper against a temporary SQLite file and temporary artifact directory.

```ts
import { describe, expect, it } from "vitest";
import { backupAnalysis } from "../../scripts/backup-analysis";

describe("backupAnalysis", () => {
  it("copies sqlite and artifacts into a timestamped backup directory", async () => {
    const result = await backupAnalysis({ dryRun: true });
    expect(result.backupDir).toContain("analysis/backups/");
    expect(result.files).toContain("sqlite");
    expect(result.files).toContain("artifacts");
  });
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm vitest run tests/migrations/backup-analysis.test.ts`

Expected: FAIL because `scripts/backup-analysis.ts` does not exist.

- [ ] **Step 3: Implement `scripts/backup-analysis.ts`**

Implementation requirements:

- Export `backupAnalysis(options?: { dryRun?: boolean })`.
- Default DB source should match existing app config.
- Backup target: `analysis/backups/<iso-timestamp>/`.
- Copy SQLite and `analysis/artifacts`.
- Never print `.env` values.

- [ ] **Step 4: Add script entry**

Add to `package.json`:

```json
"analysis:backup": "tsx scripts/backup-analysis.ts"
```

- [ ] **Step 5: Verify**

Run: `pnpm vitest run tests/migrations/backup-analysis.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/backup-analysis.ts tests/migrations/backup-analysis.test.ts tests/fixtures/runtime-v0/README.md
git commit -m "chore(runtime): add vnext backup baseline"
```

## Task 1: Dependencies And No-Debt Guard

**Files:**

- Modify: `package.json`
- Create: `src/lib/runtime/no-debt.ts`
- Create: `scripts/check-no-runtime-debt.ts`
- Create: `tests/runtime/no-runtime-debt.test.ts`

- [ ] **Step 1: Add dependency change**

Add:

```json
"@openai/agents": "^0.11.6",
"@mastra/core": "^1.37.1",
"@ag-ui/core": "^0.0.54",
"@ag-ui/client": "^0.0.54",
"ai": "^6.0.194"
```

Keep Pi deps only until Task 11 deletes runtime imports. Do not add new code that imports them.

- [ ] **Step 2: Add no-debt test first**

`tests/runtime/no-runtime-debt.test.ts` should scan runtime and route files. During Tasks 1-10 it uses a narrow temporary allowlist for existing old files; Task 11 removes that allowlist and runs strict mode.

```ts
import { describe, expect, it } from "vitest";
import { checkNoRuntimeDebt } from "../../scripts/check-no-runtime-debt";

describe("runtime no-debt guard", () => {
  it("keeps new runtime files free of old protocol and Pi imports", async () => {
    const result = await checkNoRuntimeDebt({ strict: false });
    expect(result.violations).toEqual([]);
  });
});
```

This test must PASS in Task 1. It should fail only when new vNext files introduce old route wrappers, old event names, Pi runtime imports, or legacy adapter class names.

- [ ] **Step 3: Add CLI guard**

`src/lib/runtime/no-debt.ts` should define:

- `FORBIDDEN_RUNTIME_PATTERNS`
- `TEMPORARY_OLD_FILE_ALLOWLIST`
- `MIGRATION_ONLY_ALLOWLIST`

`scripts/check-no-runtime-debt.ts` should:

- Search `src/app`, `src/lib`, `tests`.
- Ignore `src/lib/migrations`, `tests/fixtures`, and this plan/spec.
- In default mode, allow only known pre-existing old files.
- In `--strict` mode, allow only migration fixtures and docs.
- Fail on old route wrappers, old event names, Pi runtime imports, and legacy adapter class names outside the active allowlist.

- [ ] **Step 4: Add script entry**

```json
"runtime:no-debt": "tsx scripts/check-no-runtime-debt.ts",
"runtime:no-debt:strict": "tsx scripts/check-no-runtime-debt.ts --strict"
```

- [ ] **Step 5: Install**

Run: `pnpm install`

Expected: lockfile updates successfully.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/runtime/no-debt.ts scripts/check-no-runtime-debt.ts tests/runtime/no-runtime-debt.test.ts
git commit -m "chore(runtime): add modern agent dependencies"
```

## Task 2: DB vNext Schema And RuntimeStore

**Files:**

- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/migrate.ts`
- Create: `src/lib/runtime/store.ts`
- Create: `src/lib/runtime/repositories.ts`
- Create: `tests/runtime/store.test.ts`

- [ ] **Step 1: Write schema test**

Assert the vNext schema exports these tables:

- `appMeta`
- `commandLog`
- `runtimeEvents`
- `toolCalls`
- `runnerProviders`
- `runnerRuns`
- vNext versions of `sessions`, `messages`, `runs`, `artifacts`, goals, observations, data source tables.

Run: `pnpm vitest run tests/runtime/store.test.ts`

Expected: FAIL because exports do not exist.

- [ ] **Step 2: Replace schema with vNext shape**

In `src/lib/db/schema.ts`:

- Keep table names for stable core entities where useful: `sessions`, `messages`, `runs`, `artifacts`.
- Remove `runEvents` and `sessionEvents` runtime exports.
- Add `runtimeEvents` with envelope fields:
  - `id`, `sessionId`, `runId`, `seq`, `type`, `category`, `producer`, `correlationId`, `idempotencyKey`, `visibility`, `payloadJson`, `schemaVersion`, `createdAt`.
- Add `commandLog`.
- Add `toolCalls`.
- Add `runnerProviders` and `runnerRuns`.
- Add artifact metadata: `sha256`, `sizeBytes`, `schemaVersion`, `producer`, `sourceEventId`.
- Promote `runs.metadata` fields into queryable columns: `ticker`, `market`, `workflowType`, `intentJson`, `status`.
- Use vNext statuses: `queued`, `running`, `waiting_for_input`, `cancelling`, `succeeded`, `failed`, `cancelled`.

- [ ] **Step 3: Implement `RuntimeStore`**

`src/lib/runtime/store.ts` should define:

```ts
export interface RuntimeStore {
  transaction<T>(fn: (tx: RuntimeStoreTx) => Promise<T> | T): Promise<T>;
  sessions: SessionRepository;
  messages: MessageRepository;
  runs: RunRepository;
  events: RuntimeEventRepository;
  tools: ToolCallRepository;
  artifacts: ArtifactRepository;
  runners: RunnerRepository;
}
```

- [ ] **Step 4: Implement Drizzle repositories**

`src/lib/runtime/repositories.ts` should:

- Accept a Drizzle database instance.
- Expose small repository methods, not raw Drizzle access.
- Parse/stringify JSON centrally.
- Not import any runner or API route.

- [ ] **Step 5: Seed runner providers**

`src/lib/db/migrate.ts` should seed:

- `openai-agents`
- `mastra`
- `mock`

Do not seed `legacy-pi`.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm db:migrate
pnpm vitest run tests/runtime/store.test.ts
```

Expected: migration succeeds; test PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrate.ts src/lib/runtime/store.ts src/lib/runtime/repositories.ts tests/runtime/store.test.ts
git commit -m "feat(runtime): introduce vnext store schema"
```

## Task 3: Importer And Consistency Checker

**Files:**

- Create: `src/lib/migrations/vnext-importer.ts`
- Create: `src/lib/migrations/vnext-consistency.ts`
- Create: `scripts/migrate-vnext.ts`
- Modify: `tests/migrations/vnext-importer.test.ts`

- [ ] **Step 1: Write importer mapping tests**

Use fixture rows for old statuses:

```ts
expect(mapOldRunStatus("pending")).toBe("queued");
expect(mapOldRunStatus("success")).toBe("succeeded");
expect(mapOldRunEvent("tool_use").type).toBe("tool.call.updated");
```

Run: `pnpm vitest run tests/migrations/vnext-importer.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement importer**

Requirements:

- Read old SQLite through a separate connection.
- Map old `sessions`, `messages`, `runs`, `run_events`, `session_events`, `artifacts`, observations, decisions, lessons, goals, and data-source rows.
- Write only through `RuntimeStore`.
- Assign deterministic ids in tests.
- Convert old run/session event rows into `runtime_events`.
- Do not export importer from app runtime barrels.

- [ ] **Step 3: Implement consistency checker**

Checks:

- Every message has a session.
- Every run has a session.
- Every terminal run has terminal runtime event.
- Every artifact has existing run/session.
- `runtime_events.seq` is contiguous per session.
- `tool_calls` can be rebuilt from event log.

- [ ] **Step 4: Implement CLI**

`scripts/migrate-vnext.ts` should support:

```bash
pnpm tsx scripts/migrate-vnext.ts --dry-run
pnpm tsx scripts/migrate-vnext.ts --backup --apply
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm vitest run tests/migrations/vnext-importer.test.ts
pnpm tsx scripts/migrate-vnext.ts --dry-run
```

Expected: tests PASS; dry-run prints counts and consistency summary without mutating the active DB.

- [ ] **Step 6: Commit**

```bash
git add src/lib/migrations/vnext-importer.ts src/lib/migrations/vnext-consistency.ts scripts/migrate-vnext.ts tests/migrations/vnext-importer.test.ts
git commit -m "feat(runtime): add vnext importer"
```

## Task 4: RuntimeEvent, Commands, And State Machine

**Files:**

- Create: `src/lib/runtime/events.ts`
- Create: `src/lib/runtime/commands.ts`
- Create: `src/lib/runtime/state-machine.ts`
- Create: `src/lib/runtime/event-log.ts`
- Create: `tests/runtime/events.test.ts`
- Create: `tests/runtime/commands.test.ts`
- Create: `tests/runtime/state-machine.test.ts`
- Create: `tests/runtime/event-log.test.ts`

- [ ] **Step 1: Write event tests**

Test a minimal envelope:

```ts
const event = createRuntimeEvent({
  sessionId: "session_1",
  runId: "run_1",
  type: "run.started",
  category: "run",
  payload: { status: "running" },
});

expect(RuntimeEventSchema.parse(event).schemaVersion).toBe("runtime-event.v1");
```

Run: `pnpm vitest run tests/runtime/events.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement event union**

Minimum event types:

- `transport.connected`
- `transport.heartbeat`
- `runtime.snapshot`
- `session.message.created`
- `run.created`
- `run.started`
- `run.status_changed`
- `run.completed`
- `run.cancel_requested`
- `model.text.delta`
- `model.text.completed`
- `model.reasoning.delta`
- `tool.call.created`
- `tool.call.args_delta`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `artifact.created`
- `data.source.selected`
- `data.source.failed_over`
- `error.created`

- [ ] **Step 3: Write command tests**

Test idempotency and source:

```ts
expect(() => RuntimeCommandSchema.parse({ type: "run.start" })).toThrow();
expect(command.source).toBe("research_desk");
```

- [ ] **Step 4: Implement command union**

Minimum commands:

- `session.create`
- `session.message.append_user`
- `run.start`
- `run.cancel`
- `run.resume`
- `goal.add`
- `goal.evidence.add`
- `artifact.submit`

- [ ] **Step 5: Write state machine tests**

Include invalid transitions:

```ts
expect(() => assertRunTransition("succeeded", "running")).toThrow("invalid transition");
expect(assertRunTransition("queued", "running")).toBeUndefined();
```

- [ ] **Step 6: Implement event log**

`RuntimeEventLog.append()` must:

- Generate session-scoped monotonic `seq`.
- Persist event in `runtime_events`.
- Update read models in the same transaction where required.
- Publish to EventBus after commit.

- [ ] **Step 7: Verify**

Run: `pnpm vitest run tests/runtime/events.test.ts tests/runtime/commands.test.ts tests/runtime/state-machine.test.ts tests/runtime/event-log.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/runtime/events.ts src/lib/runtime/commands.ts src/lib/runtime/state-machine.ts src/lib/runtime/event-log.ts tests/runtime/events.test.ts tests/runtime/commands.test.ts tests/runtime/state-machine.test.ts tests/runtime/event-log.test.ts
git commit -m "feat(runtime): define canonical protocol"
```

## Task 5: CommandService And ResearchRuntime

**Files:**

- Create: `src/lib/runtime/command-service.ts`
- Create: `src/lib/runtime/research-runtime.ts`
- Create: `tests/runtime/command-service.test.ts`
- Modify: `src/lib/runtime/run-manager.ts` or delete after migration.
- Modify: `src/lib/runtime/goal-manager.ts` to use command/event services.

- [ ] **Step 1: Write command service tests**

Cases:

- Append user message creates message and run when `startRun` is true.
- Reusing idempotency key returns prior command result.
- Invalid run transition emits `error.created`.

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/runtime/command-service.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `RuntimeCommandService`**

Responsibilities:

- Auth already handled by routes; service validates command shape.
- Uses `command_log` for idempotency.
- Creates messages/runs through repositories.
- Delegates run execution to `ResearchRuntime`.
- Returns canonical command result.

- [ ] **Step 4: Implement `ResearchRuntime`**

Responsibilities:

- Select runner from registry.
- Create `RuntimeEventSink`.
- Manage AbortController, timeout, cancellation.
- Translate runner events into `RuntimeEvent`.
- Never import `EventBus` directly except through `RuntimeEventLog`.
- Never write Drizzle directly.

- [ ] **Step 5: Verify**

Run: `pnpm vitest run tests/runtime/command-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/runtime/command-service.ts src/lib/runtime/research-runtime.ts src/lib/runtime/run-manager.ts src/lib/runtime/goal-manager.ts tests/runtime/command-service.test.ts
git commit -m "feat(runtime): route writes through command service"
```

## Task 6: Typed EventBus, SSE, And Canonical API

**Files:**

- Modify: `src/lib/runtime/event-bus.ts`
- Create: `src/lib/runtime/projectors.ts`
- Create: `src/lib/runtime/timeline.ts`
- Modify: `src/app/api/sessions/[id]/events/route.ts`
- Create: `src/app/api/runtime/commands/route.ts`
- Create: `src/app/api/runs/[id]/events/route.ts`
- Create: `src/app/api/runs/[id]/timeline/route.ts`
- Create: `src/app/api/sessions/[id]/timeline/route.ts`
- Modify: `tests/event-bus.test.ts`
- Modify: `tests/sse.test.ts`
- Create: `tests/runtime/projectors.test.ts`
- Create: `tests/runtime/timeline.test.ts`

- [ ] **Step 1: Write SSE encoding tests**

Assert:

```ts
expect(formatSse(event)).toContain("event: runtime.event");
expect(formatSse(event)).not.toContain("event: text_delta");
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/event-bus.test.ts tests/sse.test.ts tests/runtime/projectors.test.ts`

Expected: FAIL because old event types are still emitted/buffered.

- [ ] **Step 3: Type `EventBus`**

Changes:

- `emit(sessionId, event: RuntimeEvent)` only.
- Buffer only canonical runtime events plus transport events.
- `replay(sessionId, lastSeq)`.
- `replayActiveRun(sessionId)` returns `runtime.snapshot` or recent canonical events.
- No string event names outside `RuntimeEvent.type`.

- [ ] **Step 4: Implement canonical route**

`src/app/api/runtime/commands/route.ts`:

- Auth with current local token guard.
- Parse `RuntimeCommandSchema`.
- Call `RuntimeCommandService.handle`.
- Return canonical JSON result.

- [ ] **Step 5: Rewrite session SSE**

`src/app/api/sessions/[id]/events/route.ts`:

- Auth.
- Subscribe to typed EventBus.
- Write only:

```text
id: <seq>
event: runtime.event
data: <RuntimeEvent JSON>
```

- Native `EventSource.onerror` remains transport-only client state.

- [ ] **Step 6: Add timeline routes**

Implement query-only route handlers:

- `GET /api/sessions/:id/timeline`
- `GET /api/runs/:id/timeline`
- `GET /api/runs/:id/events`

They must not start/cancel runs.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm vitest run tests/event-bus.test.ts tests/sse.test.ts tests/runtime/projectors.test.ts tests/runtime/timeline.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/runtime/event-bus.ts src/lib/runtime/projectors.ts src/lib/runtime/timeline.ts src/app/api/runtime/commands/route.ts src/app/api/sessions/[id]/events/route.ts src/app/api/runs/[id]/events/route.ts src/app/api/runs/[id]/timeline/route.ts src/app/api/sessions/[id]/timeline/route.ts tests/event-bus.test.ts tests/sse.test.ts tests/runtime/projectors.test.ts tests/runtime/timeline.test.ts
git commit -m "feat(runtime): expose canonical api and sse"
```

## Task 7: Modern Runners

**Files:**

- Create: `src/lib/runners/base.ts`
- Create: `src/lib/runners/mock.ts`
- Create: `src/lib/runners/openai-agents.ts`
- Create: `src/lib/runners/mastra-workflow.ts`
- Create: `src/lib/runners/registry.ts`
- Create: `tests/runners/mock.test.ts`
- Create: `tests/runners/openai-agents.test.ts`
- Create: `tests/runners/mastra-workflow.test.ts`
- Modify: `src/lib/agent/llm-provider.ts` if provider config needs centralization.

- [ ] **Step 1: Write `MockRunner` test**

The mock runner should emit:

- `run.started`
- `model.text.delta`
- `tool.call.created`
- `tool.call.completed`
- `artifact.created`
- `run.completed`

- [ ] **Step 2: Implement runner base**

`RunnerAdapter` kind union:

```ts
export type RunnerKind = "openai-agents" | "mastra" | "vercel-ai-sdk" | "langgraph" | "mock";
```

- [ ] **Step 3: Implement `MockRunner`**

Use deterministic events for command service, SSE, and browser tests.

- [ ] **Step 4: Implement `ModernOpenAIAgentsRunner`**

Requirements:

- Use `@openai/agents`.
- Convert SDK streaming/tool events to `RuntimeEventSink`.
- Store external run/trace ids in `runner_runs`.
- Use config-driven model selection.
- Do not expose raw chain-of-thought.
- In tests, mock SDK calls; do not hit the network.

- [ ] **Step 5: Implement `MastraWorkflowRunner`**

Requirements:

- Use `@mastra/core`.
- Implement one minimal workflow: fetch data -> produce summary artifact.
- Convert each step to `RuntimeEvent`.
- Store trace id in `runner_runs`.
- Do not use Mastra memory as session/message source of truth.

- [ ] **Step 6: Wire registry**

Default selection:

- If command intent is ad hoc agent: `openai-agents`.
- If command intent is workflow: `mastra`.
- If `NODE_ENV === "test"` or config uses mock: `mock`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm vitest run tests/runners/mock.test.ts tests/runners/openai-agents.test.ts tests/runners/mastra-workflow.test.ts tests/runtime/command-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/runners/base.ts src/lib/runners/mock.ts src/lib/runners/openai-agents.ts src/lib/runners/mastra-workflow.ts src/lib/runners/registry.ts src/lib/agent/llm-provider.ts tests/runners
git commit -m "feat(runtime): add modern runner adapters"
```

## Task 8: AG-UI Projection

**Files:**

- Create: `src/lib/ag-ui/projector.ts`
- Create: `src/lib/ag-ui/command.ts`
- Create: `src/app/api/ag-ui/research/route.ts`
- Create: `tests/ag-ui/projector.test.ts`

- [ ] **Step 1: Write projection tests**

Map:

- `run.started` -> AG-UI run started event.
- `model.text.delta` -> AG-UI text/message delta event.
- `tool.call.created/completed` -> AG-UI tool call lifecycle event.
- `run.completed` -> AG-UI run finished event.
- `error.created` -> AG-UI run error event.

- [ ] **Step 2: Run failing test**

Run: `pnpm vitest run tests/ag-ui/projector.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement AG-UI command parser**

`src/lib/ag-ui/command.ts` should:

- Parse AG-UI `RunAgentInput`.
- Resolve `threadId` to `sessionId`.
- Convert latest user message into `session.message.append_user`.
- Set `source: "ag_ui"`.

- [ ] **Step 4: Implement AG-UI route**

`POST /api/ag-ui/research`:

- Auth.
- Parse AG-UI input.
- Submit canonical command.
- Subscribe to runtime events.
- Stream AG-UI events.

- [ ] **Step 5: Verify**

Run: `pnpm vitest run tests/ag-ui/projector.test.ts tests/runtime/projectors.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ag-ui/projector.ts src/lib/ag-ui/command.ts src/app/api/ag-ui/research/route.ts tests/ag-ui/projector.test.ts
git commit -m "feat(runtime): expose ag-ui projection"
```

## Task 9: Frontend Canonical Reducer

**Files:**

- Create: `src/stores/runtime-reducer.ts`
- Modify: `src/stores/agent.ts`
- Modify: `src/hooks/useSSE.ts`
- Modify: `src/app/page.tsx`
- Modify: `tests/agent-store.test.ts`
- Modify: `tests/use-sse.test.ts`

- [ ] **Step 1: Write reducer tests**

Reducer accepts:

```ts
applyRuntimeEvent(state, runtimeEvent("model.text.delta", { delta: "hello" }));
```

Reducer rejects old event names by type:

```ts
expect(() => applyRuntimeEvent(state, { type: "text_delta" } as never)).toThrow();
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run tests/agent-store.test.ts tests/use-sse.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement normalized state**

Store shape:

- `sessionsById`
- `messagesById`
- `runsById`
- `toolCallsById`
- `artifactsById`
- `timelineIdsBySession`
- `connectionStatus`

- [ ] **Step 4: Rewrite `useSSE`**

Rules:

- Listen only to `runtime.event`.
- Treat native `onerror` as connection status.
- Do not append business errors unless event type is `error.created`.
- Deduplicate by event id/seq.

- [ ] **Step 5: Rewrite send-message path**

`src/app/page.tsx` should call:

```ts
POST /api/runtime/commands
{
  "schemaVersion": "runtime-command.v1",
  "type": "session.message.append_user",
  "source": "research_desk",
  "actor": "web_ui",
  "sessionId": "...",
  "content": "...",
  "startRun": true
}
```

- [ ] **Step 6: Replace history refresh**

Use:

- `GET /api/sessions/:id/timeline`
- `GET /api/runs/:id/timeline`

Do not call `GET /messages` or `GET /tool-events`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm vitest run tests/agent-store.test.ts tests/use-sse.test.ts
rg -n "/messages|/tool-events|text_delta|tool_call|run.updated" src/app src/hooks src/stores
```

Expected: tests PASS; `rg` has no runtime hits.

- [ ] **Step 8: Commit**

```bash
git add src/stores/runtime-reducer.ts src/stores/agent.ts src/hooks/useSSE.ts src/app/page.tsx tests/agent-store.test.ts tests/use-sse.test.ts
git commit -m "feat(runtime): migrate ui to canonical events"
```

## Task 10: Artifact And Data Source Provenance

**Files:**

- Create: `src/lib/artifacts/service.ts`
- Modify: `src/lib/runtime/artifact-writer.ts`
- Modify: `src/lib/data-source/router.ts`
- Modify: `src/lib/adapters/futu/index.ts`
- Modify: `tests/tools-v2.test.ts`
- Modify: `tests/data-source-service.test.ts`
- Modify: `tests/source-router.test.ts`

- [ ] **Step 1: Write artifact provenance tests**

Assert `ArtifactService` writes:

- `report.md`
- `result.json`
- `sources.json`
- optional `logs.ndjson`

Metadata must include:

- `sha256`
- `sizeBytes`
- `schemaVersion`
- `producer`
- `sourceEventId`

- [ ] **Step 2: Write data source event tests**

Assert `SourceRouter` emits:

- `data.source.selected`
- `data.source.failed_over`
- `error.created` with `adapter.no_route` when no route exists.

- [ ] **Step 3: Implement `ArtifactService`**

No direct DB writes from runner or tool adapters. The service receives metadata from `RuntimeEventSink` and writes through `RuntimeStore`.

- [ ] **Step 4: Add Futu/OpenD provenance**

Keep native TypeScript adapter. Do not call Python scripts.

Provenance fields:

- provider id
- adapter id
- market
- capability
- latency ms
- route id
- health status

- [ ] **Step 5: Verify**

Run:

```bash
pnpm vitest run tests/tools-v2.test.ts tests/data-source-service.test.ts tests/source-router.test.ts
rg -n "python|\\.py|child_process|spawn\\(" src/lib/adapters src/lib/data-source src/lib/runners
```

Expected: tests PASS; `rg` does not show app runtime shelling out to Python for Futu/OpenD.

- [ ] **Step 6: Commit**

```bash
git add src/lib/artifacts/service.ts src/lib/runtime/artifact-writer.ts src/lib/data-source/router.ts src/lib/adapters/futu/index.ts tests/tools-v2.test.ts tests/data-source-service.test.ts tests/source-router.test.ts
git commit -m "feat(runtime): record artifact and datasource provenance"
```

## Task 11: Delete Old Runtime Paths

**Files:**

- Delete: `src/app/api/sessions/[id]/messages/route.ts`
- Delete: `src/app/api/sessions/[id]/tool-events/route.ts`
- Delete: `src/app/api/sessions/[id]/cancel/route.ts`
- Delete: `src/app/api/runs/[id]/cancel/route.ts`
- Delete: `src/app/api/runs/[id]/artifacts/route.ts` after replacement with canonical timeline or artifact route.
- Delete: `src/lib/agent/pi-runner.ts`
- Delete: `src/lib/agent/pi-tools.ts`
- Modify: `package.json`
- Modify: `src/lib/runtime/no-debt.ts`
- Modify: `tests/runtime/no-runtime-debt.test.ts`

- [ ] **Step 1: Verify no callers**

Run:

```bash
rg -n "/api/sessions/.*/messages|/api/sessions/.*/tool-events|/api/.*/cancel|PiAgentRunner|pi-runner|pi-tools|@earendil-works/pi" src tests
```

Expected before deletion: only files listed in this task and allowlisted tests/fixtures.

- [ ] **Step 2: Delete old route files**

Delete old route files only after Task 9 frontend migration is passing.

- [ ] **Step 3: Delete Pi runtime files**

Delete `pi-runner.ts` and `pi-tools.ts`. If `schema-bridge.ts`, `task-runner.ts`, or `tools.ts` still exist, they may remain only if they no longer import Pi and are still used by modern runners.

- [ ] **Step 4: Remove Pi dependencies**

Remove from `package.json`:

```json
"@earendil-works/pi-agent-core": "...",
"@earendil-works/pi-ai": "..."
```

Run: `pnpm install`

- [ ] **Step 5: Run no-debt guard**

Run:

```bash
pnpm runtime:no-debt
pnpm runtime:no-debt:strict
pnpm vitest run tests/runtime/no-runtime-debt.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/api src/lib/agent tests/runtime/no-runtime-debt.test.ts
git commit -m "refactor(runtime): remove old protocol and pi paths"
```

## Task 12: Full Verification And Browser QA

**Files:**

- Create: `tests/e2e/research-runtime.spec.ts`
- Modify: docs as needed.

- [ ] **Step 1: Add E2E test**

Cover:

- Create session.
- Send ticker analysis request.
- Observe `run.created` / running state through canonical event stream.
- Observe model text.
- Observe tool timeline.
- Refresh page during active run.
- Refresh page after terminal run.
- Open run detail and confirm artifacts/provenance.
- Open Data Sources and confirm Futu/OpenD health state.

- [ ] **Step 2: Run unit/integration suite**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm runtime:no-debt
```

Expected: all PASS.

- [ ] **Step 3: Run local app**

Run:

```bash
pnpm dev --port 3001
```

Expected: app starts at `http://localhost:3001`.

- [ ] **Step 4: Browser QA**

Use Browser plugin or Playwright:

- Navigate to `http://localhost:3001`.
- Exercise the flow from Step 1.
- Save screenshots under `analysis/qa/YYYY-MM-DD-runtime-vnext/`.
- Check console for errors.
- Confirm network tab uses `/api/runtime/commands`, `/api/sessions/:id/events`, `/api/sessions/:id/timeline`, and no deleted old routes.

- [ ] **Step 5: Final debt scan**

Run:

```bash
rg -n "LegacyRestAdapter|LegacySseAdapter|LegacyPiRunnerAdapter|text_delta|thinking_delta|tool_call|tool_result|run.updated|runEvents|sessionEvents|@earendil-works/pi|PiAgentRunner|pi-runner|pi-tools|/tool-events|/messages" src tests package.json
```

Expected: no runtime hits. Allowed hits must be only migration fixtures or documentation, and must be listed in `src/lib/runtime/no-debt.ts`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/research-runtime.spec.ts analysis/qa docs/superpowers/specs/2026-06-02-research-runtime-protocol-refactor-design.md docs/superpowers/plans/2026-06-03-modern-agent-runtime-vnext.md
git commit -m "test(runtime): verify vnext research desk flow"
```

## Implementation Notes

- Use subagent-driven development for Tasks 2 through 11. Each task has clear file boundaries and can be reviewed independently.
- Do not start implementation by editing `src/app/page.tsx`; first make canonical API and reducer tests pass.
- Do not keep temporary route wrappers. If a task needs a temporary bridge to make tests pass, delete it in the same task before commit.
- Keep old database backups under `analysis/backups/`; do not import backup files from app runtime.
- Keep source discipline for OpenD/Futu: adapter must stay TypeScript-native and must not shell out to Python scripts.
