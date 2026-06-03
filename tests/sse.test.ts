import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeEvent } from "@/lib/runtime/events";

const AUTH_TOKEN = "test-token";
const ORIGIN = "http://localhost:3000";

function makeRequest(path: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, init);
}

async function readSseText(response: Response, abort: AbortController): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const deadline = Date.now() + 100;

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

/** Helper to create a typed RuntimeEvent for tests. */
function testEvent(
  sessionId: string,
  type: string,
  payload: Record<string, unknown> = {},
  overrides: Partial<Parameters<typeof createRuntimeEvent>[0]> = {},
) {
  return createRuntimeEvent({
    sessionId,
    type,
    category: "lifecycle",
    payload,
    ...overrides,
  });
}

describe("session SSE (vNext)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("STOCK_SKILLS_ANALYSIS_ROOT", mkdtempSync(join(tmpdir(), "stock-skills-sse-test-")));
    vi.stubEnv("STOCK_SKILLS_TOKEN", AUTH_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("replays buffered events from the client's lastEventId query parameter", async () => {
    const { eventBus } = await import("@/lib/runtime/event-bus");
    const { GET } = await import("@/app/api/sessions/[id]/events/route");

    const sessionId = "session-replay";
    const event = testEvent(sessionId, "run.created", { runId: "run-1" });
    event.sessionSeq = 1;
    eventBus.emit(sessionId, event);

    const abort = new AbortController();
    const response = await GET(
      makeRequest(`/api/sessions/${sessionId}/events?lastEventId=0`, {
        signal: abort.signal,
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    const text = await readSseText(response, abort);

    // vNext: all events use "event: runtime.event"
    expect(text).toContain("event: runtime.event");
    expect(text).toContain("transport.connected");
    expect(text).toContain('"run.created"');
    expect(text).toContain('"runId":"run-1"');
  });

  it("replays active run stream events to a fresh session connection", async () => {
    const { eventBus } = await import("@/lib/runtime/event-bus");
    const { GET } = await import("@/app/api/sessions/[id]/events/route");

    const sessionId = "session-active-replay";
    const ev1 = testEvent(sessionId, "run.created", { runId: "run-1" });
    ev1.sessionSeq = 1;
    const ev2 = testEvent(sessionId, "model.text.delta", { delta: "partial answer" }, {
      category: "model", runId: "run-1", scope: "run",
    });
    ev2.sessionSeq = 2;

    eventBus.emit(sessionId, ev1);
    eventBus.emit(sessionId, ev2);

    const abort = new AbortController();
    const response = await GET(
      makeRequest(`/api/sessions/${sessionId}/events`, {
        signal: abort.signal,
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    const text = await readSseText(response, abort);

    expect(text).toContain("event: runtime.event");
    expect(text).toContain('"run.created"');
    expect(text).toContain('"model.text.delta"');
    expect(text).toContain("partial answer");
  });

  it("does not replay a terminal run to fresh session connections", async () => {
    const { eventBus } = await import("@/lib/runtime/event-bus");
    const { GET } = await import("@/app/api/sessions/[id]/events/route");

    const sessionId = "session-terminal-no-replay";
    const ev1 = testEvent(sessionId, "run.created", { runId: "run-1" });
    ev1.sessionSeq = 1;
    const ev2 = testEvent(sessionId, "model.text.delta", { delta: "completed answer" }, {
      category: "model", runId: "run-1", scope: "run",
    });
    ev2.sessionSeq = 2;
    const ev3 = testEvent(sessionId, "run.completed", { status: "succeeded" }, {
      category: "lifecycle", runId: "run-1", scope: "run",
    });
    ev3.sessionSeq = 3;

    eventBus.emit(sessionId, ev1);
    eventBus.emit(sessionId, ev2);
    eventBus.emit(sessionId, ev3);

    const abort = new AbortController();
    const response = await GET(
      makeRequest(`/api/sessions/${sessionId}/events`, {
        signal: abort.signal,
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

    const text = await readSseText(response, abort);

    expect(text).toContain("event: runtime.event");
    expect(text).toContain("transport.connected");
    // Terminal run — should NOT replay run content
    expect(text).not.toContain("completed answer");
  });
});
