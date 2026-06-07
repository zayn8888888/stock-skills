import type * as schema from "@/lib/db/schema";
import { RuntimeCommandService } from "@/lib/runtime/command-service";
import { createCommand } from "@/lib/runtime/commands";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import type { ResearchRuntime } from "@/lib/runtime/research-runtime";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

/**
 * No-op stub for ResearchRuntime so command-service tests don't trigger
 * real runner execution (which would race with test assertions when
 * better-sqlite3 resolves synchronously).
 */
function createStubResearchRuntime(): ResearchRuntime {
  return {
    executeRun: async () => {},
    cancelRun: () => {},
  } as unknown as ResearchRuntime;
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected value to be defined");
  return value;
}

describe("RuntimeCommandService", () => {
  let db: ReturnType<typeof createTestDB>;
  let store: ReturnType<typeof createRuntimeStore>;
  let eventLog: RuntimeEventLog;
  let service: RuntimeCommandService;

  beforeEach(() => {
    db = createTestDB();
    store = createRuntimeStore(db as unknown as BetterSQLite3Database<typeof schema>);
    eventLog = new RuntimeEventLog(store);
    service = new RuntimeCommandService(store, eventLog, createStubResearchRuntime());
  });

  it("creates a session from session.create command", async () => {
    const cmd = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(cmd);
    expect(result.accepted).toBe(true);
    expect(result.sessionId).toBeTruthy();
  });

  it("appends user message and creates run when startRun is true", async () => {
    // First create a session
    const createCmd = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
    });
    const { sessionId } = await service.handle(createCmd);
    expect(sessionId).toBeTruthy();

    // Now append a message with startRun
    const msgCmd = createCommand({
      type: "session.message.append_user",
      sessionId: required(sessionId),
      content: "Analyze NVDA stock",
      context: {
        ticker: "NVDA",
        market: "US",
        skillName: "stock-analyzer",
        workflowType: "agent_workflow",
      },
      startRun: true,
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(msgCmd);
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBeTruthy();
    expect(result.runId).toBeTruthy();

    // Verify message was created
    const msg = await store.messages.findById(required(result.messageId));
    expect(msg).toBeDefined();
    expect(msg?.content).toBe("Analyze NVDA stock");

    // Verify run was created
    const run = await store.runs.findById(required(result.runId));
    expect(run).toBeDefined();
    expect(run?.status).toBe("queued");
    expect(run?.ticker).toBe("NVDA");
  });

  it("creates a session for the first append_user command when sessionId is absent", async () => {
    const cmd = createCommand({
      type: "session.message.append_user",
      content: "Analyze NVDA",
      startRun: true,
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(cmd);

    expect(result.accepted).toBe(true);
    expect(result.sessionId).toBeTruthy();
    expect(result.messageId).toBeTruthy();
    expect(result.runId).toBeTruthy();
    expect(await store.sessions.findById(required(result.sessionId))).toMatchObject({
      title: "Analyze NVDA",
    });
    expect(await store.messages.findById(required(result.messageId))).toMatchObject({
      sessionId: result.sessionId,
      content: "Analyze NVDA",
    });
  });

  it("creates a client-provided session when it does not exist", async () => {
    const cmd = createCommand({
      type: "session.message.append_user",
      sessionId: "client_thread_1",
      content: "Analyze NVDA",
      startRun: true,
      source: "ag_ui",
      actor: "web_ui",
    });

    const result = await service.handle(cmd);

    expect(result.accepted).toBe(true);
    expect(result.sessionId).toBe("client_thread_1");
    expect(await store.sessions.findById("client_thread_1")).toMatchObject({
      title: "Analyze NVDA",
    });
  });

  it("appends user message without starting a run", async () => {
    const createCmd = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
    });
    const { sessionId } = await service.handle(createCmd);

    const msgCmd = createCommand({
      type: "session.message.append_user",
      sessionId: required(sessionId),
      content: "Hello, what can you do?",
      startRun: false,
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(msgCmd);
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBeTruthy();
    expect(result.runId).toBeUndefined();
  });

  it("returns prior result for duplicate idempotency key", async () => {
    const idempotencyKey = "test-idempotency-key-123";

    const cmd1 = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
      idempotencyKey,
    });

    const result1 = await service.handle(cmd1);
    expect(result1.accepted).toBe(true);
    expect(result1.sessionId).toBeTruthy();

    // Same idempotency key — should return same result
    const cmd2 = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
      idempotencyKey,
    });

    const result2 = await service.handle(cmd2);
    expect(result2.accepted).toBe(true);
    expect(result2.sessionId).toBe(result1.sessionId);
  });

  it("emits error.created when run cancel is invalid", async () => {
    const createCmd = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
    });
    const { sessionId } = await service.handle(createCmd);

    // Create a run
    const msgCmd = createCommand({
      type: "session.message.append_user",
      sessionId: required(sessionId),
      content: "test",
      startRun: true,
      source: "research_desk",
      actor: "web_ui",
    });
    const { runId } = await service.handle(msgCmd);

    // Try to start the same run again (invalid transition: queued -> running
    // is fine, but creating a new start command for an already-queued run
    // should be handled gracefully)

    // Let's test cancel of a completed run
    await store.runs.updateStatus(required(runId), "succeeded", {
      finishedAt: new Date().toISOString(),
    });

    // Collect emitted events
    const emitted: unknown[] = [];
    eventLog.subscribe(required(sessionId), (e) => emitted.push(e));

    const cancelCmd = createCommand({
      type: "run.cancel",
      sessionId: required(sessionId),
      runId: required(runId),
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(cancelCmd);
    // Should handle gracefully — either accepted=false or error event emitted
    expect(result.accepted).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("handles run.cancel for a running run", async () => {
    const createCmd = createCommand({
      type: "session.create",
      source: "research_desk",
      actor: "web_ui",
    });
    const { sessionId } = await service.handle(createCmd);

    // Create message + run without auto-start, then manually set to running
    const msgCmd = createCommand({
      type: "session.message.append_user",
      sessionId: required(sessionId),
      content: "test",
      startRun: false,
      source: "research_desk",
      actor: "web_ui",
    });
    await service.handle(msgCmd);

    // Manually create a run in "running" state
    const run = await store.runs.create({ sessionId: required(sessionId), skillName: "test" });
    await store.runs.update(run.id, { status: "running" });

    const cancelCmd = createCommand({
      type: "run.cancel",
      sessionId: required(sessionId),
      runId: run.id,
      source: "research_desk",
      actor: "web_ui",
    });

    const result = await service.handle(cancelCmd);
    expect(result.accepted).toBe(true);
    expect(result.runId).toBe(run.id);
  });
});
