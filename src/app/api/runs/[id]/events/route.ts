import { getDb } from "@/lib/db";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/runs/[id]/events — run-local event log */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const afterSeq = req.nextUrl.searchParams.get("afterSeq");
  const limit = req.nextUrl.searchParams.get("limit");

  const db = getDb();
  const store = createRuntimeStore(db);

  const events = await store.events.findByRun(runId, {
    afterSeq: afterSeq ? Number.parseInt(afterSeq, 10) : undefined,
    limit: limit ? Number.parseInt(limit, 10) : undefined,
  });

  return NextResponse.json(events);
}
