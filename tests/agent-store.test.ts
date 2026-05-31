import type { AgentMessage, ToolCallEntry } from "@/stores/agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("agent store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("restores orphan historical tool events as in-progress activity", async () => {
    const { useAgentStore } = await import("@/stores/agent");

    const messages: AgentMessage[] = [
      {
        id: "msg-1",
        role: "user",
        content: "分析 NVDA",
        timestamp: 1,
      },
    ];
    const toolCall: ToolCallEntry = {
      id: "tool-1",
      name: "get_quote_snapshot",
      status: "completed",
      args: '{"ticker":"NVDA"}',
      result: '{"price":211.14}',
    };

    useAgentStore.getState().loadHistory("session-1", messages, {
      "run-1": [toolCall],
    });

    const state = useAgentStore.getState();
    expect(state.messages).toEqual(messages);
    expect(state.toolCalls).toEqual([toolCall]);
    expect(state.pendingRunId).toBe("run-1");
    expect(state.status).toBe("streaming");
  });
});
