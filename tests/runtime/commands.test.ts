import { describe, expect, it } from "vitest";
import {
  createCommand,
  RuntimeCommandSchema,
  RUNTIME_COMMAND_TYPES,
  type RuntimeCommand,
} from "@/lib/runtime/commands";

describe("RuntimeCommand", () => {
  it("creates a valid append_user message command", () => {
    const cmd = createCommand({
      type: "session.message.append_user",
      sessionId: "session_1",
      content: "Analyze NVDA",
      source: "research_desk",
      actor: "web_ui",
    });

    expect(cmd.commandId).toBeTruthy();
    expect(cmd.idempotencyKey).toBeTruthy();
    expect(cmd.schemaVersion).toBe("runtime-command.v1");
    expect(cmd.type).toBe("session.message.append_user");
    expect(cmd.source).toBe("research_desk");
    expect(cmd.actor).toBe("web_ui");
    expect(cmd.createdAt).toBeTruthy();
  });

  it("validates command with Zod", () => {
    const cmd = createCommand({
      type: "run.start",
      sessionId: "session_1",
      source: "research_desk",
      actor: "web_ui",
    });

    const parsed = RuntimeCommandSchema.parse(cmd);
    expect(parsed.schemaVersion).toBe("runtime-command.v1");
    expect(parsed.type).toBe("run.start");
  });

  it("rejects command with missing required fields", () => {
    expect(() =>
      RuntimeCommandSchema.parse({ type: "run.start" }),
    ).toThrow();
  });

  it("requires source and actor", () => {
    expect(() =>
      RuntimeCommandSchema.parse({
        type: "run.start",
        sessionId: "s1",
        source: "research_desk",
        // missing actor
      }),
    ).toThrow();
  });

  it("uses provided idempotency key", () => {
    const cmd = createCommand({
      type: "run.cancel",
      sessionId: "session_1",
      runId: "run_1",
      source: "research_desk",
      actor: "web_ui",
      idempotencyKey: "custom_key_123",
    });

    expect(cmd.idempotencyKey).toBe("custom_key_123");
  });
});

describe("RUNTIME_COMMAND_TYPES", () => {
  it("contains all canonical v1 command types", () => {
    const expected = [
      "session.create",
      "session.message.append_user",
      "run.start",
      "run.cancel",
      "run.resume",
      "goal.add",
      "goal.evidence.add",
      "artifact.submit",
    ];

    for (const type of expected) {
      expect(RUNTIME_COMMAND_TYPES).toContain(type);
    }
  });
});
