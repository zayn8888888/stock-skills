import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eventBus } from "@/lib/runtime/event-bus";
import { createRuntimeEvent } from "@/lib/runtime/events";
import { desc } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";

const genId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 12);

/** POST /api/sessions - create a new session */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const title: string | undefined = body.title;

  const db = getDb();
  const now = new Date().toISOString();
  const sessionId = genId();

  await db.insert(sessions).values({
    id: sessionId,
    name: title ?? null,
    createdAt: now,
    updatedAt: now,
    status: "active",
  });

  eventBus.emit(
    sessionId,
    createRuntimeEvent({
      sessionId,
      type: "session.created",
      category: "lifecycle",
      scope: "session",
      producer: "server",
      payload: { sessionId, title },
    }),
  );

  return NextResponse.json(
    {
      session_id: sessionId,
      title: title ?? null,
      status: "active",
      created_at: now,
    },
    { status: 201 },
  );
}

/** GET /api/sessions - list sessions sorted by updated_at desc */
export async function GET(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const db = getDb();
  const rows = await db.select().from(sessions).orderBy(desc(sessions.updatedAt));

  const items = rows.map((row) => ({
    session_id: row.id,
    title: row.name,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    ended_at: row.endedAt,
  }));

  return NextResponse.json(items);
}
