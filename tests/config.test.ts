import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("getConfig", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("supports Anthropic-compatible provider env names", async () => {
    process.env.STOCK_SKILLS_ANALYSIS_ROOT = "/tmp/stock-skills-test-analysis";
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_BASE_URL = "https://example.test/anthropic";
    process.env.MODEL_ID = "mimo-v2.5-pro";
    process.env.LLM_MODEL = undefined;

    const { getConfig } = await import("@/lib/config");

    expect(getConfig()).toMatchObject({
      anthropicApiKey: "test-key",
      anthropicBaseUrl: "https://example.test/anthropic",
      llmModel: "mimo-v2.5-pro",
    });
  });
});
