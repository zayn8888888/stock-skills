import { getDb } from "@/lib/db";
import { decisions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/reviews/due - list decisions pending review.
 *
 * When the decisions table gains `review_due_at` and `status` columns
 * this route will filter by `review_due_at <= now AND status = 'pending'`.
 * Until then it returns all decisions ordered by creation date.
 */
export async function GET(_req: NextRequest) {
  const db = getDb();

  const rows = await db
    .select({
      id: decisions.id,
      session_id: decisions.sessionId,
      observation_id: decisions.observationId,
      decision: decisions.decision,
      rationale: decisions.rationale,
      confidence: decisions.confidence,
      created_at: decisions.createdAt,
    })
    .from(decisions)
    .orderBy(desc(decisions.createdAt));

  return NextResponse.json(rows);
}
