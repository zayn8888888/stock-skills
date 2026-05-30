import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { type goalCriteria, researchGoals, sessions } from "@/lib/db/schema";
import { addCriterion, createGoal, getGoalSnapshot } from "@/lib/runtime/goal-manager";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

interface CreateGoalBody {
  objective: string;
  criteria?: string[];
  risk_tier?: string;
  turn_budget?: number;
}

interface UpdateGoalBody {
  objective?: string;
  ui_summary?: string;
}

/** POST /api/sessions/[id]/goal - create goal for session */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const body: CreateGoalBody = await req.json();

  if (!body.objective || typeof body.objective !== "string") {
    return NextResponse.json({ error: "objective is required" }, { status: 400 });
  }

  const db = getDb();

  // Verify session exists
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // createGoal automatically supersedes any existing active goal
  const goalRow = await createGoal(db, sessionId, { goal: body.objective });

  // Create criteria rows if provided
  const criteriaRows: (typeof goalCriteria.$inferSelect)[] = [];
  if (body.criteria && body.criteria.length > 0) {
    for (const c of body.criteria) {
      const row = await addCriterion(db, goalRow.id, c, false);
      criteriaRows.push(row);
    }
  }

  // Fetch full snapshot
  const snapshot = await getGoalSnapshot(db, goalRow.id);

  if (!snapshot) {
    return NextResponse.json({ error: "Goal snapshot not found" }, { status: 500 });
  }

  return NextResponse.json(
    {
      goal: snapshot.goal,
      criteria: snapshot.criteria,
      evidence_count: snapshot.evidence.length,
    },
    { status: 201 },
  );
}

/** GET /api/sessions/[id]/goal - get current active goal for session */
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

  // Find active goal for this session
  const [activeGoal] = await db
    .select()
    .from(researchGoals)
    .where(and(eq(researchGoals.sessionId, sessionId), eq(researchGoals.status, "active")))
    .limit(1);

  if (!activeGoal) {
    return NextResponse.json({ error: "No active goal found" }, { status: 404 });
  }

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

/** PATCH /api/sessions/[id]/goal - update goal metadata */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const body: UpdateGoalBody = await req.json();
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

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.objective !== undefined) updates.goal = body.objective;
  if (body.ui_summary !== undefined) updates.uiSummary = body.ui_summary;

  await db.update(researchGoals).set(updates).where(eq(researchGoals.id, activeGoal.id));

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
