import { describe, expect, it } from "vitest";

describe("useSSE (vNext)", () => {
  it("SSE hook interface is well-formed", async () => {
    // useSSE is a React hook; we can't call it outside React.
    // Instead, verify the module exports correctly.
    const mod = await import("@/hooks/useSSE");
    expect(typeof mod.useSSE).toBe("function");
  });
});
