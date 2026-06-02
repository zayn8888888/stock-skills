import * as fs from "node:fs";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupAnalysis } from "../../scripts/backup-analysis";

describe("backupAnalysis", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("in dry-run mode reports what would be backed up", async () => {
    const result = await backupAnalysis({ dryRun: true });
    expect(result.backupDir).toContain("backups/");
    expect(result.files).toBeInstanceOf(Array);
    expect(result.dryRun).toBe(true);
  });

  it("copies sqlite and artifacts into a timestamped backup directory", async () => {
    const fakeAnalysis = path.join(tmpDir, "analysis");
    mkdirSync(path.join(fakeAnalysis, "artifacts"), { recursive: true });
    writeFileSync(path.join(fakeAnalysis, "stock_skills.sqlite"), "fake-db-content");
    writeFileSync(path.join(fakeAnalysis, "artifacts", "report.md"), "# Report");

    const result = await backupAnalysis({ analysisRoot: fakeAnalysis });

    expect(result.backupDir).toContain("backups/");
    expect(result.files).toContain("sqlite");
    expect(result.files).toContain("artifacts");
    expect(existsSync(result.backupDir)).toBe(true);
    expect(existsSync(path.join(result.backupDir, "stock_skills.sqlite"))).toBe(true);
    expect(existsSync(path.join(result.backupDir, "artifacts", "report.md"))).toBe(true);
  });

  it("never exposes .env values", async () => {
    const result = await backupAnalysis({ dryRun: true });
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("ANTHROPIC_API_KEY");
    expect(resultStr).not.toContain("STOCK_SKILLS_TOKEN");
  });
});
