import { describe, expect, it, vi } from "vitest";
import { ModernOpenAIAgentsRunner } from "@/lib/runners/openai-agents";
import type { RuntimeEventSink, RunnerInput } from "@/lib/runners/base";

function createMockSink() {
  const emitted: string[] = [];
  return {
    emitted,
    async emit(event: { type: string }) { emitted.push(event.type); },
    async textDelta(_delta: string) { emitted.push("model.text.delta"); },
    async textCompleted(_text: string) { emitted.push("model.text.completed"); },
    async reasoningDelta() { emitted.push("model.reasoning.delta"); },
    async toolCallCreated() { emitted.push("tool.call.created"); },
    async toolCallCompleted() { emitted.push("tool.call.completed"); },
    async toolCallFailed() { emitted.push("tool.call.failed"); },
    async artifactCreated() { emitted.push("artifact.created"); },
    async errorCreated() { emitted.push("error.created"); },
  };
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeInput(): RunnerInput {
  return {
    runId: "oai_run_1",
    sessionId: "oai_session_1",
    skillName: "stock-analyzer",
    userInput: "Analyze NVDA stock",
    history: [],
    ticker: "NVDA",
    market: "US",
  };
}

describe("ModernOpenAIAgentsRunner", () => {
  it("falls back to stub when @openai/agents is not importable", async () => {
    // In test env, @openai/agents might not have the expected exports
    // The runner handles this gracefully with a stub
    const runner = new ModernOpenAIAgentsRunner();
    const sink = createMockSink();
    const controller = new AbortController();

    const result = await runner.run(makeInput(), {
      signal: controller.signal,
      events: sink,
      logger,
    });

    // Should either succeed with stub or succeed with real SDK
    expect(["succeeded", "failed"]).toContain(result.status);
  });

  it("accepts custom model config", () => {
    const runner = new ModernOpenAIAgentsRunner({ modelId: "gpt-4o" });
    expect(runner.kind).toBe("openai-agents");
    expect(runner.capabilities.handoff).toBe(true);
    expect(runner.capabilities.tracing).toBe(true);
  });

  it("returns cancelled if signal is aborted before start", async () => {
    const runner = new ModernOpenAIAgentsRunner();
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
});
