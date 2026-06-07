import type { RunnerInput } from "@/lib/runners/base";
import { MastraWorkflowRunner } from "@/lib/runners/mastra-workflow";
import { describe, expect, it, vi } from "vitest";

function createMockSink() {
  const emitted: string[] = [];
  return {
    emitted,
    async emit(event: { type: string }) {
      emitted.push(event.type);
    },
    async textDelta(_delta: string) {
      emitted.push("model.text.delta");
    },
    async textCompleted(_text: string) {
      emitted.push("model.text.completed");
    },
    async reasoningDelta() {
      emitted.push("model.reasoning.delta");
    },
    async toolCallCreated() {
      emitted.push("tool.call.created");
    },
    async toolCallCompleted() {
      emitted.push("tool.call.completed");
    },
    async toolCallFailed() {
      emitted.push("tool.call.failed");
    },
    async artifactCreated() {
      emitted.push("artifact.created");
    },
    async errorCreated() {
      emitted.push("error.created");
    },
  };
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeInput(): RunnerInput {
  return {
    runId: "mastra_run_1",
    sessionId: "mastra_session_1",
    skillName: "market-scanner",
    userInput: "Scan HK market",
    history: [],
    ticker: "HSI",
    market: "HK",
    workflowType: "data_workflow",
  };
}

describe("MastraWorkflowRunner", () => {
  it("executes stub workflow and emits events", async () => {
    const runner = new MastraWorkflowRunner();
    const sink = createMockSink();
    const controller = new AbortController();

    const result = await runner.run(makeInput(), {
      signal: controller.signal,
      events: sink,
      logger,
    });

    expect(result.status).toBe("succeeded");
    expect(result.text).toContain("HSI");

    // Should have emitted tool + text + artifact events
    expect(sink.emitted).toContain("tool.call.created");
    expect(sink.emitted).toContain("tool.call.completed");
    expect(sink.emitted).toContain("model.text.completed");
    expect(sink.emitted).toContain("artifact.created");
  });

  it("returns cancelled if signal is aborted", async () => {
    const runner = new MastraWorkflowRunner();
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

  it("has tracing and evals capabilities", () => {
    const runner = new MastraWorkflowRunner();
    expect(runner.capabilities.tracing).toBe(true);
    expect(runner.capabilities.evals).toBe(true);
    expect(runner.capabilities.structuredOutput).toBe(true);
  });
});
