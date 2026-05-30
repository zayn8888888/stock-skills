import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { researchGoals, sessions } from "@/lib/db/schema";
import { getGoalSnapshot, updateStatus } from "@/lib/runtime/goal-manager";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

interface UpdateStatusBody {
  expected_goal_id: string;
  status: string;
}

/** PATCH /api/sessions/[id]/goal/status - update goal status */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const body: UpdateStatusBody = await req.json();

  if (!body.expected_goal_id) {
    return NextResponse.json({ error: "expected_goal_id is required" }, { status: 400 });
  }
  if (!body.status || typeof body.status !== "string") {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const db = getDb();

  // Verify session exists
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Find active goal for this session
  const [activeGoal] = await db
    .select()
    .from(researchGoals)
    .where(and(eq(researchGoals.sessionId, sessionId), eq(researchGoals.status, "active")))
    .limit(1);

  if (!activeGoal) {
    return NextResponse.json({ error: "No active goal found" }, { status: 404 });
  }

  // Optimistic concurrency: expected_goal_id must match active goal
  if (activeGoal.id !== body.expected_goal_id) {
    return NextResponse.json(
      { error: "Goal conflict: expected_goal_id does not match the current active goal" },
      { status: 409 },
    );
  }

  // Update goal status via goal-manager
  await updateStatus(db, activeGoal.id, body.status);

  // Fetch updated snapshot
  const snapshot = await getGoalSnapshot(db, activeGoal.id);

  if (!snapshot) {
    return NextResponse.json({ error: "Goal snapshot not found" }, { status: 500 });
  }

  return NextResponse.json({
    goal: snapshot.goal,
    criteria: snapshot.criteria,
    evidence_count: snapshot.evidence.length,
  });
}
