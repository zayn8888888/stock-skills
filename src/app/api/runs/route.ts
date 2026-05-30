import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eventBus } from "@/lib/runtime/event-bus";
import { desc } from "drizzle-orm";

/** POST /api/runs - create a new run */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const {
    skill_name,
    session_id,
    goal_id,
    ticker,
    market,
    intent,
    workflow_type,
    execution_mode,
    caller,
  } = body as {
    skill_name?: string;
    session_id?: string;
    goal_id?: string;
    ticker?: string;
    market?: string;
    intent?: string;
    workflow_type?: string;
    execution_mode?: string;
    caller?: string;
  };

  if (!skill_name || typeof skill_name !== "string") {
    return NextResponse.json(
      { error: "skill_name is required" },
      { status: 400 },
    );
  }

  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 },
    );
  }

  if (!workflow_type || typeof workflow_type !== "string") {
    return NextResponse.json(
      { error: "workflow_type is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date().toISOString();
  const runId = nanoid();

  const metadata = JSON.stringify({
    workflow_type,
    ticker: ticker ?? null,
    market: market ?? null,
    intent: intent ?? null,
    execution_mode: execution_mode ?? null,
    caller: caller ?? null,
  });

  await db.insert(runs).values({
    id: runId,
    sessionId: session_id,
    goalId: goal_id ?? null,
    skillName: skill_name,
    status: "queued",
    createdAt: now,
    metadata,
  });

  // Emit run.created event if session_id is provided
  if (session_id) {
    eventBus.emit(session_id, "run.created", {
      run_id: runId,
      skill_name,
      workflow_type,
    });
  }

  return NextResponse.json(
    {
      run_id: runId,
      status: "queued",
      workflow_type,
      owner: session_id,
      context_url: `/api/runs/${runId}`,
      artifact_submit_url: `/api/runs/${runId}/artifacts`,
      server_generated_artifacts: [],
      required_submitted_artifacts: [],
    },
    { status: 201 },
  );
}

/** GET /api/runs - list runs sorted by created_at desc, limit 50 */
export async function GET(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const db = getDb();
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(50);

  const items = rows.map((row) => {
    const meta = row.metadata ? JSON.parse(row.metadata) : {};
    return {
      run_id: row.id,
      session_id: row.sessionId,
      goal_id: row.goalId,
      skill_name: row.skillName,
      status: row.status,
      workflow_type: meta.workflow_type ?? null,
      created_at: row.createdAt,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      duration_ms: row.durationMs,
    };
  });

  return NextResponse.json(items);
}
