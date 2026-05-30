import Anthropic from "@anthropic-ai/sdk";
import type { EventBus } from "@/lib/runtime/event-bus";
import type { ToolExecutorFn } from "./tools";

// ──────────────────── types ─────────────────────────────────────────

export interface AgentResult {
  /** Final text content from the assistant */
  text: string;
  /** Number of tool-use iterations performed */
  toolIterations: number;
  /** Whether the loop hit the max iteration cap */
  truncated: boolean;
  /** Total input tokens consumed */
  inputTokens: number;
  /** Total output tokens produced */
  outputTokens: number;
}

/** Maximum number of tool-use iterations before forced stop. */
const MAX_ITERATIONS = 20;

// ──────────────────── AgentLoop ─────────────────────────────────────

export class AgentLoop {
  private client: Anthropic;
  private model: string;
  private systemPrompt: string;
  private tools: Anthropic.Tool[];
  private toolExecutor: ToolExecutorFn;
  private eventBus: EventBus;
  private sessionId: string;
  private runId: string;
  private abortController: AbortController;

  constructor(
    client: Anthropic,
    model: string,
    systemPrompt: string,
    tools: Anthropic.Tool[],
    toolExecutor: ToolExecutorFn,
    eventBus: EventBus,
    sessionId: string,
    runId: string,
    externalAbortController?: AbortController,
  ) {
    this.client = client;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.toolExecutor = toolExecutor;
    this.eventBus = eventBus;
    this.sessionId = sessionId;
    this.runId = runId;
    this.abortController = externalAbortController ?? new AbortController();
  }

  /**
   * Cancel the current run. The next iteration check will abort the loop.
   */
  cancel(): void {
    this.abortController.abort();
  }

  /**
   * Run the agent loop with streaming.
   *
   * Sends the user message (plus conversation history) to the LLM,
   * streams text deltas and tool interactions through the EventBus,
   * and loops until the model produces a final end_turn or the
   * iteration cap is reached.
   */
  async run(
    userMessage: string,
    history: Anthropic.MessageParam[],
  ): Promise<AgentResult> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolIterations = 0;
    let truncated = false;

    // Build initial messages array
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: userMessage },
    ];

    while (toolIterations < MAX_ITERATIONS) {
      // Check abort signal between iterations
      if (this.abortController.signal.aborted) {
        throw new Error("AgentLoop was cancelled");
      }

      // ── streaming API call ──
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: this.tools,
        messages,
      });

      // Track the current text/tool block being streamed for event emission
      let currentTextBlock: Anthropic.TextBlock | null = null;
      let currentToolBlock: Anthropic.ToolUseBlock | null = null;

      for await (const event of stream) {
        // Check abort signal during streaming
        if (this.abortController.signal.aborted) {
          stream.abort();
          throw new Error("AgentLoop was cancelled");
        }

        if (event.type === "content_block_start") {
          const block = event.content_block;

          if (block.type === "text") {
            currentTextBlock = { type: "text" as const, text: "", citations: [] };
          } else if (block.type === "tool_use") {
            currentToolBlock = {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: {},
            };
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;

          if (delta.type === "text_delta" && currentTextBlock) {
            currentTextBlock.text += delta.text;
            this.eventBus.emit(this.sessionId, "text_delta", {
              runId: this.runId,
              text: delta.text,
            });
          } else if (delta.type === "input_json_delta" && currentToolBlock) {
            // Accumulate partial JSON for tool input
            try {
              const partial = JSON.parse(
                (currentToolBlock.input as string || "") + (delta.partial_json ?? ""),
              );
              currentToolBlock.input = partial;
            } catch {
              // JSON not yet complete; store raw string for accumulation
              currentToolBlock.input =
                (typeof currentToolBlock.input === "string"
                  ? currentToolBlock.input
                  : "") + (delta.partial_json ?? "");
            }
          }
        } else if (event.type === "content_block_stop") {
          currentTextBlock = null;
          currentToolBlock = null;
        }
      }

      // Get the final message from the stream
      const finalMessage = await stream.finalMessage();

      // Accumulate token usage from the final message
      if (finalMessage.usage) {
        totalInputTokens += finalMessage.usage.input_tokens;
        totalOutputTokens += finalMessage.usage.output_tokens;
      }

      const stopReason = finalMessage.stop_reason;

      // ── handle tool_use stop reason ──
      if (stopReason === "tool_use") {
        toolIterations++;

        // Find all tool_use blocks in the final message
        const toolUseBlocks = finalMessage.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        // Add the assistant message to conversation
        messages.push({ role: "assistant", content: finalMessage.content });

        // Execute each tool call and build tool_result messages
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          this.eventBus.emit(this.sessionId, "tool_call", {
            runId: this.runId,
            toolName: toolBlock.name,
            toolId: toolBlock.id,
            input: toolBlock.input,
          });

          let resultText: string;
          try {
            resultText = await this.toolExecutor(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
            );
          } catch (err) {
            resultText = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: resultText,
          });

          this.eventBus.emit(this.sessionId, "tool_result", {
            runId: this.runId,
            toolName: toolBlock.name,
            toolId: toolBlock.id,
            result: resultText,
          });
        }

        // Add tool results and continue the loop
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // ── end_turn or other stop reason: we are done ──
      const textParts = finalMessage.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text);

      if (toolIterations >= MAX_ITERATIONS) {
        truncated = true;
      }

      return {
        text: textParts.join(""),
        toolIterations,
        truncated,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    // Should not reach here, but handle just in case
    return {
      text: "",
      toolIterations,
      truncated: true,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  }
}
