/**
 * AG-UI Command — converts AG-UI RunAgentInput to RuntimeCommand.
 */

import { type RuntimeCommand, createCommand } from "@/lib/runtime/commands";
import { nanoid } from "nanoid";

export interface AgUiRunInput {
  threadId?: string;
  runId?: string;
  messages?: Array<{
    role: string;
    content?: string;
  }>;
  tools?: unknown[];
  context?: Record<string, unknown>;
  forwardedProps?: Record<string, unknown>;
}

/**
 * Parse an AG-UI RunAgentInput into a RuntimeCommand.
 *
 * - Resolves threadId to sessionId
 * - Converts the latest user message to session.message.append_user
 * - Sets source to "ag_ui"
 */
export function parseAgUiInput(input: AgUiRunInput): RuntimeCommand {
  const sessionId = input.threadId;
  const lastUserMessage = [...(input.messages ?? [])].reverse().find((m) => m.role === "user");

  const content = lastUserMessage?.content ?? "";

  return createCommand({
    type: "session.message.append_user",
    sessionId,
    content,
    context: {
      skillName: (input.context?.skillName as string) ?? "default",
      ticker: (input.context?.ticker as string) ?? undefined,
      market: (input.context?.market as string) ?? undefined,
    },
    startRun: true,
    actor: "web_ui",
    source: "ag_ui",
    idempotencyKey: `ag_ui:${sessionId ?? "new"}:${input.runId ?? nanoid()}`,
  });
}
