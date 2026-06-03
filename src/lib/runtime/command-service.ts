/**
 * RuntimeCommandService — canonical entry point for all mutating operations.
 *
 * Responsibilities:
 * - Validate command shape via Zod
 * - Check idempotency via command_log
 * - Create messages/runs through RuntimeStore
 * - Delegate run execution to ResearchRuntime
 * - Return canonical command result
 */

import { nanoid } from "nanoid";
import type { RuntimeCommand } from "./commands";
import type { RuntimeStore } from "./store";
import type { RuntimeEventLog } from "./event-log";
import type { ResearchRuntime } from "./research-runtime";
import { createRuntimeEvent } from "./events";
import { assertRunTransition, type RunStatus } from "./state-machine";

export interface CommandResult {
  commandId: string;
  accepted: boolean;
  sessionId?: string;
  messageId?: string;
  runId?: string;
  streamUrl?: string;
  error?: string;
  errorCode?: string;
}

export class RuntimeCommandService {
  constructor(
    private store: RuntimeStore,
    private eventLog: RuntimeEventLog,
    private researchRuntime: ResearchRuntime,
  ) {}

  /**
   * Handle a RuntimeCommand. All mutations go through here.
   */
  async handle(cmd: RuntimeCommand): Promise<CommandResult> {
    // 1. Check idempotency
    const existing = await this.store.commands.findByIdempotencyKey(cmd.idempotencyKey);
    if (existing) {
      const prior = existing.responseJson ? JSON.parse(existing.responseJson) : {};
      return {
        commandId: existing.id,
        accepted: existing.status === "completed",
        ...prior,
      };
    }

    // 2. Log the command
    await this.store.commands.create({
      id: cmd.commandId,
      schemaVersion: "runtime-command.v1",
      commandType: cmd.type,
      idempotencyKey: cmd.idempotencyKey,
      actor: cmd.actor,
      source: cmd.source,
      status: "processing",
      requestJson: JSON.stringify(cmd),
      createdAt: cmd.createdAt,
    });

    // 3. Dispatch
    let result: CommandResult;
    try {
      result = await this.dispatch(cmd);
    } catch (err) {
      result = {
        commandId: cmd.commandId,
        accepted: false,
        error: String(err),
        errorCode: "system.unexpected",
      };
    }

    // 4. Persist result
    await this.store.commands.updateResult(cmd.commandId, {
      status: result.accepted ? "completed" : "failed",
      responseJson: JSON.stringify({
        sessionId: result.sessionId,
        messageId: result.messageId,
        runId: result.runId,
      }),
      errorCode: result.errorCode,
      errorMessage: result.error,
    });

    return result;
  }

  private async dispatch(cmd: RuntimeCommand): Promise<CommandResult> {
    switch (cmd.type) {
      case "session.create":
        return this.handleCreateSession(cmd);
      case "session.message.append_user":
        return this.handleAppendUserMessage(cmd);
      case "run.start":
        return this.handleRunStart(cmd);
      case "run.cancel":
        return this.handleRunCancel(cmd);
      case "goal.add":
        return this.handleGoalAdd(cmd);
      case "artifact.submit":
        return this.handleArtifactSubmit(cmd);
      default:
        return {
          commandId: cmd.commandId,
          accepted: false,
          error: `Unsupported command type: ${cmd.type}`,
          errorCode: "validation.invalid_request",
        };
    }
  }

  private async handleCreateSession(cmd: RuntimeCommand): Promise<CommandResult> {
    const now = new Date().toISOString();
    const session = await this.store.sessions.create({
      id: nanoid(),
      title: cmd.content ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Emit session.created event
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: session.id,
        type: "session.created",
        category: "lifecycle",
        scope: "session",
        producer: "server",
        payload: { sessionId: session.id },
      }),
    );

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId: session.id,
    };
  }

  private async handleAppendUserMessage(cmd: RuntimeCommand): Promise<CommandResult> {
    const sessionId = cmd.sessionId;
    if (!sessionId) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "sessionId is required for session.message.append_user",
        errorCode: "validation.invalid_request",
      };
    }

    // Create message
    const message = await this.store.messages.create({
      sessionId,
      role: "user",
      content: cmd.content ?? "",
    });

    // Emit message event
    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        messageId: message.id,
        type: "session.message.created",
        category: "message",
        scope: "session",
        producer: "server",
        payload: { messageId: message.id, role: "user", content: message.content },
      }),
    );

    let runId: string | undefined;

    // Start run if requested
    if (cmd.startRun) {
      const run = await this.store.runs.create({
        sessionId,
        messageId: message.id,
        skillName: cmd.context?.skillName ?? "default",
        workflowType: cmd.context?.workflowType ?? "agent_workflow",
        status: "queued",
        ticker: cmd.context?.ticker ?? null,
        market: cmd.context?.market ?? null,
      });
      runId = run.id;

      // Update session active run
      await this.store.sessions.setActiveRun(sessionId, runId);

      // Emit run.created
      await this.eventLog.append(
        createRuntimeEvent({
          sessionId,
          runId,
          messageId: message.id,
          type: "run.created",
          category: "lifecycle",
          scope: "run",
          producer: "server",
          payload: { runId, skillName: run.skillName, ticker: run.ticker },
        }),
      );

      // Fire-and-forget: execute the run asynchronously
      this.researchRuntime.executeRun(runId, sessionId).catch((err) => {
        console.error(`[CommandService] executeRun failed for ${runId}:`, err);
      });
    }

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId,
      messageId: message.id,
      runId,
      streamUrl: `/api/sessions/${sessionId}/events`,
    };
  }

  private async handleRunStart(cmd: RuntimeCommand): Promise<CommandResult> {
    const runId = cmd.runId;
    if (!runId) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "runId is required for run.start",
        errorCode: "validation.invalid_request",
      };
    }

    const run = await this.store.runs.findById(runId);
    if (!run) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: `Run not found: ${runId}`,
        errorCode: "run.not_found",
      };
    }

    try {
      assertRunTransition(run.status as RunStatus, "running");
    } catch (err) {
      await this.eventLog.append(
        createRuntimeEvent({
          sessionId: run.sessionId,
          runId,
          type: "error.created",
          category: "error",
          scope: "run",
          producer: "server",
          payload: { code: "run.invalid_transition", message: String(err), retriable: false },
        }),
      );

      return {
        commandId: cmd.commandId,
        accepted: false,
        error: String(err),
        errorCode: "run.invalid_transition",
      };
    }

    await this.store.runs.update(runId, { status: "running", startedAt: new Date().toISOString() });

    await this.eventLog.append(
      createRuntimeEvent({
        sessionId: run.sessionId,
        runId,
        type: "run.started",
        category: "lifecycle",
        scope: "run",
        producer: "server",
        payload: { runId, status: "running" },
      }),
    );

    // Fire-and-forget: execute the run asynchronously
    this.researchRuntime.executeRun(runId, run.sessionId).catch((err) => {
      console.error(`[CommandService] executeRun failed for ${runId}:`, err);
    });

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId: run.sessionId,
      runId,
    };
  }

  private async handleRunCancel(cmd: RuntimeCommand): Promise<CommandResult> {
    const runId = cmd.runId;
    const sessionId = cmd.sessionId;
    if (!runId || !sessionId) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "runId and sessionId are required for run.cancel",
        errorCode: "validation.invalid_request",
      };
    }

    const run = await this.store.runs.findById(runId);
    if (!run) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: `Run not found: ${runId}`,
        errorCode: "run.not_found",
      };
    }

    // Determine target status based on current state
    const currentStatus = run.status as RunStatus;
    let targetStatus: RunStatus;

    if (currentStatus === "queued") {
      targetStatus = "cancelled";
    } else if (currentStatus === "running" || currentStatus === "waiting_for_input") {
      targetStatus = "cancelling";
    } else {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: `Cannot cancel run in status "${currentStatus}"`,
        errorCode: "run.invalid_transition",
      };
    }

    try {
      assertRunTransition(currentStatus, targetStatus);
    } catch (err) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: String(err),
        errorCode: "run.invalid_transition",
      };
    }

    await this.store.runs.updateStatus(runId, targetStatus);

    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        runId,
        type: "run.cancel_requested",
        category: "lifecycle",
        scope: "run",
        producer: "server",
        payload: { runId, previousStatus: currentStatus, targetStatus },
      }),
    );

    // Signal the runtime to abort the run
    this.researchRuntime.cancelRun(runId);

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId,
      runId,
    };
  }

  private async handleGoalAdd(cmd: RuntimeCommand): Promise<CommandResult> {
    const sessionId = cmd.sessionId;
    if (!sessionId) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "sessionId is required for goal.add",
        errorCode: "validation.invalid_request",
      };
    }

    if (!cmd.goal) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "goal text is required for goal.add",
        errorCode: "validation.invalid_request",
      };
    }

    const goal = await this.store.goals.create({
      sessionId,
      goal: cmd.goal,
    });

    await this.eventLog.append(
      createRuntimeEvent({
        sessionId,
        type: "system.info",
        category: "goal",
        scope: "goal",
        producer: "server",
        payload: { goalId: goal.id, goal: goal.goal, status: goal.status },
      }),
    );

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId,
    };
  }

  private async handleArtifactSubmit(cmd: RuntimeCommand): Promise<CommandResult> {
    const sessionId = cmd.sessionId;
    const runId = cmd.runId;

    if (!runId) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "runId is required for artifact.submit",
        errorCode: "validation.invalid_request",
      };
    }

    if (!cmd.content) {
      return {
        commandId: cmd.commandId,
        accepted: false,
        error: "content is required for artifact.submit",
        errorCode: "validation.invalid_request",
      };
    }

    const artifact = await this.store.artifacts.create({
      runId,
      sessionId: sessionId ?? null,
      kind: cmd.context?.skillName ?? "report",
      name: cmd.artifactId ?? `artifact-${nanoid()}`,
      content: cmd.content,
    });

    if (sessionId) {
      await this.eventLog.append(
        createRuntimeEvent({
          sessionId,
          runId,
          artifactId: artifact.id,
          type: "artifact.created",
          category: "artifact",
          scope: "artifact",
          producer: "server",
          payload: { artifactId: artifact.id, kind: artifact.kind, name: artifact.name },
        }),
      );
    }

    return {
      commandId: cmd.commandId,
      accepted: true,
      sessionId,
      runId,
    };
  }
}
