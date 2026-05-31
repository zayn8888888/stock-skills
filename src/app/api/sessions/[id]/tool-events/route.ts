import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { runEvents, runs } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sessions/[id]/tool-events
 *
 * Returns historical tool calls from run_events, grouped by runId.
 * Each entry contains the parsed tool call data with status, input, and result.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const db = getDb();

  // Get all run IDs for this session
  const sessionRuns = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.sessionId, sessionId));

  if (sessionRuns.length === 0) {
    return NextResponse.json({});
  }

  const runIds = sessionRuns.map((r) => r.id);

  // Fetch tool_use events only for this session's runs
  const events = await db
    .select({ runId: runEvents.runId, data: runEvents.data })
    .from(runEvents)
    .where(and(eq(runEvents.eventType, "tool_use"), inArray(runEvents.runId, runIds)));

  const toolCallsByRun: Record<
    string,
    Array<{
      id: string;
      name: string;
      status: "completed" | "error";
      args?: string;
      result?: string;
    }>
  > = {};

  for (const ev of events) {
    if (!ev.data) continue;
    try {
      const parsed = JSON.parse(ev.data) as {
        status: string;
        toolName: string;
        toolId: string;
        input?: unknown;
        result?: string;
      };

      if (parsed.status === "running") continue;

      if (!toolCallsByRun[ev.runId]) toolCallsByRun[ev.runId] = [];
      toolCallsByRun[ev.runId].push({
        id: parsed.toolId,
        name: parsed.toolName,
        status: parsed.status === "error" ? "error" : "completed",
        args: typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input ?? {}),
        result: parsed.result,
      });
    } catch {
      // skip malformed entries
    }
  }

  return NextResponse.json(toolCallsByRun);
}
