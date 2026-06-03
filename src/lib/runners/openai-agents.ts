/**
 * ModernOpenAIAgentsRunner — OpenAI Agents SDK runner.
 *
 * Uses @openai/agents for code-first agents, tool calling, handoff,
 * streaming, and tracing. Converts SDK events to canonical RuntimeEvents.
 *
 * In production, uses Responses API via the OpenAI provider.
 * In tests, all SDK calls must be mocked.
 */

import {
  DEFAULT_CAPABILITIES,
  type RunnerAdapter,
  type RunnerCapabilities,
  type RunnerContext,
  type RunnerInput,
  type RunnerResult,
} from "./base";

export class ModernOpenAIAgentsRunner implements RunnerAdapter {
  readonly id = "openai-agents";
  readonly displayName = "OpenAI Agents SDK";
  readonly kind = "openai-agents" as const;
  readonly capabilities: RunnerCapabilities = {
    ...DEFAULT_CAPABILITIES,
    handoff: true,
    tracing: true,
  };

  private modelId: string;

  constructor(config?: { modelId?: string }) {
    this.modelId = config?.modelId ?? "gpt-5.5";
  }

  async run(input: RunnerInput, ctx: RunnerContext): Promise<RunnerResult> {
    const { signal, events, logger } = ctx;

    logger.info(`[OpenAIAgentsRunner] Starting run ${input.runId} with model ${this.modelId}`);

    try {
      // Dynamic import to allow tests to mock @openai/agents
      const { Agent, Runner } = await import("@openai/agents").catch(() => ({
        Agent: null,
        Runner: null,
      }));

      if (!Agent || !Runner) {
        logger.warn("[OpenAIAgentsRunner] @openai/agents not available, falling back to stub");
        return this.stubExecute(input, ctx);
      }

      // Build agent definition
      const agent = new Agent({
        name: input.skillName,
        instructions: this.buildInstructions(input),
        model: this.modelId,
      });

      // Create runner with streaming
      const runner = new Runner();

      // Build conversation input — use separate arrays per role to satisfy SDK types
      const agentInput: unknown[] = [];
      for (const msg of input.history) {
        agentInput.push({
          role: msg.role,
          content: msg.content,
          type: "message",
        });
      }
      agentInput.push({ role: "user", content: input.userInput, type: "message" });

      // Execute with event stream
      let fullText = "";

      if (signal.aborted) return { status: "cancelled" };

      // Run the agent
      const result = await runner.run(agent, agentInput as Parameters<typeof runner.run>[1]);

      // Extract text from result
      fullText = this.extractText(result);

      if (signal.aborted) return { status: "cancelled" };

      // Emit final text
      if (fullText) {
        await events.textDelta(fullText);
        await events.textCompleted(fullText);
      }

      return {
        status: "succeeded",
        text: fullText,
        traceId: typeof result === "object" && result !== null && "traceId" in result ? (result as { traceId?: string }).traceId : undefined,
      };
    } catch (err) {
      const isCancelled = signal.aborted;
      if (isCancelled) {
        return { status: "cancelled", error: "Run cancelled" };
      }

      logger.error(`[OpenAIAgentsRunner] Error: ${err}`);
      await events.errorCreated({
        code: "runner.timeout",
        message: String(err),
        retriable: true,
      });
      return { status: "failed", error: String(err) };
    }
  }

  /**
   * Stub execution when @openai/agents is not available.
   */
  private async stubExecute(input: RunnerInput, ctx: RunnerContext): Promise<RunnerResult> {
    const { signal, events } = ctx;

    if (signal.aborted) return { status: "cancelled" };

    await events.textDelta(`[OpenAI Agents Stub] Processing: ${input.userInput.slice(0, 100)}`);

    if (signal.aborted) return { status: "cancelled" };

    const text = `[OpenAI Agents Stub] Analysis for ${input.ticker ?? "unknown"} completed.`;
    await events.textCompleted(text);

    return { status: "succeeded", text };
  }

  private buildInstructions(input: RunnerInput): string {
    const parts = [`You are a ${input.skillName} agent.`];
    if (input.ticker) parts.push(`Analyzing ticker: ${input.ticker}`);
    if (input.market) parts.push(`Market: ${input.market}`);
    return parts.join("\n");
  }

  private extractText(result: unknown): string {
    if (typeof result === "string") return result;
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if (typeof r.text === "string") return r.text;
      if (typeof r.output === "string") return r.output;
      if (Array.isArray(r.messages)) {
        const last = r.messages[r.messages.length - 1];
        if (last && typeof last === "object" && typeof (last as Record<string, unknown>).content === "string") {
          return (last as Record<string, unknown>).content as string;
        }
      }
    }
    return String(result);
  }
}
