/**
 * POST /api/ag-ui/research — AG-UI standard protocol endpoint.
 *
 * Accepts AG-UI RunAgentInput, submits a canonical command,
 * subscribes to runtime events, and streams AG-UI events as SSE.
 */

import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import { RuntimeCommandService } from "@/lib/runtime/command-service";
import { eventBus } from "@/lib/runtime/event-bus";
import { parseAgUiInput } from "@/lib/ag-ui/command";
import { projectToAgUi } from "@/lib/ag-ui/projector";
import type { RuntimeEvent } from "@/lib/runtime/events";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Parse AG-UI input into RuntimeCommand
  const cmd = parseAgUiInput(body as Parameters<typeof parseAgUiInput>[0]);

  // Wire up store + event log + command service
  const db = getDb();
  const store = createRuntimeStore(db);
  const eventLog = new RuntimeEventLog(store);

  // Bridge to EventBus for real-time delivery
  const originalAppend = eventLog.append.bind(eventLog);
  eventLog.append = async function <T>(event: Parameters<typeof originalAppend>[0]) {
    const result = await originalAppend(event);
    eventBus.emit(event.sessionId, result as RuntimeEvent);
    return result;
  };

  const service = new RuntimeCommandService(store, eventLog);

  // Execute command
  const result = await service.handle(cmd);

  if (!result.accepted || !result.sessionId) {
    return NextResponse.json(
      { error: result.error ?? "Command not accepted" },
      { status: 400 },
    );
  }

  // Stream AG-UI events via SSE
  const sessionId = result.sessionId;
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const sendAgUiEvent = (event: Record<string, unknown>) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {});
  };

  // Send RUN_STARTED
  sendAgUiEvent({
    type: "RUN_STARTED",
    threadId: sessionId,
    runId: result.runId,
    timestamp: Date.now(),
  });

  // Subscribe to runtime events and project to AG-UI
  const unsubscribe = eventBus.subscribe(sessionId, (event: RuntimeEvent) => {
    const agUiEvent = projectToAgUi(event);
    if (agUiEvent) {
      sendAgUiEvent(agUiEvent as Record<string, unknown>);
    }
  });

  // Timeout
  const timeout = setTimeout(
    () => {
      unsubscribe();
      writer.close().catch(() => {});
    },
    5 * 60 * 1000,
  );

  req.signal.addEventListener("abort", () => {
    clearTimeout(timeout);
    unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
