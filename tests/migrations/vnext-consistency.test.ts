import type * as schema from "@/lib/db/schema";
import { runConsistencyChecks } from "@/lib/migrations/vnext-consistency";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("vNext consistency checks", () => {
  let store: ReturnType<typeof createRuntimeStore>;

  beforeEach(() => {
    store = createRuntimeStore(createTestDB() as unknown as BetterSQLite3Database<typeof schema>);
  });

  it("reports a terminal run without a terminal runtime event", async () => {
    await store.sessions.create({ id: "s1", status: "active" });
    await store.runs.create({
      id: "r1",
      sessionId: "s1",
      skillName: "test",
      status: "succeeded",
    });

    const result = await runConsistencyChecks(store);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("r1");
  });

  it("passes for a consistent terminal run", async () => {
    await store.sessions.create({ id: "s1", status: "active" });
    await store.runs.create({
      id: "r1",
      sessionId: "s1",
      skillName: "test",
      status: "succeeded",
    });
    await store.events.append({
      id: "e1",
      schemaVersion: "runtime-event.v1",
      sessionSeq: 1,
      runSeq: 1,
      scope: "run",
      type: "run.completed",
      category: "lifecycle",
      sessionId: "s1",
      runId: "r1",
      producer: "server",
      visibility: "ui",
      persist: 1,
      createdAt: new Date().toISOString(),
    });

    expect((await runConsistencyChecks(store)).ok).toBe(true);
  });
});
