import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  FORBIDDEN_RUNTIME_PATTERNS,
  MIGRATION_ONLY_ALLOWLIST,
  TEMPORARY_OLD_FILE_ALLOWLIST,
} from "../src/lib/runtime/no-debt";

export interface DebtCheckResult {
  violations: DebtViolation[];
  filesScanned: number;
  strict: boolean;
}

export interface DebtViolation {
  file: string;
  line: number;
  pattern: string;
  matched: string;
}

const SCAN_DIRS = ["src/app", "src/lib", "tests"];
const SKIP_DIRS = ["src/lib/db/migrations", "node_modules"];

/**
 * Scan the codebase for forbidden old-runtime patterns.
 *
 * - Default mode: allows TEMPORARY_OLD_FILE_ALLOWLIST + MIGRATION_ONLY_ALLOWLIST.
 * - Strict mode: only MIGRATION_ONLY_ALLOWLIST is allowed.
 */
export async function checkNoRuntimeDebt(
  options: { strict?: boolean } = {},
): Promise<DebtCheckResult> {
  const strict = options.strict ?? false;
  const violations: DebtViolation[] = [];
  let filesScanned = 0;

  const allowedPaths = strict
    ? new Set<string>(MIGRATION_ONLY_ALLOWLIST.map((p) => path.resolve(p)))
    : new Set<string>([
        ...TEMPORARY_OLD_FILE_ALLOWLIST.map((p) => path.resolve(p)),
        ...MIGRATION_ONLY_ALLOWLIST.map((p) => path.resolve(p)),
      ]);

  // Build compiled regex patterns
  const patterns = FORBIDDEN_RUNTIME_PATTERNS.map((raw) => {
    try {
      return { raw, regex: new RegExp(raw, "i") };
    } catch {
      return { raw, regex: new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
    }
  });

  for (const dir of SCAN_DIRS) {
    const absDir = path.resolve(dir);
    scanDir(absDir, patterns, allowedPaths, violations, () => filesScanned++);
  }

  return { violations, filesScanned, strict };
}

function scanDir(
  dir: string,
  patterns: Array<{ raw: string; regex: RegExp }>,
  allowedPaths: Set<string>,
  violations: DebtViolation[],
  onFile: () => void,
): void {
  const resolvedDir = path.resolve(dir);

  // Skip entire directories in the skip list
  for (const skipDir of SKIP_DIRS) {
    if (resolvedDir.startsWith(path.resolve(skipDir))) return;
  }

  let entries: string[];
  try {
    entries = readdirSync(resolvedDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(resolvedDir, entry);
    const relPath = path.relative(process.cwd(), fullPath);

    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, patterns, allowedPaths, violations, onFile);
        continue;
      }
      if (!stat.isFile() || !/\.(ts|tsx|js|jsx)$/.test(entry)) continue;
    } catch {
      continue;
    }

    // Check if this file is in any allowlist
    let allowed = false;
    for (const prefix of allowedPaths) {
      if (fullPath.startsWith(prefix) || fullPath === prefix) {
        allowed = true;
        break;
      }
    }
    if (allowed) continue;

    onFile();

    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { raw, regex } of patterns) {
        if (regex.test(line)) {
          violations.push({
            file: relPath,
            line: i + 1,
            pattern: raw,
            matched: line.trim().slice(0, 120),
          });
        }
      }
    }
  }
}

// CLI entrypoint
if (process.argv[1]?.endsWith("check-no-runtime-debt.ts")) {
  const strict = process.argv.includes("--strict");
  checkNoRuntimeDebt({ strict }).then((result) => {
    console.log(`Scanned ${result.filesScanned} files (strict=${result.strict})`);
    if (result.violations.length === 0) {
      console.log("✅ No runtime debt violations found.");
    } else {
      console.log(`❌ Found ${result.violations.length} violation(s):`);
      for (const v of result.violations) {
        console.log(`  ${v.file}:${v.line} — ${v.pattern}`);
        console.log(`    ${v.matched}`);
      }
      process.exit(1);
    }
  });
}
