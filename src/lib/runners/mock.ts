/**
 * MockRunner — deterministic test runner.
 *
 * Emits a fixed sequence of events for command service, SSE, and browser tests.
 * Never makes network calls.
 */

import { nanoid } from "nanoid";
import {
  DEFAULT_CAPABILITIES,
  type RunnerAdapter,
  type RunnerCapabilities,
  type RunnerContext,
  type RunnerInput,
  type RunnerResult,
} from "./base";

export class MockRunner implements RunnerAdapter {
  readonly id = "mock";
  readonly displayName = "Mock Runner (tests)";
  readonly kind = "mock" as const;
  readonly capabilities: RunnerCapabilities = {
    ...DEFAULT_CAPABILITIES,
    tracing: false,
    evals: false,
  };

  async run(input: RunnerInput, ctx: RunnerContext): Promise<RunnerResult> {
    const { signal, events, logger } = ctx;

    logger.info(`[MockRunner] Starting run ${input.runId}`);

    if (signal.aborted) return { status: "cancelled", error: "aborted before start" };

    // 1. model.text.delta
    await events.textDelta("Processing request... ");

    if (signal.aborted) return { status: "cancelled" };

    // 2. tool.call.created
    const toolCallId = nanoid();
    await events.toolCallCreated({ toolCallId, name: "mock_data_fetch", args: { ticker: input.ticker } });

    if (signal.aborted) return { status: "cancelled" };

    // 3. tool.call.completed
    await events.toolCallCompleted({
      toolCallId,
      name: "mock_data_fetch",
      status: "succeeded",
      result: { data: "mock data result" },
    });

    if (signal.aborted) return { status: "cancelled" };

    // 4. model.text.delta (more content)
    await events.textDelta("Analysis complete.");

    if (signal.aborted) return { status: "cancelled" };

    // 5. artifact
    const artifactId = nanoid();
    await events.artifactCreated({
      artifactId,
      kind: "report",
      name: "mock-report.md",
      content: "# Mock Analysis Report\n\nThis is a mock report.",
    });

    if (signal.aborted) return { status: "cancelled" };

    // 6. model.text.completed
    await events.textCompleted("Processing request... Analysis complete.");

    logger.info(`[MockRunner] Run ${input.runId} completed`);

    return {
      status: "succeeded",
      text: "Processing request... Analysis complete.",
      artifacts: [{ kind: "report", name: "mock-report.md", content: "# Mock Analysis Report" }],
    };
  }
}
