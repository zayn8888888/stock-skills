import { parseAgUiInput } from "@/lib/ag-ui/command";
import { describe, expect, it } from "vitest";

describe("parseAgUiInput", () => {
  it("leaves sessionId empty for a new AG-UI thread", () => {
    const command = parseAgUiInput({
      messages: [{ role: "user", content: "Analyze NVDA" }],
    });

    expect(command.sessionId).toBeUndefined();
    expect(command.content).toBe("Analyze NVDA");
  });

  it("maps an existing threadId to sessionId", () => {
    const command = parseAgUiInput({
      threadId: "session_1",
      messages: [{ role: "user", content: "Continue" }],
    });

    expect(command.sessionId).toBe("session_1");
  });
});
