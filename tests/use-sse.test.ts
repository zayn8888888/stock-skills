import { getSSEEventData } from "@/hooks/useSSE";
import { describe, expect, it } from "vitest";

describe("useSSE event parsing", () => {
  it("ignores native EventSource error events without message data", () => {
    expect(getSSEEventData(new Event("error"))).toBeNull();
  });

  it("keeps custom SSE message event data", () => {
    expect(getSSEEventData(new MessageEvent("error", { data: '{"message":"failed"}' }))).toBe(
      '{"message":"failed"}',
    );
  });
});
