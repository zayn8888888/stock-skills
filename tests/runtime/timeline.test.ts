import type * as schema from "@/lib/db/schema";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { buildRunTimeline, buildSessionTimeline } from "@/lib/runtime/timeline";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("Timeline query services", () => {
  let db: ReturnType<typeof createTestDB>;
  let store: ReturnType<typeof createRuntimeStore>;

  beforeEach(() => {
    db = createTestDB();
    store = createRuntimeStore(db as unknown as BetterSQLite3Database<typeof schema>);
  });

  it("buildSessionTimeline returns empty timeline for new session", async () => {
    await store.sessions.create({
      id: "tl_session_1",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const timeline = await buildSessionTimeline(store, "tl_session_1");
    expect(timeline.sessionId).toBe("tl_session_1");
    expect(timeline.messages).toEqual([]);
    expect(timeline.runs).toEqual([]);
    expect(timeline.activeRunId).toBeNull();
  });

  it("buildSessionTimeline includes messages, runs, and tool calls", async () => {
    await store.sessions.create({
      id: "tl_session_2",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await store.messages.create({
      sessionId: "tl_session_2",
      role: "user",
      content: "Analyze AAPL",
    });

    const _run = await store.runs.create({
      id: "tl_run_1",
      sessionId: "tl_session_2",
      skillName: "stock-analyzer",
      status: "running",
      createdAt: new Date().toISOString(),
    });

    await store.tools.create({
      runId: "tl_run_1",
      sessionId: "tl_session_2",
      name: "get_quote_snapshot",
      status: "succeeded",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const timeline = await buildSessionTimeline(store, "tl_session_2");
    expect(timeline.messages.length).toBe(1);
    expect(timeline.messages[0].content).toBe("Analyze AAPL");
    expect(timeline.runs.length).toBe(1);
    expect(timeline.runs[0].skillName).toBe("stock-analyzer");
    expect(timeline.toolCalls.length).toBe(1);
    expect(timeline.toolCalls[0].name).toBe("get_quote_snapshot");
  });

  it("buildRunTimeline returns null for unknown run", async () => {
    const timeline = await buildRunTimeline(store, "nonexistent");
    expect(timeline).toBeNull();
  });

  it("buildRunTimeline returns complete run detail", async () => {
    await store.sessions.create({
      id: "tl_session_3",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const _run = await store.runs.create({
      id: "tl_run_2",
      sessionId: "tl_session_3",
      skillName: "test-skill",
      workflowType: "agent_workflow",
      ticker: "NVDA",
      status: "succeeded",
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 5000,
    });

    await store.artifacts.create({
      runId: "tl_run_2",
      sessionId: "tl_session_3",
      kind: "report",
      name: "report.md",
      path: "/tmp/report.md",
      inlineContent: "# Report",
      mimeType: "text/markdown",
      createdAt: new Date().toISOString(),
    });

    const timeline = await buildRunTimeline(store, "tl_run_2");
    expect(timeline).toBeDefined();
    expect(timeline?.runId).toBe("tl_run_2");
    expect(timeline?.status).toBe("succeeded");
    expect(timeline?.skillName).toBe("test-skill");
    expect(timeline?.workflowType).toBe("agent_workflow");
    expect(timeline?.ticker).toBe("NVDA");
    expect(timeline?.artifacts.length).toBe(1);
    expect(timeline?.artifacts[0].name).toBe("report.md");
    expect(timeline?.artifacts[0].content).toBe("# Report");
    expect(timeline?.artifacts[0].mimeType).toBe("text/markdown");
    expect(timeline?.durationMs).toBe(5000);
  });
});
