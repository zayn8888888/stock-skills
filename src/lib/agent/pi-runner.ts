import type { EventBus } from "@/lib/runtime/event-bus";
import type { AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage, UserMessage } from "@earendil-works/pi-ai";

// ──────────────────── types ─────────────────────────────────────────

export interface AgentResult {
  text: string;
  toolIterations: number;
  truncated: boolean;
  inputTokens: number;
  outputTokens: number;
}

/** Maximum tool-call iterations before forced stop. Enforced via beforeToolCall hook. */
const MAX_ITERATIONS = 20;

/** Maximum time (ms) for a single agent.run() call before forced abort. */
const RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ──────────────────── history conversion ────────────────────────────

interface SimpleMessage {
  role: "user" | "assistant";
  content: string;
}

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Convert stored conversation history (simple role+content) to Pi's
 * AgentMessage format. Only plain text messages — tool interactions
 * are not stored in the messages table.
 */
function toAgentHistory(messages: SimpleMessage[]): (UserMessage | AssistantMessage)[] {
  const now = Date.now();
  return messages.map((m, i) => {
    if (m.role === "user") {
      return {
        role: "user" as const,
        content: m.content,
        timestamp: now - (messages.length - i) * 1000,
      } satisfies UserMessage;
    }
    return {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: m.content }],
      api: "anthropic-messages" as const,
      provider: "anthropic" as const,
      model: "historical",
      usage: ZERO_USAGE,
      stopReason: "stop" as const,
      timestamp: now - (messages.length - i) * 1000,
    } satisfies AssistantMessage;
  });
}

// ──────────────────── PiAgentRunner ────────────────────────────────

/**
 * Pi-backed agent runner that replaces the hand-rolled AgentLoop.
 *
 * Preserves the same external contract: `run()` → `AgentResult`, `cancel()`.
 * Internally uses Pi's Agent class which handles the tool-call loop
 * automatically.
 */
export class PiAgentRunner {
  private agent: Agent;
  private eventBus: EventBus;
  private sessionId: string;
  private runId: string;
  private externalAbortController: AbortController;

  constructor(
    modelId: string,
    baseUrl: string,
    systemPrompt: string,
    tools: AgentTool[],
    eventBus: EventBus,
    sessionId: string,
    runId: string,
    externalAbortController?: AbortController,
    contextWindow?: number,
    maxTokens?: number,
  ) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
    this.runId = runId;
    this.externalAbortController = externalAbortController ?? new AbortController();

    // ── Iteration limiter ──
    let toolCallCount = 0;

    // Create a custom model object for the configured provider.
    // Pi's getModel() returns models with default baseUrl (api.anthropic.com),
    // but we need to point to the user's configured base URL.
    const model = {
      id: modelId,
      name: modelId,
      api: "anthropic-messages" as const,
      provider: "anthropic" as const,
      baseUrl,
      reasoning: false,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: contextWindow ?? 128000,
      maxTokens: maxTokens ?? 16384,
    };

    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        messages: [],
      },
      toolExecution: "sequential",
      beforeToolCall: async () => {
        if (++toolCallCount > MAX_ITERATIONS) {
          return {
            block: true,
            reason: `Maximum iterations (${MAX_ITERATIONS}) reached. Stopping.`,
          };
        }
        return undefined;
      },
    });

    // ── Wire external abort → agent.abort() ──
    this.externalAbortController.signal.addEventListener("abort", () => this.agent.abort(), {
      once: true,
    });
  }

  /**
   * Cancel the current run.
   */
  cancel(): void {
    this.agent.abort();
  }

  /**
   * Run the agent loop with streaming.
   *
   * Seeds conversation history, subscribes to Pi events for EventBus
   * forwarding, and calls agent.prompt() which handles the full
   * tool-call loop internally.
   */
  async run(userMessage: string, history: SimpleMessage[]): Promise<AgentResult> {
    // ── Seed history ──
    const piHistory = toAgentHistory(history);
    this.agent.state.messages = piHistory;

    // ── Track tokens from events ──
    let inputTokens = 0;
    let outputTokens = 0;
    let toolIterations = 0;

    // ── Subscribe to Pi events → EventBus ──
    const unsubscribe = this.agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        // Text streaming → EventBus text_delta
        case "message_update": {
          const { assistantMessageEvent } = event;
          if (assistantMessageEvent.type === "text_delta") {
            this.eventBus.emit(this.sessionId, "text_delta", {
              runId: this.runId,
              text: assistantMessageEvent.delta,
            });
          }
          break;
        }

        // Turn completion → accumulate token usage
        case "turn_end": {
          toolIterations++;
          const msg = event.message as AssistantMessage;
          if (msg.usage) {
            inputTokens += msg.usage.input;
            outputTokens += msg.usage.output;
          }
          break;
        }

        // Final agent_end → extract usage from all messages
        case "agent_end": {
          for (const msg of event.messages) {
            if (msg.role === "assistant" && msg.usage) {
              // Avoid double-counting with turn_end
              // (turn_end already counted per-turn, but for safety we
              //  use the final state as authoritative)
            }
          }
          break;
        }
      }
    });

    try {
      // ── Run the agent with timeout ──
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          this.agent.abort();
          reject(new Error(`Agent run timed out after ${RUN_TIMEOUT_MS / 1000}s`));
        }, RUN_TIMEOUT_MS);
        // Clear timer if agent finishes normally
        this.externalAbortController.signal.addEventListener("abort", () => clearTimeout(timer), {
          once: true,
        });
      });

      await Promise.race([this.agent.prompt(userMessage), timeoutPromise]);

      // ── Extract final text from state ──
      const allMessages = this.agent.state.messages;

      const lastAssistant = [...allMessages].reverse().find((m) => m.role === "assistant") as
        | AssistantMessage
        | undefined;

      let text = "";
      if (lastAssistant?.content) {
        text = lastAssistant.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("");
      }

      // Use usage from the last assistant message as authoritative
      if (lastAssistant?.usage) {
        inputTokens = lastAssistant.usage.input;
        outputTokens = lastAssistant.usage.output;
      }

      const truncated = toolIterations >= MAX_ITERATIONS;

      return {
        text,
        toolIterations,
        truncated,
        inputTokens,
        outputTokens,
      };
    } finally {
      unsubscribe();
      // Reset state for potential reuse
      this.agent.reset();
    }
  }
}
