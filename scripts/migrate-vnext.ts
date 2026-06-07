#!/usr/bin/env tsx
/**
 * CLI entrypoint for importing a legacy database into a migrated vNext database.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-vnext.ts --dry-run --source analysis/legacy.sqlite
 *   pnpm tsx scripts/migrate-vnext.ts --backup --apply \
 *     --source analysis/legacy.sqlite --target analysis-vnext/stock_skills.sqlite
 *
 * The target must already have the vNext schema (`pnpm db:migrate` with
 * STOCK_SKILLS_ANALYSIS_ROOT pointing at the target directory).
 */

import { existsSync } from "node:fs";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { runConsistencyChecks } from "@/lib/migrations/vnext-consistency";
import { importToVNext } from "@/lib/migrations/vnext-importer";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { backupAnalysis } from "./backup-analysis";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const shouldBackup = args.includes("--backup");
const shouldApply = args.includes("--apply");
const sourcePath = path.resolve(readOption("--source") ?? "analysis/stock_skills.sqlite");
const targetPath = path.resolve(readOption("--target") ?? sourcePath);

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (!isDryRun && !shouldApply) {
    throw new Error("Choose --dry-run or --apply.");
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Source database does not exist: ${sourcePath}`);
  }
  if (!existsSync(targetPath)) {
    throw new Error(`Target database does not exist or is not migrated: ${targetPath}`);
  }
  if (shouldApply && sourcePath === targetPath) {
    throw new Error("--apply requires distinct --source and --target databases.");
  }

  console.log("=== vNext Migration Tool ===");
  console.log(`Mode: ${isDryRun ? "dry-run" : "apply"}`);
  console.log(`Source: ${sourcePath}`);
  console.log(`Target: ${targetPath}`);

  if (shouldBackup) {
    const backup = await backupAnalysis({
      dryRun: isDryRun,
      analysisRoot: path.dirname(sourcePath),
    });
    console.log(`Backup: ${backup.backupDir}`);
  }

  const source = new Database(sourcePath, { readonly: true });
  const target = new Database(targetPath);

  try {
    assertVNextTarget(target);
    if (shouldApply) assertEmptyTarget(target);

    const store = createRuntimeStore(drizzle(target, { schema }));
    const result = await importToVNext({ sqlite: source, store, dryRun: isDryRun });
    console.log(`Import result: ${JSON.stringify(result)}`);

    if (shouldApply) {
      const consistency = await runConsistencyChecks(store);
      for (const check of consistency.checks) {
        console.log(
          `${check.passed ? "PASS" : "FAIL"} ${check.name}${check.details ? `: ${check.details}` : ""}`,
        );
      }
      if (!consistency.ok) {
        throw new Error(`Consistency checks failed: ${consistency.errors.join("; ")}`);
      }
    }
  } finally {
    source.close();
    target.close();
  }
}

function assertVNextTarget(target: Database.Database): void {
  const row = target
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runtime_events'")
    .get();
  if (!row) {
    throw new Error("Target database is missing the vNext schema. Run pnpm db:migrate first.");
  }
}

function assertEmptyTarget(target: Database.Database): void {
  const counts = target
    .prepare(
      "SELECT (SELECT count(*) FROM sessions) AS sessions, (SELECT count(*) FROM runs) AS runs",
    )
    .get() as { sessions: number; runs: number };
  if (counts.sessions > 0 || counts.runs > 0) {
    throw new Error("Target database must not contain sessions or runs before import.");
  }
}

main().catch((err) => {
  console.error("Migration CLI failed:", err);
  process.exit(1);
});
