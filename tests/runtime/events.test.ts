import {
  RUNTIME_EVENT_TYPES,
  RuntimeEventSchema,
  createRuntimeEvent,
  isValidRuntimeEventType,
} from "@/lib/runtime/events";
import { describe, expect, it } from "vitest";

describe("RuntimeEvent", () => {
  it("creates an event with required fields", () => {
    const event = createRuntimeEvent({
      sessionId: "session_1",
      runId: "run_1",
      type: "run.started",
      category: "lifecycle",
      payload: { status: "running" },
    });

    expect(event.id).toBeTruthy();
    expect(event.schemaVersion).toBe("runtime-event.v1");
    expect(event.sessionId).toBe("session_1");
    expect(event.runId).toBe("run_1");
    expect(event.type).toBe("run.started");
    expect(event.category).toBe("lifecycle");
    expect(event.createdAt).toBeTruthy();
  });

  it("validates envelope with Zod", () => {
    const event = createRuntimeEvent({
      sessionId: "session_1",
      type: "transport.heartbeat",
      category: "transport",
      payload: {},
    });

    const parsed = RuntimeEventSchema.parse(event);
    expect(parsed.schemaVersion).toBe("runtime-event.v1");
    expect(parsed.sessionId).toBe("session_1");
  });

  it("rejects event with missing required fields", () => {
    expect(() => RuntimeEventSchema.parse({ type: "run.started" })).toThrow();
  });

  it("sets default values for optional fields", () => {
    const event = createRuntimeEvent({
      sessionId: "s1",
      type: "model.text.delta",
      category: "model",
      payload: { delta: "hello" },
    });

    expect(event.visibility).toBe("ui");
    expect(event.persist).toBe(1);
    expect(event.producer).toBe("server");
  });

  it("allows overriding default values", () => {
    const event = createRuntimeEvent({
      sessionId: "s1",
      type: "transport.heartbeat",
      category: "transport",
      payload: {},
      visibility: "internal",
      persist: 0,
      producer: "system",
    });

    expect(event.visibility).toBe("internal");
    expect(event.persist).toBe(0);
    expect(event.producer).toBe("system");
  });
});

describe("RUNTIME_EVENT_TYPES", () => {
  it("contains all canonical v1 event types", () => {
    const expected = [
      "session.created",
      "session.message.created",
      "run.created",
      "run.started",
      "run.progressed",
      "run.completed",
      "run.failed",
      "run.cancel_requested",
      "run.cancelled",
      "model.text.started",
      "model.text.delta",
      "model.text.completed",
      "model.reasoning.delta",
      "tool.call.created",
      "tool.call.args_delta",
      "tool.call.started",
      "tool.call.completed",
      "tool.call.failed",
      "artifact.created",
      "data.source.selected",
      "data.source.failed_over",
      "error.created",
      "transport.connected",
      "transport.heartbeat",
      "transport.disconnected",
    ];

    for (const type of expected) {
      expect(RUNTIME_EVENT_TYPES).toContain(type);
    }
  });

  it("isValidRuntimeEventType returns true for valid types", () => {
    expect(isValidRuntimeEventType("run.started")).toBe(true);
    expect(isValidRuntimeEventType("model.text.delta")).toBe(true);
    expect(isValidRuntimeEventType("tool.call.created")).toBe(true);
  });

  it("isValidRuntimeEventType returns false for unknown types", () => {
    expect(isValidRuntimeEventType("unknown_event")).toBe(false);
    expect(isValidRuntimeEventType("text_delta")).toBe(false);
    expect(isValidRuntimeEventType("run.updated")).toBe(false);
  });
});
