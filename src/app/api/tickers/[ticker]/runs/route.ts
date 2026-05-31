import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { desc, like } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/tickers/[ticker]/runs - list recent runs for a ticker */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const db = getDb();
  const target = ticker.toUpperCase();

  // Runs store ticker in the metadata JSON field; use LIKE to filter
  const rows = await db
    .select()
    .from(runs)
    .where(like(runs.metadata, `%"ticker":"${target}"%`))
    .orderBy(desc(runs.createdAt))
    .limit(50);

  const items = rows.map((row) => {
    const meta = row.metadata ? JSON.parse(row.metadata) : {};
    return {
      run_id: row.id,
      skill_name: row.skillName,
      status: row.status,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      duration_ms: row.durationMs,
      result_summary: row.resultSummary,
      workflow_type: meta.workflow_type ?? null,
      created_at: row.createdAt,
    };
  });

  return NextResponse.json(items);
}
