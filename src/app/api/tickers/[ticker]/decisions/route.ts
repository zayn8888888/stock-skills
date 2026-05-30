import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { decisions, observations } from "@/lib/db/schema";

/** GET /api/tickers/[ticker]/decisions - list decisions linked to a ticker */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json(
      { error: "ticker is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const target = ticker.toUpperCase();

  // Decisions don't have a ticker column; join through observations
  // to find decisions whose observation references this ticker.
  const tickerSessions = new Set(
    db
      .select({ sessionId: observations.sessionId })
      .from(observations)
      .where(eq(observations.ticker, target))
      .all()
      .map((r) => r.sessionId),
  );

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

  const items = rows.filter((r) => tickerSessions.has(r.session_id));

  return NextResponse.json(items);
}
