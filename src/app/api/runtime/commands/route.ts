import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { RuntimeCommandService } from "@/lib/runtime/command-service";
import { ResearchRuntime } from "@/lib/runtime/research-runtime";
import { RuntimeCommandSchema } from "@/lib/runtime/commands";
import { eventBus } from "@/lib/runtime/event-bus";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/runtime/commands — the single mutating endpoint for the vNext runtime. */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate command shape
  const parsed = RuntimeCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid command", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const cmd = parsed.data;

  // Wire up store + event log + runtime + command service
  const db = getDb();
  const store = createRuntimeStore(db);
  const eventLog = new RuntimeEventLog(store, {
    onAppend: (event) => eventBus.emit(event.sessionId, event),
  });
  const researchRuntime = new ResearchRuntime(store, eventLog);

  const service = new RuntimeCommandService(store, eventLog, researchRuntime);

  try {
    const result = await service.handle(cmd);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[commands] Error handling command:", err);
    return NextResponse.json(
      { error: "Internal error", message: String(err) },
      { status: 500 },
    );
  }
}
