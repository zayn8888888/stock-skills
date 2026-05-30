import { describe, expect, it } from "vitest";

import { normalizeSession } from "@/lib/sessions";

describe("normalizeSession", () => {
  it("normalizes API session_id rows into UI session entries", () => {
    expect(
      normalizeSession({
        session_id: "abc123",
        title: "分析 NVDA 股票",
        status: "active",
      }),
    ).toEqual({
      id: "abc123",
      title: "分析 NVDA 股票",
      status: "active",
    });
  });
});
