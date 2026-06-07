/**
 * POST /api/ag-ui/research — AG-UI standard protocol endpoint.
 *
 * Accepts AG-UI RunAgentInput, submits a canonical command,
 * subscribes to runtime events, and streams AG-UI events as SSE.
 */

import { parseAgUiInput } from "@/lib/ag-ui/command";
import { projectToAgUi } from "@/lib/ag-ui/projector";
import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { RuntimeCommandService } from "@/lib/runtime/command-service";
import { eventBus } from "@/lib/runtime/event-bus";
import { RuntimeEventLog } from "@/lib/runtime/event-log";
import type { RuntimeEvent } from "@/lib/runtime/events";
import { createRuntimeStore } from "@/lib/runtime/repositories";
import { ResearchRuntime } from "@/lib/runtime/research-runtime";
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

  // Wire up store + event log + runtime + command service
  const db = getDb();
  const store = createRuntimeStore(db);
  const eventLog = new RuntimeEventLog(store, {
    onAppend: (event) => eventBus.emit(event.sessionId, event),
  });
  const researchRuntime = new ResearchRuntime(store, eventLog);

  const service = new RuntimeCommandService(store, eventLog, researchRuntime);

  // Execute command
  const result = await service.handle(cmd);

  if (!result.accepted || !result.sessionId) {
    return NextResponse.json({ error: result.error ?? "Command not accepted" }, { status: 400 });
  }

  // Stream AG-UI events via SSE. Subscribe before replaying buffered events so
  // fast runners cannot finish between command handling and stream setup.
  const sessionId = result.sessionId;
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const seenEventIds = new Set<string>();
  let closed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};

  const sendAgUiEvent = (event: Record<string, unknown>) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {});
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (timeout) clearTimeout(timeout);
    unsubscribe();
    writer.close().catch(() => {});
  };

  const handleEvent = (event: RuntimeEvent) => {
    if (event.runId !== result.runId || seenEventIds.has(event.id)) return;
    seenEventIds.add(event.id);

    const agUiEvent = projectToAgUi(event);
    if (agUiEvent) {
      sendAgUiEvent(agUiEvent as Record<string, unknown>);
    }

    if (
      event.type === "run.completed" ||
      event.type === "run.failed" ||
      event.type === "run.cancelled"
    ) {
      close();
    }
  };

  unsubscribe = eventBus.subscribe(sessionId, handleEvent);

  for (const event of eventBus.replay(sessionId, 0)) {
    handleEvent(event);
  }

  if (!closed) {
    timeout = setTimeout(close, 5 * 60 * 1000);
  }

  req.signal.addEventListener("abort", () => {
    close();
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
