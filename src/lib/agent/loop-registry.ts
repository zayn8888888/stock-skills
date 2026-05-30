/**
 * Registry mapping active runIds to their AgentLoop instances.
 *
 * Used by the cancel route to look up and cancel a running loop.
 */

import type { AgentLoop } from "./loop";

const loops = new Map<string, AgentLoop>();

/** Register an active AgentLoop for a run. */
export function registerLoop(runId: string, loop: AgentLoop): void {
  loops.set(runId, loop);
}

/** Unregister an AgentLoop after it completes or is cancelled. */
export function unregisterLoop(runId: string): void {
  loops.delete(runId);
}

/** Look up an active AgentLoop by runId. */
export function getLoop(runId: string): AgentLoop | undefined {
  return loops.get(runId);
}
