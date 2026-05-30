import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lessons, observations } from "@/lib/db/schema";

/** GET /api/tickers/[ticker]/lessons - list lessons linked to a ticker */
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

  // Lessons don't have a ticker column; join through observations
  // to find lessons in sessions that have observations for this ticker.
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
      id: lessons.id,
      session_id: lessons.sessionId,
      category: lessons.category,
      summary: lessons.summary,
      detail: lessons.detail,
      created_at: lessons.createdAt,
    })
    .from(lessons)
    .orderBy(desc(lessons.createdAt));

  const items = rows.filter((r) => tickerSessions.has(r.session_id));

  return NextResponse.json(items);
}
