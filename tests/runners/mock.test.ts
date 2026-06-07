import type { RunnerInput, RuntimeEventSink } from "@/lib/runners/base";
import { MockRunner } from "@/lib/runners/mock";
import { describe, expect, it, vi } from "vitest";

function createMockSink(): RuntimeEventSink & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    async emit(event) {
      events.push(event.type);
    },
    async textDelta(_delta) {
      events.push("model.text.delta");
    },
    async textCompleted(_text) {
      events.push("model.text.completed");
    },
    async reasoningDelta() {
      events.push("model.reasoning.delta");
    },
    async toolCallCreated() {
      events.push("tool.call.created");
    },
    async toolCallCompleted() {
      events.push("tool.call.completed");
    },
    async toolCallFailed() {
      events.push("tool.call.failed");
    },
    async artifactCreated() {
      events.push("artifact.created");
    },
    async errorCreated() {
      events.push("error.created");
    },
  };
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeInput(overrides?: Partial<RunnerInput>): RunnerInput {
  return {
    runId: "mock_run_1",
    sessionId: "mock_session_1",
    skillName: "test-skill",
    userInput: "Analyze NVDA",
    history: [],
    ticker: "NVDA",
    market: "US",
    ...overrides,
  };
}

describe("MockRunner", () => {
  it("emits expected event sequence", async () => {
    const runner = new MockRunner();
    const sink = createMockSink();
    const controller = new AbortController();

    const result = await runner.run(makeInput(), {
      signal: controller.signal,
      events: sink,
      logger,
    });

    expect(result.status).toBe("succeeded");
    expect(result.text).toBeTruthy();

    // Verify event sequence
    expect(sink.events).toEqual([
      "model.text.delta",
      "tool.call.created",
      "tool.call.completed",
      "model.text.delta",
      "artifact.created",
      "model.text.completed",
    ]);
  });

  it("returns cancelled if signal is aborted before start", async () => {
    const runner = new MockRunner();
    const sink = createMockSink();
    const controller = new AbortController();
    controller.abort();

    const result = await runner.run(makeInput(), {
      signal: controller.signal,
      events: sink,
      logger,
    });

    expect(result.status).toBe("cancelled");
  });

  it("is deterministic — same input produces same output", async () => {
    const runner = new MockRunner();
    const sink1 = createMockSink();
    const sink2 = createMockSink();
    const controller = new AbortController();

    const r1 = await runner.run(makeInput(), { signal: controller.signal, events: sink1, logger });
    const r2 = await runner.run(makeInput(), { signal: controller.signal, events: sink2, logger });

    expect(r1.status).toBe(r2.status);
    expect(r1.text).toBe(r2.text);
    expect(sink1.events).toEqual(sink2.events);
  });
});
