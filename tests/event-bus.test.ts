import { afterEach, describe, expect, it, vi } from "vitest";

describe("event bus singleton", () => {
  afterEach(() => {
    (globalThis as { __eventBus?: unknown }).__eventBus = undefined;
  });

  it("replaces stale hot-reload singletons that lack active replay support", async () => {
    vi.resetModules();
    (globalThis as { __eventBus?: unknown }).__eventBus = {
      emit() {},
      replay() {
        return [];
      },
      subscribe() {
        return () => {};
      },
      toSSE() {
        return "";
      },
    };

    const { eventBus } = await import("@/lib/runtime/event-bus");

    expect(typeof eventBus.replayActiveRun).toBe("function");
  });
});
