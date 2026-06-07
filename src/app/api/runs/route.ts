import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { deriveDurationMs } from "@/lib/runs/duration";
import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/runs - list runs sorted by created_at desc, limit 50 */
export async function GET(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const db = getDb();
  const rows = await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(50);

  const items = rows.map((row) => {
    return {
      run_id: row.id,
      session_id: row.sessionId,
      goal_id: row.goalId,
      skill_name: row.skillName,
      status: row.status,
      workflow_type: row.workflowType ?? null,
      created_at: row.createdAt,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      duration_ms: deriveDurationMs({
        durationMs: row.durationMs,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
      }),
    };
  });

  return NextResponse.json(items);
}
