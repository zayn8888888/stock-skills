import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_TOKEN = "test-token";
const ORIGIN = "http://localhost:3000";

function makeRequest(path: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, init);
}

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    host: "localhost:3000",
    origin: ORIGIN,
    "x-requested-with": "fetch",
    authorization: `Bearer ${AUTH_TOKEN}`,
  };
}

async function readSseText(response: Response, abort: AbortController): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const deadline = Date.now() + 50;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), remaining)),
    ]);
    if (result === "timeout") break;
    if (result.done) break;
    chunks.push(decoder.decode(result.value, { stream: true }));
  }

  abort.abort();
  await reader.cancel().catch(() => {});
  return chunks.join("");
}

describe("session SSE", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("STOCK_SKILLS_ANALYSIS_ROOT", mkdtempSync(join(tmpdir(), "stock-skills-sse-test-")));
    vi.stubEnv("STOCK_SKILLS_TOKEN", AUTH_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/agent/pi-runner");
    vi.doUnmock("@/lib/agent/pi-tools");
  });

  it("replays buffered events from the client's lastEventId query parameter", async () => {
    const { eventBus } = await import("@/lib/runtime/event-bus");
    const { GET } = await import("@/app/api/sessions/[id]/events/route");

    const sessionId = "session-replay";
    eventBus.emit(sessionId, "run.created", { runId: "run-1" });

    const abort = new AbortController();
    const response = await GET(
      makeRequest(`/api/sessions/${sessionId}/events?lastEventId=0`, {
        signal: abort.signal,
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    const text = await readSseText(response, abort);

    expect(text).toContain("event: connected");
    expect(text).toContain("event: run.created");
    expect(text).toContain('"runId":"run-1"');
  });

  it("emits run.created before reporting a no-api-key run failure", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.doMock("@/lib/agent/pi-runner", () => ({
      PiAgentRunner: class {
        cancel() {}
      },
    }));
    vi.doMock("@/lib/agent/pi-tools", () => ({
      createPiTools: () => [],
    }));

    const { eventBus } = await import("@/lib/runtime/event-bus");
    const { POST: createSession } = await import("@/app/api/sessions/route");
    const { POST: createMessage } = await import("@/app/api/sessions/[id]/messages/route");

    const sessionResponse = await createSession(
      makeRequest("/api/sessions", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: "SSE regression" }),
      }),
    );
    const session = (await sessionResponse.json()) as { session_id: string };

    const events: string[] = [];
    const unsubscribe = eventBus.subscribe(session.session_id, (event) => {
      events.push(event.type);
    });

    try {
      const messageResponse = await createMessage(
        makeRequest(`/api/sessions/${session.session_id}/messages`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            content: "Analyze NVDA",
            context: {
              ticker: "NVDA",
              skill_name: "stock-analyzer",
              workflow_type: "analyze",
            },
          }),
        }),
        { params: Promise.resolve({ id: session.session_id }) },
      );

      expect(messageResponse.status).toBe(201);
      expect(events).toEqual(["run.created", "run.updated"]);
    } finally {
      unsubscribe();
    }
  });
});
