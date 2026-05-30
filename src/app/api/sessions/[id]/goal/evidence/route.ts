import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { goalCriteria, researchGoals, sessions } from "@/lib/db/schema";
import { addEvidence } from "@/lib/runtime/goal-manager";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

interface AddEvidenceBody {
  expected_goal_id: string;
  text: string;
  criterion_id?: string;
  source_name?: string;
  confidence?: number;
}

/** POST /api/sessions/[id]/goal/evidence - add evidence to the current goal */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const body: AddEvidenceBody = await req.json();

  if (!body.expected_goal_id) {
    return NextResponse.json({ error: "expected_goal_id is required" }, { status: 400 });
  }
  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
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

  // Resolve criterion_id: required by DB schema; fall back to first criterion if omitted
  let criterionId = body.criterion_id;
  if (!criterionId) {
    const [firstCriterion] = await db
      .select({ id: goalCriteria.id })
      .from(goalCriteria)
      .where(eq(goalCriteria.goalId, activeGoal.id))
      .limit(1);

    if (!firstCriterion) {
      return NextResponse.json(
        { error: "Goal has no criteria; criterion_id is required" },
        { status: 400 },
      );
    }
    criterionId = firstCriterion.id;
  } else {
    // Validate criterion belongs to this goal
    const [criterion] = await db
      .select({ id: goalCriteria.id })
      .from(goalCriteria)
      .where(and(eq(goalCriteria.id, criterionId), eq(goalCriteria.goalId, activeGoal.id)))
      .limit(1);

    if (!criterion) {
      return NextResponse.json(
        { error: `Criterion "${criterionId}" does not belong to the current goal` },
        { status: 400 },
      );
    }
  }

  // Add evidence via goal-manager
  const evidenceRow = await addEvidence(db, activeGoal.id, {
    criterionId,
    evidence: body.text,
    source: body.source_name,
    confidence: body.confidence,
  });

  return NextResponse.json(evidenceRow, { status: 201 });
}
