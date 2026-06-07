import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { RuntimeCommandService } from "@/lib/runtime/command-service";
import { createCommand } from "@/lib/runtime/commands";
import { eventBus } from "@/lib/runtime/event-bus";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { ResearchRuntime } from "@/lib/runtime/research-runtime";
import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/** POST /api/sessions - create a new session */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const title: string | undefined = body.title;

  const db = getDb();
  const store = createRuntimeStore(db);
  const eventLog = new RuntimeEventLog(store, {
    onAppend: (event) => eventBus.emit(event.sessionId, event),
  });
  const service = new RuntimeCommandService(store, eventLog, new ResearchRuntime(store, eventLog));
  const result = await service.handle(
    createCommand({
      type: "session.create",
      content: title,
      source: "sessions_api",
      actor: "web_ui",
    }),
  );
  if (!result.accepted || !result.sessionId) {
    return NextResponse.json({ error: result.error ?? "Session creation failed" }, { status: 400 });
  }
  const session = await store.sessions.findById(result.sessionId);

  return NextResponse.json(
    {
      session_id: result.sessionId,
      title: title ?? null,
      status: "active",
      created_at: session?.createdAt,
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
    title: row.title ?? row.name,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    ended_at: row.endedAt,
  }));

  return NextResponse.json(items);
}
