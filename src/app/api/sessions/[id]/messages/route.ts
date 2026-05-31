import { getRouter } from "@/lib/adapters/init";
import { buildAgentContext } from "@/lib/agent/context";
import {
  getBaseUrl,
  getContextWindow,
  getMaxTokens,
  getModelName,
  isApiKeyConfigured,
} from "@/lib/agent/llm-provider";
import { registerLoop, unregisterLoop } from "@/lib/agent/loop-registry";
import { PiAgentRunner } from "@/lib/agent/pi-runner";
import { createPiTools } from "@/lib/agent/pi-tools";
import { loadAgent } from "@/lib/agent/skill-loader";
import { taskRunner } from "@/lib/agent/task-runner";
import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { messages, runs, sessions } from "@/lib/db/schema";
import * as artifactWriter from "@/lib/runtime/artifact-writer";
import { eventBus } from "@/lib/runtime/event-bus";
import * as goalManager from "@/lib/runtime/goal-manager";
import { asc, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";

const genId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 12);

type RouteCtx = { params: Promise<{ id: string }> };

interface MessageBody {
  content: string;
  context?: {
    ticker?: string;
    skill_name?: string;
    workflow_type?: string;
  };
}

/** POST /api/sessions/[id]/messages - create message, optionally create run */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  // Ensure adapters and router are initialized
  const router = getRouter();

  const { id: sessionId } = await ctx.params;
  const body: MessageBody = await req.json();

  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();

  // Verify session exists
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  // Create message
  const messageId = genId();
  const metadata = body.context
    ? JSON.stringify({
        ticker: body.context.ticker,
        skill_name: body.context.skill_name,
        workflow_type: body.context.workflow_type,
      })
    : null;

  await db.insert(messages).values({
    id: messageId,
    sessionId,
    role: "user",
    content: body.content,
    createdAt: now,
    metadata,
  });

  // Optionally create a run if context includes ticker or skill_name
  let linkedRunId: string | undefined;

  if (body.context?.ticker || body.context?.skill_name) {
    const runId = genId();
    linkedRunId = runId;

    await db.insert(runs).values({
      id: runId,
      sessionId,
      skillName: body.context.skill_name ?? "unknown",
      status: "pending",
      startedAt: now,
      createdAt: now,
      metadata: JSON.stringify({
        ticker: body.context.ticker,
        workflow_type: body.context.workflow_type,
      }),
    });

    // Update session updated_at
    await db.update(sessions).set({ updatedAt: now }).where(eq(sessions.id, sessionId));

    eventBus.emit(sessionId, "run.created", {
      runId,
      skillName: body.context.skill_name ?? "unknown",
      status: "pending",
    });

    // ── Wire AgentLoop via TaskRunner ──────────────────────────────
    const agentName = body.context.skill_name ?? "stock-analyzer";

    // Graceful fallback when API key is not configured
    if (!isApiKeyConfigured()) {
      const now2 = new Date().toISOString();
      await db.insert(messages).values({
        id: genId(),
        sessionId,
        role: "system",
        content:
          "⚠️ ANTHROPIC_API_KEY is not configured. The agent cannot run without a valid API key. Please set the ANTHROPIC_API_KEY environment variable.",
        createdAt: now2,
        metadata: JSON.stringify({ runId, error: true }),
      });
      await db
        .update(runs)
        .set({ status: "failed", finishedAt: now2, resultSummary: "API key not configured" })
        .where(eq(runs.id, runId));
      eventBus.emit(sessionId, "run.updated", {
        runId,
        status: "failed",
        message: "API key not configured",
      });
    } else {
      const agent = loadAgent(agentName);
      const goalId: string | undefined = undefined; // will be resolved from active goal if present
      const ticker = body.context.ticker;

      const agentCtx = buildAgentContext(db, sessionId, goalId, ticker);
      const model = getModelName();
      const baseUrl = getBaseUrl();
      const contextWindow = getContextWindow();
      const maxTokens = getMaxTokens();

      const piTools = createPiTools(
        router,
        artifactWriter,
        goalManager,
        runId,
        sessionId,
        db,
        eventBus,
      );

      // Build conversation history from context messages (excluding the
      // message we just inserted which is already at the end).
      const history: Array<{ role: "user" | "assistant"; content: string }> = agentCtx.messages
        .filter((m) => m.id !== messageId)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Enqueue as background task — return 200 immediately
      taskRunner
        .enqueue(runId, async (signal) => {
          let onAbort: (() => void) | undefined;

          try {
            const loop = new PiAgentRunner(
              model,
              baseUrl,
              agent.prompt,
              piTools,
              eventBus,
              sessionId,
              runId,
              undefined,
              contextWindow,
              maxTokens,
            );

            registerLoop(runId, loop);

            // Wire taskRunner signal to the loop's abort controller
            onAbort = () => loop.cancel();
            signal.addEventListener("abort", onAbort, { once: true });

            // Update run to running
            const startedAt = new Date().toISOString();
            await db.update(runs).set({ status: "running", startedAt }).where(eq(runs.id, runId));

            eventBus.emit(sessionId, "run.updated", {
              runId,
              status: "running",
            });

            // Run the agent loop
            const result = await loop.run(body.content, history);

            // Save assistant message
            const assistantMsgId = genId();
            const finishedAt = new Date().toISOString();
            await db.insert(messages).values({
              id: assistantMsgId,
              sessionId,
              role: "assistant",
              content: result.text,
              createdAt: finishedAt,
              metadata: JSON.stringify({
                runId,
                toolIterations: result.toolIterations,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
              }),
            });

            // Update run to succeeded
            await db
              .update(runs)
              .set({
                status: "success",
                finishedAt,
                resultSummary: result.text.slice(0, 500),
              })
              .where(eq(runs.id, runId));

            eventBus.emit(sessionId, "run.updated", {
              runId,
              status: "success",
              resultSummary: result.text.slice(0, 500),
            });
          } catch (err) {
            const finishedAt = new Date().toISOString();
            const isCancelled =
              signal.aborted || (err instanceof Error && err.message === "AgentLoop was cancelled");

            // Save error message
            const errorMsgId = genId();
            const errorContent = isCancelled
              ? "Run was cancelled."
              : `Run failed: ${err instanceof Error ? err.message : String(err)}`;

            await db.insert(messages).values({
              id: errorMsgId,
              sessionId,
              role: "assistant",
              content: errorContent,
              createdAt: finishedAt,
              metadata: JSON.stringify({ runId, error: true }),
            });

            // Update run status
            await db
              .update(runs)
              .set({
                status: isCancelled ? "cancelled" : "failed",
                finishedAt,
                resultSummary: errorContent.slice(0, 500),
              })
              .where(eq(runs.id, runId));

            eventBus.emit(sessionId, isCancelled ? "run.updated" : "error", {
              runId,
              status: isCancelled ? "cancelled" : "failed",
              message: errorContent,
            });
          } finally {
            if (onAbort) {
              signal.removeEventListener("abort", onAbort);
            }
            unregisterLoop(runId);
          }
        })
        .catch(() => {
          // swallow — errors are already handled inside the task
        });
    } // end isApiKeyConfigured else
  } else {
    // Still update session updated_at for the new message
    await db.update(sessions).set({ updatedAt: now }).where(eq(sessions.id, sessionId));
  }

  const response: Record<string, unknown> = {
    message_id: messageId,
    session_id: sessionId,
    role: "user",
    content: body.content,
    created_at: now,
  };
  if (linkedRunId) response.linked_run_id = linkedRunId;

  return NextResponse.json(response, { status: 201 });
}

/** GET /api/sessions/[id]/messages - list messages sorted by created_at asc */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const db = getDb();

  // Verify session exists
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  const items = rows.map((row) => ({
    message_id: row.id,
    session_id: row.sessionId,
    role: row.role,
    content: row.content,
    created_at: row.createdAt,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  return NextResponse.json(items);
}
