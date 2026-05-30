import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { getDb } from "@/lib/db";
import { sessions, messages, runs } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { eq, asc } from "drizzle-orm";

const genId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 12);

type RouteCtx = { params: Promise<{ id: string }> };

interface MessageBody {
  content: string;
  context?: {
    ticker?: string;
    skill_name?: string;
    workflow_type?: string;
  };
}

/** POST /api/sessions/[id]/messages - create message, optionally create run */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const body: MessageBody = await req.json();

  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify session exists
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  // Create message
  const messageId = genId();
  const metadata = body.context
    ? JSON.stringify({
        ticker: body.context.ticker,
        skill_name: body.context.skill_name,
        workflow_type: body.context.workflow_type,
      })
    : null;

  await db.insert(messages).values({
    id: messageId,
    sessionId,
    role: "user",
    content: body.content,
    createdAt: now,
    metadata,
  });

  // Optionally create a run if context includes ticker or skill_name
  let linkedRunId: string | undefined;

  if (body.context?.ticker || body.context?.skill_name) {
    linkedRunId = genId();

    await db.insert(runs).values({
      id: linkedRunId,
      sessionId,
      skillName: body.context.skill_name ?? "unknown",
      status: "running",
      startedAt: now,
      createdAt: now,
    });

    // Update session updated_at
    await db
      .update(sessions)
      .set({ updatedAt: now })
      .where(eq(sessions.id, sessionId));
  } else {
    // Still update session updated_at for the new message
    await db
      .update(sessions)
      .set({ updatedAt: now })
      .where(eq(sessions.id, sessionId));
  }

  const response: Record<string, unknown> = {
    message_id: messageId,
    session_id: sessionId,
    role: "user",
    content: body.content,
    created_at: now,
  };
  if (linkedRunId) response.linked_run_id = linkedRunId;

  return NextResponse.json(response, { status: 201 });
}

/** GET /api/sessions/[id]/messages - list messages sorted by created_at asc */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: sessionId } = await ctx.params;
  const db = getDb();

  // Verify session exists
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  const items = rows.map((row) => ({
    message_id: row.id,
    session_id: row.sessionId,
    role: row.role,
    content: row.content,
    created_at: row.createdAt,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));

  return NextResponse.json(items);
}
