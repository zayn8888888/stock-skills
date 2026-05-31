/**
 * Registry mapping active runIds to their agent runner instances.
 *
 * Used by the cancel route to look up and cancel a running loop.
 * Uses a minimal Cancellable interface to decouple from specific
 * runner implementations (AgentLoop, PiAgentRunner, etc.).
 */

export interface Cancellable {
  cancel(): void;
}

const loops = new Map<string, Cancellable>();

/** Register an active agent runner for a run. */
export function registerLoop(runId: string, loop: Cancellable): void {
  loops.set(runId, loop);
}

/** Unregister an agent runner after it completes or is cancelled. */
export function unregisterLoop(runId: string): void {
  loops.delete(runId);
}

/** Look up an active agent runner by runId. */
export function getLoop(runId: string): Cancellable | undefined {
  return loops.get(runId);
}
