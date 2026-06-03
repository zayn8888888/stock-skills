import { describe, expect, it } from "vitest";
import { formatSse, formatHeartbeat, formatConnected } from "@/lib/runtime/projectors";
import { createRuntimeEvent } from "@/lib/runtime/events";

describe("formatSse", () => {
  it("emits event: runtime.event for all event types", () => {
    const event = createRuntimeEvent({
      sessionId: "s1",
      type: "run.started",
      category: "lifecycle",
      payload: { status: "running" },
    });
    event.sessionSeq = 42;

    const sse = formatSse(event);
    expect(sse).toContain("event: runtime.event");
    expect(sse).toContain("id: 42");
    expect(sse).toContain('"type":"run.started"');
  });

  it("does NOT emit old event names", () => {
    const event = createRuntimeEvent({
      sessionId: "s1",
      type: "model.text.delta",
      category: "model",
      payload: { delta: "hello" },
    });

    const sse = formatSse(event);
    expect(sse).not.toContain("event: text_delta");
    expect(sse).not.toContain("event: thinking_delta");
    expect(sse).not.toContain("event: tool_call");
    expect(sse).not.toContain("event: tool_result");
    expect(sse).not.toContain("event: run.updated");
  });

  it("formats as valid SSE with double newline terminator", () => {
    const event = createRuntimeEvent({
      sessionId: "s1",
      type: "transport.heartbeat",
      category: "transport",
      payload: {},
    });
    event.sessionSeq = 1;

    const sse = formatSse(event);
    expect(sse).toMatch(/^id: \d+\nevent: runtime\.event\ndata: .+\n\n$/);
  });
});

describe("formatHeartbeat", () => {
  it("creates a heartbeat SSE frame", () => {
    const sse = formatHeartbeat("session1", 5);
    expect(sse).toContain("event: runtime.event");
    expect(sse).toContain('"transport.heartbeat"');
  });
});

describe("formatConnected", () => {
  it("creates a connected SSE frame", () => {
    const sse = formatConnected("session1");
    expect(sse).toContain("event: runtime.event");
    expect(sse).toContain('"transport.connected"');
  });
});
