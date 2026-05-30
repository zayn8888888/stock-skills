import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { getDb } from "@/lib/db";
import { sessions, messages, runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eq, asc } from "drizzle-orm";
import { loadAgent } from "@/lib/agent/skill-loader";
import { buildAgentContext } from "@/lib/agent/context";
import { createTools, createToolExecutor } from "@/lib/agent/tools";
import { AgentLoop } from "@/lib/agent/loop";
import { registerLoop, unregisterLoop } from "@/lib/agent/loop-registry";
import { taskRunner } from "@/lib/agent/task-runner";
import { getLLMClient, getModelName } from "@/lib/agent/llm-provider";
import { eventBus } from "@/lib/runtime/event-bus";
import { registry as adapterRegistry } from "@/lib/adapters/registry";
import * as artifactWriter from "@/lib/runtime/artifact-writer";
import * as goalManager from "@/lib/runtime/goal-manager";

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

  const { id: sessionId } = await ctx.params;
  const body: MessageBody = await req.json();

  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify session exists
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

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
    linkedRunId = genId();

    await db.insert(runs).values({
      id: linkedRunId,
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
    await db
      .update(sessions)
      .set({ updatedAt: now })
      .where(eq(sessions.id, sessionId));

    // ── Wire AgentLoop via TaskRunner ──────────────────────────────
    const agentName = body.context.skill_name ?? "stock-analyzer";
    const agent = loadAgent(agentName);
    const goalId: string | undefined = undefined; // will be resolved from active goal if present
    const ticker = body.context.ticker;

    const agentCtx = buildAgentContext(db, sessionId, goalId, ticker);
    const model = getModelName();
    const client = getLLMClient();

    const toolDefs = createTools(
      adapterRegistry,
      artifactWriter,
      goalManager,
      linkedRunId,
      sessionId,
      db,
    );

    const toolExecutor = createToolExecutor(
      adapterRegistry,
      artifactWriter,
      goalManager,
      linkedRunId,
      sessionId,
      db,
    );

    // Build conversation history from context messages (excluding the
    // message we just inserted which is already at the end).
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      agentCtx.messages
        .filter((m) => m.id !== messageId)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

    // Enqueue as background task — return 200 immediately
    taskRunner
      .enqueue(linkedRunId, async (signal) => {
        const loop = new AgentLoop(
          client,
          model,
          agent.prompt,
          toolDefs,
          toolExecutor,
          eventBus,
          sessionId,
          linkedRunId!,
        );

        registerLoop(linkedRunId!, loop);

        // Wire taskRunner signal to the loop's abort controller
        const onAbort = () => loop.cancel();
        signal.addEventListener("abort", onAbort, { once: true });

        try {
          // Update run to running
          const startedAt = new Date().toISOString();
          await db
            .update(runs)
            .set({ status: "running", startedAt })
            .where(eq(runs.id, linkedRunId!));

          eventBus.emit(sessionId, "run.created", {
            runId: linkedRunId,
            skillName: agentName,
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
              runId: linkedRunId,
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
            .where(eq(runs.id, linkedRunId!));

          eventBus.emit(sessionId, "run.updated", {
            runId: linkedRunId,
            status: "success",
            resultSummary: result.text.slice(0, 500),
          });
        } catch (err) {
          const finishedAt = new Date().toISOString();
          const isCancelled =
            signal.aborted ||
            (err instanceof Error && err.message === "AgentLoop was cancelled");

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
            metadata: JSON.stringify({ runId: linkedRunId, error: true }),
          });

          // Update run status
          await db
            .update(runs)
            .set({
              status: isCancelled ? "cancelled" : "failed",
              finishedAt,
              resultSummary: errorContent.slice(0, 500),
            })
            .where(eq(runs.id, linkedRunId!));

          eventBus.emit(sessionId, isCancelled ? "run.updated" : "error", {
            runId: linkedRunId,
            status: isCancelled ? "cancelled" : "failed",
            message: errorContent,
          });
        } finally {
          signal.removeEventListener("abort", onAbort);
          unregisterLoop(linkedRunId!);
        }
      })
      .catch(() => {
        // swallow — errors are already handled inside the task
      });
  } else {
    // Still update session updated_at for the new message
    await db
      .update(sessions)
      .set({ updatedAt: now })
      .where(eq(sessions.id, sessionId));
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
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

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
