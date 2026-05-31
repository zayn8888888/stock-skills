import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { seed } from "@/lib/data-source/seed";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Apply raw SQL migration files in numeric order. */
function applySqlMigrations(sqlite: Database.Database, migrationsDir: string): void {
  if (!existsSync(migrationsDir)) return;

  // Track applied migrations via a simple _migrations table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "_drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (sqlite.prepare("SELECT tag FROM _drizzle_migrations").all() as { tag: string }[]).map(
      (r) => r.tag,
    ),
  );

  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, "");
    if (applied.has(tag)) continue;

    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    // Split on statement-breakpoint (drizzle-kit convention) or run as one batch
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    const tx = sqlite.transaction(() => {
      for (const stmt of statements) {
        sqlite.exec(stmt);
      }
      sqlite
        .prepare("INSERT INTO _drizzle_migrations (tag, applied_at) VALUES (?, ?)")
        .run(tag, new Date().toISOString());
    });
    tx();
  }
}

/**
 * Return a singleton Drizzle database instance backed by better-sqlite3.
 * The SQLite connection is configured with WAL mode, foreign keys ON,
 * and a 5-second busy timeout. Migrations are applied automatically
 * on first access.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const { dbPath } = getConfig();

  const sqlite = new Database(dbPath);

  // Performance / correctness pragmas
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  // Apply migrations before handing out the db instance
  const migrationsFolder = path.resolve(process.cwd(), "src/lib/db/migrations");
  applySqlMigrations(sqlite, migrationsFolder);

  _db = drizzle(sqlite, { schema });

  // Seed data from JSON manifests (idempotent — DELETE + INSERT)
  seed(_db);

  return _db;
}

/**
 * Apply all pending migration SQL files from src/lib/db/migrations/.
 * Kept for backward compatibility; getDb() now runs migrations automatically.
 */
export function runMigrations(): void {
  const db = getDb();
  // Migrations already applied by getDb(); this is a no-op.
  void db;
}
