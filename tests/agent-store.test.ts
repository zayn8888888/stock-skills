import { beforeEach, describe, expect, it, vi } from "vitest";

describe("agent store (vNext)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loadTimeline populates runtime state from server response", async () => {
    const { useAgentStore } = await import("@/stores/agent");

    const timeline = {
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Analyze NVDA",
          messageType: "plain",
          runId: null,
          createdAt: "2026-06-03T00:00:00Z",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Here is the analysis...",
          messageType: "assistant_final",
          runId: "run-1",
          createdAt: "2026-06-03T00:00:05Z",
        },
      ],
      runs: [
        {
          id: "run-1",
          status: "succeeded",
          skillName: "stock-analyzer",
          ticker: "NVDA",
          createdAt: "2026-06-03T00:00:00Z",
          finishedAt: "2026-06-03T00:00:10Z",
        },
      ],
      toolCalls: [
        {
          id: "tc-1",
          runId: "run-1",
          name: "get_quote_snapshot",
          status: "succeeded",
          createdAt: "2026-06-03T00:00:01Z",
        },
      ],
      artifacts: [
        {
          id: "art-1",
          runId: "run-1",
          kind: "report",
          name: "report.md",
          path: "/tmp/report.md",
        },
      ],
      activeRunId: null,
    };

    useAgentStore.getState().loadTimeline("session-1", timeline);

    const msgs = useAgentStore.getState().messages();
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Analyze NVDA");
    expect(msgs[1].role).toBe("assistant");
  });

  it("returns cached derived arrays for an unchanged runtime snapshot", async () => {
    const { useAgentStore } = await import("@/stores/agent");
    const state = useAgentStore.getState();
    const messages = state.messages();
    const toolCalls = state.toolCalls();

    expect(messages).toBe(state.messages());
    expect(toolCalls).toBe(state.toolCalls());

    state.loadTimeline("session-cache", {
      messages: [],
      runs: [],
      toolCalls: [],
      artifacts: [],
      activeRunId: null,
    });

    expect(useAgentStore.getState().messages()).not.toBe(messages);
    expect(useAgentStore.getState().toolCalls()).not.toBe(toolCalls);
  });

  it("switches to a ready empty workspace for a new session", async () => {
    const { useAgentStore } = await import("@/stores/agent");

    useAgentStore.getState().loadTimeline("session-existing", {
      messages: [],
      runs: [],
      toolCalls: [],
      artifacts: [],
      activeRunId: null,
    });
    useAgentStore.getState().switchSession("");

    expect(useAgentStore.getState()).toMatchObject({
      sessionId: null,
      sessionLoading: false,
    });
  });

  it("addRuntimeEvent handles model.text.delta", async () => {
    const { useAgentStore } = await import("@/stores/agent");
    const { createRuntimeEvent } = await import("@/lib/runtime/events");

    // First set up a run
    useAgentStore.getState().loadTimeline("session-2", {
      messages: [],
      runs: [
        {
          id: "run-2",
          status: "running",
          skillName: "test",
          ticker: null,
          createdAt: "2026-06-03T00:00:00Z",
          finishedAt: null,
        },
      ],
      toolCalls: [],
      artifacts: [],
      activeRunId: "run-2",
    });

    // Emit a text delta
    const deltaEvent = createRuntimeEvent({
      sessionId: "session-2",
      runId: "run-2",
      type: "model.text.delta",
      category: "model",
      payload: { delta: "Hello " },
    });

    useAgentStore.getState().addRuntimeEvent(deltaEvent);

    const text = useAgentStore.getState().streamingText();
    expect(text).toBe("Hello ");

    // Emit another delta
    const deltaEvent2 = createRuntimeEvent({
      sessionId: "session-2",
      runId: "run-2",
      type: "model.text.delta",
      category: "model",
      payload: { delta: "world" },
    });

    useAgentStore.getState().addRuntimeEvent(deltaEvent2);

    const text2 = useAgentStore.getState().streamingText();
    expect(text2).toBe("Hello world");
  });

  it("addRuntimeEvent handles tool.call.created and completed", async () => {
    const { useAgentStore } = await import("@/stores/agent");
    const { createRuntimeEvent } = await import("@/lib/runtime/events");

    useAgentStore.getState().loadTimeline("session-3", {
      messages: [],
      runs: [
        {
          id: "run-3",
          status: "running",
          skillName: "test",
          ticker: null,
          createdAt: "2026-06-03T00:00:00Z",
          finishedAt: null,
        },
      ],
      toolCalls: [],
      artifacts: [],
      activeRunId: "run-3",
    });

    const toolEvent = createRuntimeEvent({
      sessionId: "session-3",
      runId: "run-3",
      type: "tool.call.created",
      category: "tool",
      payload: { name: "get_kline", toolCallId: "tc-1" },
    });
    toolEvent.toolCallId = "tc-1";

    useAgentStore.getState().addRuntimeEvent(toolEvent);

    const tcs = useAgentStore.getState().toolCalls();
    expect(tcs.length).toBe(1);
    expect(tcs[0].name).toBe("get_kline");
    expect(tcs[0].status).toBe("running");

    const completeEvent = createRuntimeEvent({
      sessionId: "session-3",
      runId: "run-3",
      type: "tool.call.completed",
      category: "tool",
      payload: { toolCallId: "tc-1", status: "succeeded" },
    });
    completeEvent.toolCallId = "tc-1";

    useAgentStore.getState().addRuntimeEvent(completeEvent);

    const tcs2 = useAgentStore.getState().toolCalls();
    expect(tcs2[0].status).toBe("completed");
  });
});
