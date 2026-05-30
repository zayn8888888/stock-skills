import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@/lib/db/schema";
import { seed } from "@/lib/data-source/seed";

/**
 * Create an in-memory test database with migrations applied and seed data loaded.
 */
export function createTestDB() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Run SQL migrations
  const migrationsDir = join(process.cwd(), "src/lib/db/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    sqlite.exec(sql);
  }

  // Seed from JSON manifests
  seed(db);

  return db;
}
