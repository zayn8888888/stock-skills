import type * as schema from "@/lib/db/schema";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { ResearchRuntime } from "@/lib/runtime/research-runtime";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("ResearchRuntime", () => {
  let store: ReturnType<typeof createRuntimeStore>;
  let runtime: ResearchRuntime;

  beforeEach(() => {
    store = createRuntimeStore(createTestDB() as unknown as BetterSQLite3Database<typeof schema>);
    runtime = new ResearchRuntime(store, new RuntimeEventLog(store));
  });

  it("does not execute a queued run that was cancelled before dispatch", async () => {
    await store.sessions.create({ id: "s1", status: "active" });
    const run = await store.runs.create({
      id: "r1",
      sessionId: "s1",
      skillName: "test",
      status: "cancelled",
    });

    await runtime.executeRun(run.id, "s1");

    expect((await store.runs.findById(run.id))?.status).toBe("cancelled");
    expect(await store.events.findByRun(run.id)).toEqual([]);
  });
});
