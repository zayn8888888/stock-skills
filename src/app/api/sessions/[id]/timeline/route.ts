import { getDb } from "@/lib/db";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { buildSessionTimeline } from "@/lib/runtime/timeline";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/sessions/[id]/timeline — session timeline read model */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  const db = getDb();
  const store = createRuntimeStore(db);

  const timeline = await buildSessionTimeline(store, sessionId);
  return NextResponse.json(timeline);
}
