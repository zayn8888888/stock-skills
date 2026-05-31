import { describe, expect, it } from "vitest";

import { buildMessageContext, inferTicker } from "@/lib/research/message-context";

describe("message context inference", () => {
  it("does not treat common UI/test acronyms as stock tickers", () => {
    expect(inferTicker("UI smoke test: respond with OK")).toBeUndefined();
    expect(inferTicker("API health check")).toBeUndefined();
  });

  it("still infers explicit market symbols from research prompts", () => {
    expect(inferTicker("分析 NVDA")).toBe("NVDA");
    expect(inferTicker("AAPL 多空辩论")).toBe("AAPL");
  });

  it("uses explicit composer context ahead of inferred text", () => {
    expect(buildMessageContext("UI smoke test", { ticker: "NVDA" })).toMatchObject({
      ticker: "NVDA",
      skill_name: "stock-analyzer",
    });
  });
});
