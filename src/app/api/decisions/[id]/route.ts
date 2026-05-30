import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { decisions } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";

/** PATCH /api/decisions/[id] - update an existing decision (e.g. mark reviewed) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { decision: decisionText, rationale, confidence } = body as {
    decision?: string;
    rationale?: string;
    confidence?: number | null;
  };

  const db = getDb();

  // Verify the decision exists
  const existing = db
    .select()
    .from(decisions)
    .where(eq(decisions.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  // Build update set from provided fields
  const updates: Record<string, unknown> = {};
  if (decisionText !== undefined) updates.decision = decisionText;
  if (rationale !== undefined) updates.rationale = rationale;
  if (confidence !== undefined) updates.confidence = confidence;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  await db.update(decisions).set(updates).where(eq(decisions.id, id));

  const updated = db
    .select()
    .from(decisions)
    .where(eq(decisions.id, id))
    .get();

  return NextResponse.json({
    id: updated!.id,
    session_id: updated!.sessionId,
    observation_id: updated!.observationId,
    decision: updated!.decision,
    rationale: updated!.rationale,
    confidence: updated!.confidence,
    created_at: updated!.createdAt,
  });
}
