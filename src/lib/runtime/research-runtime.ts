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

import type { RunnerAdapter, RunnerKind, RuntimeLogger } from "@/lib/runners/base";
import { getRunner, selectRunner } from "@/lib/runners/registry";
import { nanoid } from "nanoid";
import type { RuntimeEventLog } from "./event-log";
import { RuntimeEventSinkAdapter } from "./event-sink-adapter";
import { createRuntimeEvent } from "./events";
import type { RunStatus } from "./state-machine";
import type { RuntimeStore } from "./store";

export interface ResearchRuntimeConfig {
  /** Run timeout in ms (default: 5 minutes) */
  runTimeoutMs?: number;
}

const DEFAULT_LOGGER: RuntimeLogger = {
  info: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
};

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
   * Selects a real runner from the registry, falls back to stub if none available.
   */
  async executeRun(runId: string, sessionId: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    const timeoutMs = this.config?.runTimeoutMs ?? 5 * 60 * 1000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const run = await this.store.runs.findById(runId);
      if (!run) return;
      if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
        return;
      }

      // Transition to running if still queued
      if (run.status === "queued") {
        await this.store.runs.update(runId, {
          status: "running",
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

      // Load message history for the runner
      const messages = await this.store.messages.findBySession(sessionId, { limit: 50 });
      const history = messages
        .filter((m) => m.id !== run.messageId)
        .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

      // Find the user input from the triggering message
      const triggerMessage = run.messageId
        ? await this.store.messages.findById(run.messageId)
        : null;
      const userInput = triggerMessage?.content ?? "";

      // Select runner
      const runner = this.selectRunnerForRun(run);

      // Create event sink
      const sink = new RuntimeEventSinkAdapter(this.eventLog, sessionId, runId);

      // Execute via real runner
      const result = await runner.run(
        {
          runId,
          sessionId,
          skillName: run.skillName ?? "default",
          userInput,
          history,
          ticker: run.ticker ?? undefined,
          market: run.market ?? undefined,
          workflowType: run.workflowType ?? undefined,
        },
        {
          signal: controller.signal,
          events: sink,
          logger: DEFAULT_LOGGER,
        },
      );

      // Record runner_runs metadata
      const now = new Date().toISOString();
      await this.store.runners.create({
        id: nanoid(),
        runId,
        runnerId: runner.id,
        externalRunId: result.traceId ?? null,
        metadataJson: JSON.stringify({ status: result.status, text: result.text?.slice(0, 500) }),
        createdAt: now,
        updatedAt: now,
      });

      // Mark run based on runner result
      if (result.status === "succeeded") {
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
      } else if (result.status === "cancelled") {
        await this.store.runs.updateStatus(runId, "cancelled", {
          finishedAt: new Date().toISOString(),
        });
        await this.eventLog.append(
          createRuntimeEvent({
            sessionId,
            runId,
            type: "run.cancelled",
            category: "lifecycle",
            scope: "run",
            producer: "runner",
            payload: { runId, status: "cancelled" },
          }),
        );
      } else {
        await this.store.runs.updateStatus(runId, "failed", {
          finishedAt: new Date().toISOString(),
          errorCode: "runner.failed",
          errorMessage: result.error,
        });
        await this.eventLog.append(
          createRuntimeEvent({
            sessionId,
            runId,
            type: "run.failed",
            category: "error",
            scope: "run",
            producer: "runner",
            payload: {
              code: "runner.failed",
              message: result.error ?? "Unknown error",
              retriable: false,
            },
          }),
        );
      }
    } catch (err) {
      const isCancelled = controller.signal.aborted;
      const status: RunStatus = isCancelled ? "cancelled" : "failed";
      const errorCode = isCancelled ? "runner.cancelled" : "runner.error";

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
   * Select the best runner for a given run based on its metadata.
   * Falls back to the stub runner if the selected runner is not available.
   */
  private selectRunnerForRun(run: {
    skillName?: string | null;
    workflowType?: string | null;
    runnerId?: string | null;
  }): RunnerAdapter {
    // If a specific runner is pinned to the run, use it
    if (run.runnerId) {
      try {
        return getRunner(run.runnerId as RunnerKind);
      } catch {
        console.warn(
          `[ResearchRuntime] Pinned runner "${run.runnerId}" not found, selecting default`,
        );
      }
    }

    // Use the registry's selection logic
    return selectRunner({
      workflowType: run.workflowType ?? undefined,
    });
  }
}
