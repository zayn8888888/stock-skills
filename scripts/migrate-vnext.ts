#!/usr/bin/env tsx
/**
 * CLI entrypoint for vNext database migration.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-vnext.ts --dry-run
 *   pnpm tsx scripts/migrate-vnext.ts --backup --apply
 */

import { backupAnalysis } from "./backup-analysis";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const shouldBackup = args.includes("--backup");
const shouldApply = args.includes("--apply");

async function main() {
  console.log("=== vNext Migration Tool ===");
  console.log(`Mode: ${isDryRun ? "dry-run" : "live"}`);
  console.log();

  // 1. Backup if requested
  if (shouldBackup || !isDryRun) {
    console.log("[1/3] Creating backup...");
    const backup = await backupAnalysis({ dryRun: isDryRun });
    console.log(`  Backup dir: ${backup.backupDir}`);
    console.log(`  Files: ${backup.files.join(", ")}`);
  } else {
    console.log("[1/3] Backup skipped (--dry-run without --backup)");
  }

  console.log();

  // 2. Import
  if (isDryRun) {
    console.log("[2/3] Import: DRY RUN — no changes will be made");
    console.log("  To run the actual migration, use: pnpm tsx scripts/migrate-vnext.ts --backup --apply");
  } else if (shouldApply) {
    console.log("[2/3] Import: applying migration...");
    console.log("  NOTE: Full import not yet wired. Schema migration runs via pnpm db:migrate.");
    console.log("  Once vNext schema is stable, this script will read old DB and import into vNext tables.");
  } else {
    console.log("[2/3] Import: SKIPPED (use --apply to run)");
  }

  console.log();

  // 3. Consistency check
  console.log("[3/3] Consistency check...");
  if (isDryRun) {
    console.log("  Skipped in dry-run mode.");
  } else {
    console.log("  Consistency checks run after import is applied.");
  }

  console.log();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration CLI failed:", err);
  process.exit(1);
});
