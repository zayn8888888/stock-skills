import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessions, messages, runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eq } from "drizzle-orm";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/sessions/[id] - get session detail */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    session_id: row.id,
    title: row.name,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    ended_at: row.endedAt,
  });
}

/** PATCH /api/sessions/[id] - update session title or status */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { title, status } = body as {
    title?: string;
    status?: string;
  };

  const db = getDb();

  // Verify session exists
  const [existing] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (title !== undefined) updates.name = title;
  if (status !== undefined) {
    updates.status = status;
    if (status === "completed" || status === "archived") {
      updates.endedAt = now;
    }
  }

  await db.update(sessions).set(updates).where(eq(sessions.id, id));

  const [updated] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  return NextResponse.json({
    session_id: updated.id,
    title: updated.name,
    status: updated.status,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
    ended_at: updated.endedAt,
  });
}

/** DELETE /api/sessions/[id] - delete session with cascade */
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();

  // Verify session exists
  const [existing] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Cascade delete: messages and runs (artifacts, run_events are FK-cascaded)
  await db.delete(messages).where(eq(messages.sessionId, id));
  await db.delete(runs).where(eq(runs.sessionId, id));
  await db.delete(sessions).where(eq(sessions.id, id));

  return new NextResponse(null, { status: 204 });
}
