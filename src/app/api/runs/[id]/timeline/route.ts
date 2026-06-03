import { getDb } from "@/lib/db";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { buildRunTimeline } from "@/lib/runtime/timeline";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/runs/[id]/timeline — run detail read model */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;

  const db = getDb();
  const store = createRuntimeStore(db);

  const timeline = await buildRunTimeline(store, runId);
  if (!timeline) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(timeline);
}
