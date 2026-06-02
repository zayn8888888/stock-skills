/**
 * RuntimeCommand types and validators for the vNext canonical protocol.
 *
 * All mutating operations enter through RuntimeCommandService as typed commands.
 */

import { z } from "zod";
import { nanoid } from "nanoid";

// ─── Command type enumeration ────────────────────────────────────────

export const RUNTIME_COMMAND_TYPES = [
  "session.create",
  "session.message.append_user",
  "run.start",
  "run.cancel",
  "run.resume",
  "goal.add",
  "goal.evidence.add",
  "artifact.submit",
] as const;

export type RuntimeCommandType = (typeof RUNTIME_COMMAND_TYPES)[number];

// ─── Zod schema ──────────────────────────────────────────────────────

export const RuntimeCommandSchema = z.object({
  commandId: z.string(),
  idempotencyKey: z.string(),
  schemaVersion: z.literal("runtime-command.v1"),
  type: z.enum(RUNTIME_COMMAND_TYPES),
  actor: z.string(),
  source: z.string(),
  createdAt: z.string(),
  // Command-specific fields
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  content: z.string().optional(),
  context: z
    .object({
      ticker: z.string().optional(),
      market: z.string().optional(),
      skillName: z.string().optional(),
      workflowType: z.enum(["data_workflow", "agent_workflow"]).optional(),
      goalId: z.string().optional(),
    })
    .optional(),
  startRun: z.boolean().optional(),
  goal: z.string().optional(),
  evidence: z.string().optional(),
  artifactId: z.string().optional(),
});

export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;

// ─── Factory ─────────────────────────────────────────────────────────

export interface CreateCommandInput {
  type: RuntimeCommandType;
  sessionId?: string;
  runId?: string;
  content?: string;
  context?: {
    ticker?: string;
    market?: string;
    skillName?: string;
    workflowType?: "data_workflow" | "agent_workflow";
    goalId?: string;
  };
  startRun?: boolean;
  actor: string;
  source: string;
  idempotencyKey?: string;
  goal?: string;
  evidence?: string;
  artifactId?: string;
}

/**
 * Create a RuntimeCommand with auto-generated commandId and idempotencyKey.
 */
export function createCommand(input: CreateCommandInput): RuntimeCommand {
  return {
    commandId: nanoid(),
    idempotencyKey: input.idempotencyKey ?? `${input.type}:${input.sessionId ?? "none"}:${nanoid()}`,
    schemaVersion: "runtime-command.v1",
    type: input.type,
    actor: input.actor,
    source: input.source,
    createdAt: new Date().toISOString(),
    sessionId: input.sessionId,
    runId: input.runId,
    content: input.content,
    context: input.context,
    startRun: input.startRun,
    goal: input.goal,
    evidence: input.evidence,
    artifactId: input.artifactId,
  };
}
