import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import path from "node:path";

export interface BackupOptions {
  /** Skip actual file copy; just report what would be backed up. */
  dryRun?: boolean;
  /** Override the analysis root (default: ANALYSIS_ROOT or cwd/analysis). */
  analysisRoot?: string;
}

export interface BackupResult {
  /** Absolute path to the backup directory that was created (or would be created). */
  backupDir: string;
  /** Names of what was (or would be) backed up. */
  files: string[];
  /** Whether this was a dry run. */
  dryRun: boolean;
}

/**
 * Create a timestamped backup of the SQLite database and artifacts directory
 * under analysis/backups/<iso-timestamp>/.
 *
 * Safe to run repeatedly; each backup gets its own subdirectory.
 * Never reads or exposes .env values.
 */
export async function backupAnalysis(options: BackupOptions = {}): Promise<BackupResult> {
  const analysisRoot =
    options.analysisRoot ??
    process.env.STOCK_SKILLS_ANALYSIS_ROOT ??
    path.resolve(process.cwd(), "analysis");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(analysisRoot, "backups", timestamp);
  const files: string[] = [];

  // Identify what exists to back up
  const sqlitePath = path.resolve(analysisRoot, "stock_skills.sqlite");
  const artifactsDir = path.resolve(analysisRoot, "artifacts");

  const hasSqlite = existsSync(sqlitePath);
  const hasArtifacts = existsSync(artifactsDir);

  if (hasSqlite) files.push("sqlite");
  if (hasArtifacts) files.push("artifacts");

  if (!options.dryRun) {
    mkdirSync(backupDir, { recursive: true });

    if (hasSqlite) {
      cpSync(sqlitePath, path.resolve(backupDir, "stock_skills.sqlite"));
    }
    if (hasArtifacts) {
      cpSync(artifactsDir, path.resolve(backupDir, "artifacts"), { recursive: true });
    }
  }

  return { backupDir, files, dryRun: options.dryRun ?? false };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith("backup-analysis.ts")) {
  const dryRun = process.argv.includes("--dry-run");
  backupAnalysis({ dryRun }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
