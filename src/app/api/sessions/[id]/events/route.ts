import { NextRequest } from "next/server";
import { eventBus } from "@/lib/runtime/event-bus";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const lastEventId =
    req.headers.get("Last-Event-ID") ??
    req.nextUrl.searchParams.get("Last-Event-ID");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Confirm connection immediately so the client isn't left waiting
      controller.enqueue(
        encoder.encode("event: connected\ndata: {}\n\n")
      );

      // Subscribe to events
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        controller.enqueue(encoder.encode(eventBus.toSSE(event)));
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode("event: heartbeat\ndata: {}\n\n")
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Replay missed events if Last-Event-ID provided
      if (lastEventId) {
        const missed = eventBus.replay(sessionId, Number(lastEventId));
        for (const event of missed) {
          controller.enqueue(encoder.encode(eventBus.toSSE(event)));
        }
      }

      // Clean up on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
