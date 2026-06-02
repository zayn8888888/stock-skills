import { describe, expect, it, beforeEach } from "vitest";
import { createTestDB } from "../helpers";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeEvent } from "@/lib/runtime/events";
import type * as schema from "@/lib/db/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

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
});
