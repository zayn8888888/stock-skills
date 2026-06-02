/**
 * State machine transition guards for run, tool, and message lifecycle.
 *
 * All state transitions MUST go through these guards. Invalid transitions
 * throw with a descriptive error and produce an error.created event.
 */

// ─── Run state machine ───────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_for_input"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";

export const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelling", "waiting_for_input"],
  waiting_for_input: ["running", "cancelled"],
  cancelling: ["cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

/**
 * Assert that a run status transition is valid.
 * Throws with a descriptive error if the transition is not allowed.
 */
export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  const allowed = RUN_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`invalid transition: run cannot go from "${from}" to "${to}"`);
  }
}

// ─── Tool state machine ──────────────────────────────────────────────

export type ToolStatus =
  | "created"
  | "args_streaming"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export const TOOL_TRANSITIONS: Record<ToolStatus, ToolStatus[]> = {
  created: ["args_streaming", "running", "skipped"],
  args_streaming: ["running"],
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
  skipped: [],
};

/**
 * Assert that a tool status transition is valid.
 */
export function assertToolTransition(from: ToolStatus, to: ToolStatus): void {
  const allowed = TOOL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`invalid transition: tool cannot go from "${from}" to "${to}"`);
  }
}

// ─── Message status ──────────────────────────────────────────────────

export type MessageStatus = "created" | "visible" | "failed_to_process";

export const MESSAGE_TRANSITIONS: Record<MessageStatus, MessageStatus[]> = {
  created: ["visible", "failed_to_process"],
  visible: [],
  failed_to_process: [],
};

/**
 * Assert that a message status transition is valid.
 */
export function assertMessageTransition(from: MessageStatus, to: MessageStatus): void {
  const allowed = MESSAGE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`invalid transition: message cannot go from "${from}" to "${to}"`);
  }
}
