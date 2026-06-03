/**
 * GET /api/sessions/[id]/events — canonical vNext SSE endpoint.
 *
 * Emits only "event: runtime.event" with RuntimeEvent JSON payloads.
 * Old event names (text_delta, tool_call, etc.) are NOT emitted.
 *
 * Supports:
 * - Last-Event-ID replay (by sessionSeq)
 * - Fresh connection active-run recovery
 * - Transport heartbeat (30s)
 * - 10-minute max connection lifetime
 */

import { eventBus } from "@/lib/runtime/event-bus";
import { formatSse, formatHeartbeat, formatConnected } from "@/lib/runtime/projectors";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const lastEventId =
    req.headers.get("Last-Event-ID") ??
    req.nextUrl.searchParams.get("Last-Event-ID") ??
    req.nextUrl.searchParams.get("lastEventId") ??
    req.nextUrl.searchParams.get("last-event-id");
  const parsedLastEventId = lastEventId !== null ? Number.parseInt(lastEventId, 10) : null;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const writeSse = (data: string) => {
    writer.write(encoder.encode(data)).catch(() => {});
  };

  // Track the highest sessionSeq we replay, so the live callback can
  // skip events that were already delivered via replay (prevents duplicates
  // when an event is emitted between subscribe() and replay()).
  let lastReplayedSeq = 0;

  // Subscribe to typed RuntimeEvents
  const unsubscribe = eventBus.subscribe(sessionId, (event) => {
    // Skip events that were already delivered via replay buffer
    if (event.sessionSeq <= lastReplayedSeq) return;
    writeSse(formatSse(event));
  });

  // Confirm connection
  writeSse(formatConnected(sessionId));
  console.log(`[SSE] Connected to session ${sessionId}`);

  // Heartbeat every 30s
  let heartbeatSeq = 0;
  const heartbeat = setInterval(() => {
    writeSse(formatHeartbeat(sessionId, ++heartbeatSeq));
  }, 30_000);

  // Max connection lifetime: 10 minutes
  const maxLifetime = setTimeout(
    () => {
      clearInterval(heartbeat);
      unsubscribe();
      writer.close().catch(() => {});
    },
    10 * 60 * 1000,
  );

  // Replay missed events
  const missed =
    parsedLastEventId !== null && Number.isFinite(parsedLastEventId)
      ? eventBus.replay(sessionId, parsedLastEventId)
      : eventBus.replayActiveRun(sessionId);

  // Record the highest sessionSeq from replay so the live callback can
  // filter out any duplicate events that slipped in during replay.
  for (const event of missed) {
    writeSse(formatSse(event));
    if (event.sessionSeq > lastReplayedSeq) {
      lastReplayedSeq = event.sessionSeq;
    }
  }

  // Clean up on disconnect
  req.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    clearTimeout(maxLifetime);
    unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
