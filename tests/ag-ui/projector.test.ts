import { describe, expect, it } from "vitest";
import { projectToAgUi, projectBatch } from "@/lib/ag-ui/projector";
import { createRuntimeEvent } from "@/lib/runtime/events";
import { EventType } from "@ag-ui/core";

function testEvent(type: string, payload: Record<string, unknown> = {}) {
  return createRuntimeEvent({
    sessionId: "s1",
    runId: "run1",
    type,
    category: "lifecycle",
    payload,
  });
}

describe("AG-UI Projector", () => {
  it("maps run.started to RUN_STARTED", () => {
    const event = testEvent("run.started", { status: "running" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.RUN_STARTED);
    expect(agUi!.threadId).toBe("s1");
    expect(agUi!.runId).toBe("run1");
  });

  it("maps model.text.delta to TEXT_MESSAGE_CONTENT", () => {
    const event = testEvent("model.text.delta", { delta: "hello" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(agUi!.delta).toBe("hello");
  });

  it("maps model.text.started to TEXT_MESSAGE_START", () => {
    const event = testEvent("model.text.started", {});
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.TEXT_MESSAGE_START);
  });

  it("maps model.text.completed to TEXT_MESSAGE_END", () => {
    const event = testEvent("model.text.completed", { text: "done" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.TEXT_MESSAGE_END);
  });

  it("maps tool.call.created to TOOL_CALL_START", () => {
    const event = testEvent("tool.call.created", { name: "get_quote" }, {});
    event.toolCallId = "tc1";
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.TOOL_CALL_START);
    expect(agUi!.toolCallId).toBe("tc1");
    expect(agUi!.toolName).toBe("get_quote");
  });

  it("maps tool.call.completed to TOOL_CALL_END", () => {
    const event = testEvent("tool.call.completed", { status: "succeeded" });
    event.toolCallId = "tc1";
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.TOOL_CALL_END);
    expect(agUi!.toolCallId).toBe("tc1");
  });

  it("maps run.completed to RUN_FINISHED", () => {
    const event = testEvent("run.completed", { status: "succeeded" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.RUN_FINISHED);
  });

  it("maps run.failed to RUN_ERROR", () => {
    const event = testEvent("run.failed", { code: "runner.timeout" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.RUN_ERROR);
  });

  it("maps error.created to RUN_ERROR", () => {
    const event = testEvent("error.created", { code: "tool.failed", message: "bad" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.RUN_ERROR);
  });

  it("maps artifact.created to STATE_DELTA", () => {
    const event = testEvent("artifact.created", { kind: "report", name: "report.md" });
    event.artifactId = "a1";
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.STATE_DELTA);
  });

  it("maps data.source.selected to CUSTOM", () => {
    const event = testEvent("data.source.selected", { provider: "futu" });
    const agUi = projectToAgUi(event);
    expect(agUi).not.toBeNull();
    expect(agUi!.type).toBe(EventType.CUSTOM);
  });

  it("returns null for transport events", () => {
    expect(projectToAgUi(testEvent("transport.connected"))).toBeNull();
    expect(projectToAgUi(testEvent("transport.heartbeat"))).toBeNull();
  });

  it("returns null for session events", () => {
    expect(projectToAgUi(testEvent("session.created"))).toBeNull();
    expect(projectToAgUi(testEvent("run.created"))).toBeNull();
  });
});

describe("projectBatch", () => {
  it("filters out null projections", () => {
    const events = [
      testEvent("transport.connected"),
      testEvent("run.started"),
      testEvent("model.text.delta", { delta: "hi" }),
      testEvent("transport.heartbeat"),
      testEvent("run.completed"),
    ];

    const projected = projectBatch(events);
    expect(projected.length).toBe(3);
    expect(projected[0].type).toBe(EventType.RUN_STARTED);
    expect(projected[1].type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(projected[2].type).toBe(EventType.RUN_FINISHED);
  });
});
