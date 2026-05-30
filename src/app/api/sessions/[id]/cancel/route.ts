import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessions, runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eq, and } from "drizzle-orm";

type RouteCtx = { params: Promise<{ id: string }> };

/** POST /api/sessions/[id]/cancel - cancel the current active run */
export async function POST(req: NextRequest, ctx: RouteCtx) {
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

  // Find the active run (status = running or pending)
  const [activeRun] = await db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.sessionId, sessionId),
        eq(runs.status, "running"),
      ),
    )
    .limit(1);

  if (!activeRun) {
    return NextResponse.json({ status: "no_active_run" });
  }

  const now = new Date().toISOString();

  await db
    .update(runs)
    .set({
      status: "cancelled",
      finishedAt: now,
      durationMs: activeRun.startedAt
        ? new Date(now).getTime() - new Date(activeRun.startedAt).getTime()
        : null,
    })
    .where(eq(runs.id, activeRun.id));

  return NextResponse.json({ status: "cancelled" });
}
