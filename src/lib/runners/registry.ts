/**
 * Runner registry — selects the appropriate RunnerAdapter for a given run.
 *
 * Default selection:
 * - If workflowType is "data_workflow": mastra
 * - If NODE_ENV === "test" or config requests mock: mock
 * - Otherwise: openai-agents (default code-first agent)
 */

import { MockRunner } from "./mock";
import { ModernOpenAIAgentsRunner } from "./openai-agents";
import { MastraWorkflowRunner } from "./mastra-workflow";
import type { RunnerAdapter, RunnerKind } from "./base";

const runners = new Map<RunnerKind, RunnerAdapter>();

function getRunnerMap(): Map<RunnerKind, RunnerAdapter> {
  if (runners.size === 0) {
    runners.set("mock", new MockRunner());
    runners.set("openai-agents", new ModernOpenAIAgentsRunner());
    runners.set("mastra", new MastraWorkflowRunner());
  }
  return runners;
}

/**
 * Get a runner by kind.
 */
export function getRunner(kind: RunnerKind): RunnerAdapter {
  const runner = getRunnerMap().get(kind);
  if (!runner) throw new Error(`Unknown runner kind: ${kind}`);
  return runner;
}

/**
 * Select the default runner based on intent.
 */
export function selectRunner(options?: {
  workflowType?: string;
  intent?: string;
  forceRunner?: RunnerKind;
}): RunnerAdapter {
  if (options?.forceRunner) {
    return getRunner(options.forceRunner);
  }

  if (process.env.NODE_ENV === "test" || process.env.USE_MOCK_RUNNER === "true") {
    return getRunner("mock");
  }

  if (options?.workflowType === "data_workflow") {
    return getRunner("mastra");
  }

  return getRunner("openai-agents");
}

/**
 * Register a custom runner (for tests or external integrations).
 */
export function registerRunner(kind: RunnerKind, runner: RunnerAdapter): void {
  getRunnerMap().set(kind, runner);
}
