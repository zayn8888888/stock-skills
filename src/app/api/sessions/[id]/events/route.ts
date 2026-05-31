import { eventBus } from "@/lib/runtime/event-bus";
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

  // Use TransformStream — better supported by Next.js for streaming
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = (event: string, data: string) => {
    writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`)).catch(() => {});
  };

  // Subscribe to events
  const unsubscribe = eventBus.subscribe(sessionId, (event) => {
    console.log(`[SSE] Forwarding event ${event.type} to client`);
    writer.write(encoder.encode(eventBus.toSSE(event))).catch(() => {});
  });

  // Confirm connection after the subscription is active.
  send("connected", "{}");
  console.log(`[SSE] Connected, subscribed to session ${sessionId}`);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    send("heartbeat", "{}");
  }, 30_000);

  // Replay missed events if Last-Event-ID provided
  if (parsedLastEventId !== null && Number.isFinite(parsedLastEventId)) {
    const missed = eventBus.replay(sessionId, parsedLastEventId);
    for (const event of missed) {
      writer.write(encoder.encode(eventBus.toSSE(event))).catch(() => {});
    }
  }

  // Clean up on disconnect
  req.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
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
