import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Return a singleton Drizzle database instance backed by better-sqlite3.
 * The SQLite connection is configured with WAL mode, foreign keys ON,
 * and a 5-second busy timeout.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const { dbPath } = getConfig();

  const sqlite = new Database(dbPath);

  // Performance / correctness pragmas
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  _db = drizzle(sqlite, { schema });
  return _db;
}

/**
 * Apply all pending migration SQL files from src/lib/db/migrations/.
 */
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const migrationsFolder = new URL("./migrations", import.meta.url).pathname;
  migrate(db, { migrationsFolder });
}
