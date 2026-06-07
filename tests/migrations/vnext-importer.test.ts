import type * as schema from "@/lib/db/schema";
import {
  importToVNext,
  mapOldRunEventType,
  mapOldRunStatus,
} from "@/lib/migrations/vnext-importer";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("vNext importer", () => {
  describe("mapOldRunStatus", () => {
    it("maps pending -> queued", () => {
      expect(mapOldRunStatus("pending")).toBe("queued");
    });

    it("maps running -> running", () => {
      expect(mapOldRunStatus("running")).toBe("running");
    });

    it("maps success -> succeeded", () => {
      expect(mapOldRunStatus("success")).toBe("succeeded");
    });

    it("maps failed -> failed", () => {
      expect(mapOldRunStatus("failed")).toBe("failed");
    });

    it("maps cancelled -> cancelled", () => {
      expect(mapOldRunStatus("cancelled")).toBe("cancelled");
    });

    it("passes through unknown statuses unchanged", () => {
      expect(mapOldRunStatus("unknown_status")).toBe("unknown_status");
    });
  });

  describe("mapOldRunEventType", () => {
    it("maps tool_use running -> tool.call.created", () => {
      expect(mapOldRunEventType("tool_use", "running")).toBe("tool.call.created");
    });

    it("maps tool_use completed -> tool.call.completed", () => {
      expect(mapOldRunEventType("tool_use", "completed")).toBe("tool.call.completed");
    });

    it("maps tool_use error -> tool.call.failed", () => {
      expect(mapOldRunEventType("tool_use", "error")).toBe("tool.call.failed");
    });

    it("maps error -> error.created", () => {
      expect(mapOldRunEventType("error")).toBe("error.created");
    });

    it("maps run_started -> run.started", () => {
      expect(mapOldRunEventType("run_started")).toBe("run.started");
    });

    it("maps run.created -> run.created", () => {
      expect(mapOldRunEventType("run.created")).toBe("run.created");
    });

    it("maps progress -> run.progressed", () => {
      expect(mapOldRunEventType("progress")).toBe("run.progressed");
    });

    it("maps log -> run.progressed", () => {
      expect(mapOldRunEventType("log")).toBe("run.progressed");
    });

    it("maps unknown event type to system.info", () => {
      expect(mapOldRunEventType("unknown_event")).toBe("system.info");
    });
  });

  it("imports multiple old events with monotonic canonical sequence numbers", async () => {
    const source = new Database(":memory:");
    source.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, name TEXT, status TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE runs (
        id TEXT PRIMARY KEY, session_id TEXT, goal_id TEXT, skill_name TEXT, status TEXT,
        started_at TEXT, finished_at TEXT, duration_ms INTEGER, result_summary TEXT,
        created_at TEXT, metadata TEXT
      );
      CREATE TABLE run_events (
        id TEXT PRIMARY KEY, run_id TEXT, timestamp TEXT, event_type TEXT, data TEXT
      );
      CREATE TABLE session_events (
        id TEXT PRIMARY KEY, session_id TEXT, timestamp TEXT, event_type TEXT, data TEXT
      );
      INSERT INTO sessions VALUES ('s1', 'Research', 'active', '2026-01-01', '2026-01-01');
      INSERT INTO runs VALUES (
        'r1', 's1', NULL, 'stock-analyzer', 'success', '2026-01-01', '2026-01-01',
        100, 'done', '2026-01-01', '{}'
      );
      INSERT INTO run_events VALUES
        ('re1', 'r1', '2026-01-01T00:00:01Z', 'run_started', '{}'),
        ('re2', 'r1', '2026-01-01T00:00:02Z', 'progress', '{"message":"working"}');
      INSERT INTO session_events VALUES
        ('se1', 's1', '2026-01-01T00:00:03Z', 'system.info', '{}');
    `);

    const targetDb = createTestDB();
    const store = createRuntimeStore(targetDb as unknown as BetterSQLite3Database<typeof schema>);

    const result = await importToVNext({ sqlite: source, store });
    const events = await store.events.findBySession("s1");

    expect(result.runEvents).toBe(2);
    expect(result.sessionEvents).toBe(1);
    expect(events.map((event) => event.sessionSeq)).toEqual([1, 2, 3, 4]);
    expect(events.filter((event) => event.runId === "r1").map((event) => event.runSeq)).toEqual([
      1, 2, 3,
    ]);
    expect(events.at(-1)?.type).toBe("run.completed");
  });
});
