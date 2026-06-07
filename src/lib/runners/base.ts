/**
 * RunnerAdapter — the interface for pluggable agent runners.
 *
 * vNext runners include:
 * - ModernOpenAIAgentsRunner (default code-first agent)
 * - MastraWorkflowRunner (default TypeScript workflow)
 * - MockRunner (deterministic tests)
 */

import type { RuntimeEvent } from "@/lib/runtime/events";

export type RunnerKind = "openai-agents" | "mastra" | "vercel-ai-sdk" | "langgraph" | "mock";

export interface RunnerCapabilities {
  streamingText: boolean;
  toolCalling: boolean;
  cancellation: boolean;
  structuredOutput: boolean;
  handoff: boolean;
  humanApproval: boolean;
  tracing: boolean;
  evals: boolean;
}

export interface RunnerAdapter {
  id: string;
  displayName: string;
  kind: RunnerKind;
  capabilities: RunnerCapabilities;

  run(input: RunnerInput, ctx: RunnerContext): Promise<RunnerResult>;
  cancel?(runId: string): Promise<void> | void;
}

export interface RunnerInput {
  runId: string;
  sessionId: string;
  skillName: string;
  userInput: string;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  ticker?: string;
  market?: string;
  workflowType?: string;
}

export interface RunnerContext {
  signal: AbortSignal;
  events: RuntimeEventSink;
  logger: RuntimeLogger;
}

export interface RunnerResult {
  status: "succeeded" | "failed" | "cancelled";
  text?: string;
  artifacts?: Array<{ kind: string; name: string; content: string }>;
  traceId?: string;
  error?: string;
}

/**
 * RuntimeEventSink — runner's interface for emitting events.
 * Runners use this to produce canonical RuntimeEvents without directly
 * importing EventBus or DB modules.
 */
export interface RuntimeEventSink {
  emit<T>(event: RuntimeEvent<T>): Promise<void>;
  textDelta(delta: string): Promise<void>;
  textCompleted(text: string): Promise<void>;
  reasoningDelta(summary: string): Promise<void>;
  toolCallCreated(data: { toolCallId: string; name: string; args?: unknown }): Promise<void>;
  toolCallCompleted(data: {
    toolCallId: string;
    name: string;
    status: string;
    result?: unknown;
  }): Promise<void>;
  toolCallFailed(data: { toolCallId: string; name: string; error: string }): Promise<void>;
  artifactCreated(data: {
    artifactId: string;
    kind: string;
    name: string;
    content: string;
  }): Promise<void>;
  errorCreated(data: { code: string; message: string; retriable: boolean }): Promise<void>;
}

export interface RuntimeLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export const DEFAULT_CAPABILITIES: RunnerCapabilities = {
  streamingText: true,
  toolCalling: true,
  cancellation: true,
  structuredOutput: false,
  handoff: false,
  humanApproval: false,
  tracing: false,
  evals: false,
};
