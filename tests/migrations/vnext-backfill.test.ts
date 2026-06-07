import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("vNext backfill migration", () => {
  it("normalizes legacy statuses and extended read-model fields", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, title TEXT);
      CREATE TABLE messages (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT);
      CREATE TABLE runs (
        id TEXT PRIMARY KEY, session_id TEXT, status TEXT, metadata TEXT, metadata_json TEXT,
        workflow_type TEXT, ticker TEXT, market TEXT, intent TEXT, execution_mode TEXT, caller TEXT
      );
      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY, run_id TEXT, session_id TEXT, content TEXT, inline_content TEXT,
        mime_type TEXT, content_type TEXT
      );
      INSERT INTO sessions VALUES ('s1', 'Legacy title', NULL);
      INSERT INTO messages VALUES ('m1', '2026-01-01', '');
      INSERT INTO runs VALUES (
        'r1', 's1', 'success',
        '{"workflow_type":"agent_workflow","ticker":"NVDA","market":"US"}',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      );
      INSERT INTO artifacts VALUES ('a1', 'r1', NULL, '# Report', NULL, 'text/markdown', NULL);
    `);

    db.exec(
      readFileSync(join(process.cwd(), "src/lib/db/migrations/0005_vnext_backfill.sql"), "utf-8"),
    );

    expect(db.prepare("SELECT title FROM sessions WHERE id = 's1'").get()).toEqual({
      title: "Legacy title",
    });
    expect(
      db.prepare("SELECT status, workflow_type, ticker, market FROM runs WHERE id = 'r1'").get(),
    ).toEqual({
      status: "succeeded",
      workflow_type: "agent_workflow",
      ticker: "NVDA",
      market: "US",
    });
    expect(
      db
        .prepare("SELECT session_id, inline_content, content_type FROM artifacts WHERE id = 'a1'")
        .get(),
    ).toEqual({
      session_id: "s1",
      inline_content: "# Report",
      content_type: "text/markdown",
    });
  });
});
