import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { artifacts, runEvents, runs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/runs/[id] - get run detail with artifacts */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();

  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);

  if (!row) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const artifactRows = await db.select().from(artifacts).where(eq(artifacts.runId, id));

  const eventRows = await db.select().from(runEvents).where(eq(runEvents.runId, id));

  const meta = row.metadata ? JSON.parse(row.metadata) : {};

  return NextResponse.json({
    run_id: row.id,
    session_id: row.sessionId,
    goal_id: row.goalId,
    skill_name: row.skillName,
    status: row.status,
    workflow_type: meta.workflow_type ?? null,
    ticker: meta.ticker ?? null,
    market: meta.market ?? null,
    intent: meta.intent ?? null,
    execution_mode: meta.execution_mode ?? null,
    caller: meta.caller ?? null,
    created_at: row.createdAt,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    duration_ms: row.durationMs,
    result_summary: row.resultSummary,
    artifacts: artifactRows.map((a) => ({
      artifact_id: a.id,
      kind: a.kind,
      name: a.name,
      path: a.path,
      content: a.content,
      mime_type: a.mimeType,
      created_at: a.createdAt,
    })),
    events: eventRows.map((e) => ({
      event_id: e.id,
      event_type: e.eventType,
      timestamp: e.timestamp,
      data: e.data ? JSON.parse(e.data) : null,
    })),
  });
}
