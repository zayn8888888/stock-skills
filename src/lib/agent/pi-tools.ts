import type { SourceRouter } from "@/lib/data-source/router";
import type * as schema from "@/lib/db/schema";
import { runEvents } from "@/lib/db/schema";
import type * as artifactWriterModule from "@/lib/runtime/artifact-writer";
import type { EventBus } from "@/lib/runtime/event-bus";
import type * as goalManager from "@/lib/runtime/goal-manager";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { customAlphabet } from "nanoid";
import { convertSchema } from "./schema-bridge";
import { createToolExecutor, createTools } from "./tools";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const genId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 12);

// ──────────────────── Pi tool adapter ─────────────────────────────

/**
 * Create Pi-compatible AgentTool[] that wrap the existing ToolExecutorFn.
 *
 * This preserves the existing dispatch logic in tools.ts while adding:
 * - TypeBox schema conversion (via schema-bridge)
 * - DB persistence of tool events (runEvents table)
 * - EventBus emissions (tool_call / tool_result)
 *
 * @returns Array of Pi AgentTool definitions ready for `new Agent({ tools })`
 */
export function createPiTools(
  router: SourceRouter,
  artifactWriter: typeof artifactWriterModule,
  goalManagerModule: typeof goalManager,
  runId: string,
  sessionId: string,
  db: DB,
  eventBus: EventBus,
): AgentTool[] {
  // Get existing Anthropic-format tool definitions
  const anthropicTools = createTools(
    router,
    artifactWriter,
    goalManagerModule,
    runId,
    sessionId,
    db,
  );

  // Get the shared executor (unchanged from tools.ts)
  const executor = createToolExecutor(
    router,
    artifactWriter,
    goalManagerModule,
    runId,
    sessionId,
    db,
  );

  // Convert each tool to Pi format with wrapped execute
  return anthropicTools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    label: tool.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    parameters: convertSchema(tool.input_schema as Record<string, unknown>),
    executionMode: "sequential" as const,

    execute: async (
      toolCallId: string,
      params: unknown,
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> => {
      const input = params as Record<string, unknown>;
      // ── Persist "running" event to DB ──
      const eventId = genId();
      const callTimestamp = new Date().toISOString();

      await db.insert(runEvents).values({
        id: eventId,
        runId,
        timestamp: callTimestamp,
        eventType: "tool_use",
        data: JSON.stringify({
          status: "running",
          toolName: tool.name,
          toolId: toolCallId,
          input,
        }),
      });

      // ── Emit tool_call event ──
      eventBus.emit(sessionId, "tool_call", {
        runId,
        toolName: tool.name,
        toolId: toolCallId,
        input,
      });

      // ── Execute via existing ToolExecutorFn ──
      let resultText: string;
      let status: "completed" | "error";

      try {
        resultText = await executor(tool.name, input);
        status = "completed";
      } catch (err) {
        // Pi handles thrown errors by marking isError: true for the LLM
        // Update DB and emit error event before re-throwing
        const errorText = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });

        await db
          .update(runEvents)
          .set({
            data: JSON.stringify({
              status: "error",
              toolName: tool.name,
              toolId: toolCallId,
              input,
              result: errorText,
            }),
          })
          .where(eq(runEvents.id, eventId));

        eventBus.emit(sessionId, "tool_result", {
          runId,
          toolName: tool.name,
          toolId: toolCallId,
          status: "error",
          result: errorText,
        });

        // Re-throw for Pi to handle (marks isError: true in the LLM message)
        throw err;
      }

      // ── Update DB with result ──
      await db
        .update(runEvents)
        .set({
          data: JSON.stringify({
            status,
            toolName: tool.name,
            toolId: toolCallId,
            input,
            result: resultText,
          }),
        })
        .where(eq(runEvents.id, eventId));

      // ── Emit tool_result event ──
      eventBus.emit(sessionId, "tool_result", {
        runId,
        toolName: tool.name,
        toolId: toolCallId,
        status,
        result: resultText,
      });

      // ── Return Pi-compatible AgentToolResult ──
      return {
        content: [{ type: "text" as const, text: resultText }],
        details: { toolName: tool.name, status },
      };
    },
  }));
}
