/**
 * Standalone migration script — run with: pnpm db:migrate
 *
 * Applies SQL migrations, seeds data sources, and seeds vNext runner providers.
 */

import { runMigrations, getDb } from "./index";
import { runnerProviders } from "./schema";
import type * as schema from "./schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

type DB = BetterSQLite3Database<typeof schema>;

const now = () => new Date().toISOString();

/** Seed the default vNext runner providers. */
export function seedRunnerProviders(db: DB): void {
  const defaults = [
    { id: "openai-agents", kind: "openai-agents" as const, displayName: "OpenAI Agents SDK" },
    { id: "mastra", kind: "mastra" as const, displayName: "Mastra Workflow Runner" },
    { id: "mock", kind: "mock" as const, displayName: "Mock Runner (tests)" },
  ];

  for (const rp of defaults) {
    db.insert(runnerProviders)
      .values({
        id: rp.id,
        kind: rp.kind,
        displayName: rp.displayName,
        enabled: 1,
        status: "unknown",
        createdAt: now(),
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: runnerProviders.id,
        set: { displayName: rp.displayName, updatedAt: now() },
      })
      .run();
  }
}

async function main() {
  console.log("Running database migrations...");
  runMigrations();

  const db = getDb();
  seedRunnerProviders(db);
  console.log("Runner providers seeded.");

  console.log("Migrations complete.");
}

// Only run main() when executed directly (not when imported for seedRunnerProviders)
const isDirectRun = process.argv[1]?.includes("migrate.ts") ?? false;
if (isDirectRun) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
