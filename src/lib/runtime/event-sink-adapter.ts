/**
 * RuntimeEventSinkAdapter — bridges RunnerAdapter's RuntimeEventSink interface
 * to the RuntimeEventLog, so runners can emit canonical RuntimeEvents without
 * directly importing EventBus or DB modules.
 */

import type { RuntimeEventSink } from "@/lib/runners/base";
import type { RuntimeEventLog } from "./event-log";
import { createRuntimeEvent, type RuntimeEvent } from "./events";

export class RuntimeEventSinkAdapter implements RuntimeEventSink {
  constructor(
    private eventLog: RuntimeEventLog,
    private sessionId: string,
    private runId: string,
  ) {}

  async emit<T>(event: RuntimeEvent<T>): Promise<void> {
    await this.eventLog.append(event);
  }

  async textDelta(delta: string): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        type: "model.text.delta",
        category: "model",
        scope: "run",
        producer: "runner",
        persist: 0,
        payload: { delta },
      }),
    );
  }

  async textCompleted(text: string): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        type: "model.text.completed",
        category: "model",
        scope: "run",
        producer: "runner",
        payload: { text },
      }),
    );
  }

  async reasoningDelta(summary: string): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        type: "model.reasoning.delta",
        category: "model",
        scope: "run",
        producer: "runner",
        persist: 0,
        payload: { summary },
      }),
    );
  }

  async toolCallCreated(data: { toolCallId: string; name: string; args?: unknown }): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        toolCallId: data.toolCallId,
        type: "tool.call.created",
        category: "tool",
        scope: "tool",
        producer: "runner",
        payload: { toolCallId: data.toolCallId, name: data.name, args: data.args },
      }),
    );
  }

  async toolCallCompleted(data: {
    toolCallId: string;
    name: string;
    status: string;
    result?: unknown;
  }): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        toolCallId: data.toolCallId,
        type: "tool.call.completed",
        category: "tool",
        scope: "tool",
        producer: "runner",
        payload: { toolCallId: data.toolCallId, name: data.name, status: data.status, result: data.result },
      }),
    );
  }

  async toolCallFailed(data: { toolCallId: string; name: string; error: string }): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        toolCallId: data.toolCallId,
        type: "tool.call.failed",
        category: "error",
        scope: "tool",
        producer: "runner",
        payload: { toolCallId: data.toolCallId, name: data.name, error: data.error },
      }),
    );
  }

  async artifactCreated(data: {
    artifactId: string;
    kind: string;
    name: string;
    content: string;
  }): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        artifactId: data.artifactId,
        type: "artifact.created",
        category: "artifact",
        scope: "artifact",
        producer: "runner",
        payload: { artifactId: data.artifactId, kind: data.kind, name: data.name, content: data.content },
      }),
    );
  }

  async errorCreated(data: { code: string; message: string; retriable: boolean }): Promise<void> {
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: this.sessionId,
        runId: this.runId,
        type: "error.created",
        category: "error",
        scope: "run",
        producer: "runner",
        payload: { code: data.code, message: data.message, retriable: data.retriable },
      }),
    );
  }
}
