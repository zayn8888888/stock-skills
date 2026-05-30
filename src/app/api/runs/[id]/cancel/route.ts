import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eq } from "drizzle-orm";

type RouteCtx = { params: Promise<{ id: string }> };

/** POST /api/runs/[id]/cancel - cancel a run */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();

  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Only allow cancelling runs that are not already in a terminal state
  if (
    run.status === "success" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return NextResponse.json(
      { error: `Cannot cancel run in "${run.status}" status` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  await db
    .update(runs)
    .set({
      status: "cancelled",
      finishedAt: now,
      durationMs: run.startedAt
        ? new Date(now).getTime() - new Date(run.startedAt).getTime()
        : null,
    })
    .where(eq(runs.id, id));

  return NextResponse.json({ run_id: id, status: "cancelled" });
}
