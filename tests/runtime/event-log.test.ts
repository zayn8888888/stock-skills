import type * as schema from "@/lib/db/schema";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeEvent } from "@/lib/runtime/events";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("RuntimeEventLog", () => {
  let db: ReturnType<typeof createTestDB>;
  let store: ReturnType<typeof createRuntimeStore>;
  let log: RuntimeEventLog;

  beforeEach(async () => {
    db = createTestDB();
    store = createRuntimeStore(db as unknown as BetterSQLite3Database<typeof schema>);
    log = new RuntimeEventLog(store);

    // Create a test session and run for foreign key references
    await store.sessions.create({
      id: "test_session_1",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.runs.create({
      id: "test_run_1",
      sessionId: "test_session_1",
      skillName: "test-skill",
      status: "running",
      createdAt: new Date().toISOString(),
    });
  });

  it("appends an event with monotonic session seq", async () => {
    const event1 = await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "run.started",
        category: "lifecycle",
        payload: { status: "running" },
      }),
    );

    const event2 = await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "model.text.delta",
        category: "model",
        payload: { delta: "hello" },
      }),
    );

    expect(event1.sessionSeq).toBe(1);
    expect(event2.sessionSeq).toBe(2);
  });

  it("appends event with monotonic run seq", async () => {
    const event1 = await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "run.started",
        category: "lifecycle",
        payload: {},
      }),
    );

    const event2 = await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "tool.call.created",
        category: "tool",
        payload: { name: "get_quote" },
      }),
    );

    expect(event1.runSeq).toBe(1);
    expect(event2.runSeq).toBe(2);
  });

  it("persists event to the store", async () => {
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        type: "session.created",
        category: "lifecycle",
        payload: {},
      }),
    );

    const events = await store.events.findBySession("test_session_1");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "session.created")).toBe(true);
  });

  it("publishes event after persist", async () => {
    const received: unknown[] = [];
    log.subscribe("test_session_1", (event) => {
      received.push(event);
    });

    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        type: "run.created",
        category: "lifecycle",
        payload: { runId: "test_run_1" },
      }),
    );

    expect(received.length).toBe(1);
    expect((received[0] as { type: string }).type).toBe("run.created");
  });

  it("projects completed model text into an assistant message", async () => {
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "model.text.completed",
        category: "model",
        payload: { text: "Completed research report" },
      }),
    );

    expect(await store.messages.findByRun("test_run_1")).toMatchObject([
      {
        sessionId: "test_session_1",
        runId: "test_run_1",
        role: "assistant",
        messageType: "assistant_final",
        content: "Completed research report",
      },
    ]);
  });

  it("projects run errors into one durable system message", async () => {
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "error.created",
        category: "error",
        payload: { code: "runner.failed", message: "Missing credentials" },
      }),
    );
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        type: "run.failed",
        category: "error",
        payload: { code: "runner.failed", message: "Missing credentials" },
      }),
    );

    expect(await store.messages.findByRun("test_run_1")).toMatchObject([
      {
        sessionId: "test_session_1",
        runId: "test_run_1",
        role: "system",
        messageType: "error",
        content: "Error: Missing credentials",
      },
    ]);
  });

  it("projects tool call lifecycle into the tool call read model", async () => {
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        toolCallId: "tool_1",
        type: "tool.call.created",
        category: "tool",
        payload: { toolCallId: "tool_1", name: "get_quote", args: { ticker: "NVDA" } },
      }),
    );
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        toolCallId: "tool_1",
        type: "tool.call.completed",
        category: "tool",
        payload: {
          toolCallId: "tool_1",
          name: "get_quote",
          status: "succeeded",
          result: { price: 123 },
        },
      }),
    );

    expect(await store.tools.findById("tool_1")).toMatchObject({
      sessionId: "test_session_1",
      runId: "test_run_1",
      name: "get_quote",
      status: "succeeded",
      argsJson: JSON.stringify({ ticker: "NVDA" }),
      resultJson: JSON.stringify({ price: 123 }),
    });
  });

  it("projects artifact events into the artifact read model", async () => {
    await log.append(
      createRuntimeEvent({
        sessionId: "test_session_1",
        runId: "test_run_1",
        artifactId: "artifact_1",
        type: "artifact.created",
        category: "artifact",
        payload: {
          artifactId: "artifact_1",
          kind: "report",
          name: "report.md",
          content: "# Report",
        },
      }),
    );

    expect(await store.artifacts.findById("artifact_1")).toMatchObject({
      sessionId: "test_session_1",
      runId: "test_run_1",
      kind: "report",
      name: "report.md",
      inlineContent: "# Report",
    });
  });
});
