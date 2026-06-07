import { describe, expect, it } from "vitest";
import { checkNoRuntimeDebt } from "../../scripts/check-no-runtime-debt";

describe("runtime no-debt guard", () => {
  it("keeps new runtime files free of old protocol and Pi imports", async () => {
    const result = await checkNoRuntimeDebt({ strict: false });
    // Violations printed for debugging
    if (result.violations.length > 0) {
      console.log(
        "Violations:\n",
        result.violations.map((v) => `${v.file}:${v.line} — ${v.pattern}`).join("\n"),
      );
    }
    expect(result.violations).toEqual([]);
  });

  it("strict mode only allows migration fixtures and docs", async () => {
    const result = await checkNoRuntimeDebt({ strict: true });
    expect(result.violations).toEqual([]);
  });
});
