import { describe, expect, it } from "vitest";

import { deriveDurationMs } from "@/lib/runs/duration";

describe("deriveDurationMs", () => {
  it("uses persisted duration when present", () => {
    expect(
      deriveDurationMs({
        durationMs: 1234,
        startedAt: "2026-05-31T10:00:00.000Z",
        finishedAt: "2026-05-31T10:00:02.000Z",
      }),
    ).toBe(1234);
  });

  it("derives duration from started and finished timestamps when missing", () => {
    expect(
      deriveDurationMs({
        durationMs: null,
        startedAt: "2026-05-31T10:00:00.000Z",
        finishedAt: "2026-05-31T10:00:02.250Z",
      }),
    ).toBe(2250);
  });

  it("returns null for incomplete or invalid timestamps", () => {
    expect(deriveDurationMs({ durationMs: null, startedAt: null, finishedAt: null })).toBeNull();
    expect(
      deriveDurationMs({
        durationMs: null,
        startedAt: "not-a-date",
        finishedAt: "2026-05-31T10:00:02.250Z",
      }),
    ).toBeNull();
  });
});
