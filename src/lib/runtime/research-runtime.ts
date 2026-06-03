/**
 * ResearchRuntime — run orchestration and runner coordination.
 *
 * Responsibilities:
 * - Select runner from registry
 * - Create RuntimeEventSink for the runner
 * - Manage AbortController, timeout, cancellation
 * - Translate runner events into RuntimeEvent
 * - Never import EventBus directly except through RuntimeEventLog
 * - Never write Drizzle directly
 */

import { nanoid } from "nanoid";
import type { RuntimeStore } from "./store";
import type { RuntimeEventLog } from "./event-log";
import { createRuntimeEvent, type RuntimeEvent } from "./events";
import { assertRunTransition, type RunStatus } from "./state-machine";

export interface ResearchRuntimeConfig {
  /** Run timeout in ms (default: 5 minutes) */
  runTimeoutMs?: number;
}

export class ResearchRuntime {
  private controllers = new Map<string, AbortController>();

  constructor(
    private store: RuntimeStore,
    private eventLog: RuntimeEventLog,
    private config?: ResearchRuntimeConfig,
  ) {}

  /**
   * Execute a run. Called by CommandService after a run is created and started.
   *
   * For now, uses a stub runner that emits a minimal event sequence.
   * Real runner integration happens in Task 7.
   */
  async executeRun(runId: string, sessionId: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    const timeoutMs = this.config?.runTimeoutMs ?? 5 * 60 * 1000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const run = await this.store.runs.findById(runId);
      if (!run) return;

      // Transition to running if still queued
      if (run.status === "queued") {
        await this.store.runs.updateStatus(runId, "running", {
          startedAt: new Date().toISOString(),
        });
        await this.eventLog.append(
          createRuntimeEvent({
            sessionId,
            runId,
            type: "run.started",
            category: "lifecycle",
            scope: "run",
            producer: "server",
            payload: { runId, status: "running" },
          }),
        );
      }

      // Stub runner: emit a text response then complete
      await this.stubRunnerExecute(sessionId, runId, controller.signal);

      // Mark as succeeded
      await this.store.runs.updateStatus(runId, "succeeded", {
        finishedAt: new Date().toISOString(),
      });
      await this.eventLog.append(
        createRuntimeEvent({
          sessionId,
          runId,
          type: "run.completed",
          category: "lifecycle",
          scope: "run",
          producer: "runner",
          payload: { runId, status: "succeeded" },
        }),
      );
    } catch (err) {
      const isCancelled = controller.signal.aborted;
      const status: RunStatus = isCancelled ? "cancelled" : "failed";
      const errorCode = isCancelled ? "runner.cancelled" : "runner.timeout";

      await this.store.runs.updateStatus(runId, status, {
        finishedAt: new Date().toISOString(),
        errorCode,
        errorMessage: String(err),
      });
      await this.eventLog.append(
        createRuntimeEvent({
          sessionId,
          runId,
          type: isCancelled ? "run.cancelled" : "run.failed",
          category: "error",
          scope: "run",
          producer: "runner",
          payload: { code: errorCode, message: String(err), retriable: false },
        }),
      );
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(runId);
    }
  }

  /**
   * Cancel a running or queued run.
   */
  cancelRun(runId: string): void {
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Stub runner that emits a minimal event sequence.
   * This will be replaced by real RunnerAdapter in Task 7.
   */
  private async stubRunnerExecute(
    sessionId: string,
    runId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error("Run cancelled");

    // Emit text delta
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        type: "model.text.delta",
        category: "model",
        scope: "run",
        producer: "runner",
        persist: 0,
        payload: { delta: "Run stub: processing started..." },
      }),
    );

    if (signal.aborted) throw new Error("Run cancelled");

    // Emit tool call
    const toolCallId = nanoid();
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        toolCallId,
        type: "tool.call.created",
        category: "tool",
        scope: "tool",
        producer: "runner",
        payload: { toolCallId, name: "stub_tool", args: {} },
      }),
    );

    if (signal.aborted) throw new Error("Run cancelled");

    // Emit tool completed
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        toolCallId,
        type: "tool.call.completed",
        category: "tool",
        scope: "tool",
        producer: "runner",
        payload: { toolCallId, name: "stub_tool", status: "succeeded" },
      }),
    );

    if (signal.aborted) throw new Error("Run cancelled");

    // Emit final text
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        type: "model.text.completed",
        category: "model",
        scope: "run",
        producer: "runner",
        payload: { text: "Run completed successfully (stub)." },
      }),
    );
  }
}
