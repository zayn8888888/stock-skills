import type { RunnerInput } from "@/lib/runners/base";
import { ModernOpenAIAgentsRunner } from "@/lib/runners/openai-agents";
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
  it("loads the installed OpenAI Agents SDK", async () => {
    const sdk = await import("@openai/agents");

    expect(typeof sdk.Agent).toBe("function");
    expect(typeof sdk.Runner).toBe("function");
  });

  it("fails instead of returning stub output when the SDK cannot load", async () => {
    const runner = new ModernOpenAIAgentsRunner({
      loadSdk: async () => {
        throw new Error("SDK unavailable");
      },
    });
    const sink = createMockSink();
    const controller = new AbortController();

    const result = await runner.run(makeInput(), {
      signal: controller.signal,
      events: sink,
      logger,
    });

    expect(result.status).toBe("failed");
    expect(result.text).toBeUndefined();
    expect(result.error).toContain("SDK unavailable");
    expect(sink.emitted).toContain("error.created");
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
