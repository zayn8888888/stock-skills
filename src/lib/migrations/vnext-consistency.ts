/**
 * vNext Consistency Checker — validates DB integrity after import.
 *
 * This module is ONLY imported by migration scripts and tests.
 * It must NOT be imported by app runtime.
 */

import type { RuntimeStore } from "@/lib/runtime/store";

export interface ConsistencyCheckResult {
  ok: boolean;
  checks: ConsistencyCheck[];
  errors: string[];
}

export interface ConsistencyCheck {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * Run all consistency checks on the vNext database.
 */
export async function runConsistencyChecks(store: RuntimeStore): Promise<ConsistencyCheckResult> {
  const checks: ConsistencyCheck[] = [];
  const errors: string[] = [];

  // 1. Every message has a session
  checks.push(await checkMessageSessions(store));

  // 2. Every run has a session
  checks.push(await checkRunSessions(store));

  // 3. Every terminal run has a terminal runtime event
  checks.push(await checkTerminalRuns(store));

  // 4. Every artifact has existing run/session
  checks.push(await checkArtifactRefs(store));

  for (const c of checks) {
    if (!c.passed) errors.push(`${c.name}: ${c.details}`);
  }

  return { ok: errors.length === 0, checks, errors };
}

async function checkMessageSessions(store: RuntimeStore): Promise<ConsistencyCheck> {
  try {
    const messages = await store.messages.listAll();
    const missing: string[] = [];
    for (const message of messages) {
      if (!(await store.sessions.findById(message.sessionId))) missing.push(message.id);
    }
    return checkResult("message_sessions", missing);
  } catch (err) {
    return {
      name: "message_sessions",
      passed: false,
      details: String(err),
    };
  }
}

async function checkRunSessions(store: RuntimeStore): Promise<ConsistencyCheck> {
  try {
    const runs = await store.runs.listAll();
    const missing: string[] = [];
    for (const run of runs) {
      if (!(await store.sessions.findById(run.sessionId))) missing.push(run.id);
    }
    return checkResult("run_sessions", missing);
  } catch (err) {
    return {
      name: "run_sessions",
      passed: false,
      details: String(err),
    };
  }
}

async function checkTerminalRuns(store: RuntimeStore): Promise<ConsistencyCheck> {
  try {
    const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
    const terminalEventTypes = new Set(["run.completed", "run.failed", "run.cancelled"]);
    const missing: string[] = [];

    for (const run of await store.runs.listAll()) {
      if (!terminalStatuses.has(run.status)) continue;
      const events = await store.events.findByRun(run.id);
      if (!events.some((event) => terminalEventTypes.has(event.type))) missing.push(run.id);
    }
    return checkResult("terminal_runs_have_events", missing);
  } catch (err) {
    return {
      name: "terminal_runs_have_events",
      passed: false,
      details: String(err),
    };
  }
}

async function checkArtifactRefs(store: RuntimeStore): Promise<ConsistencyCheck> {
  try {
    const missing: string[] = [];
    for (const artifact of await store.artifacts.listAll()) {
      const run = await store.runs.findById(artifact.runId);
      const session = artifact.sessionId
        ? await store.sessions.findById(artifact.sessionId)
        : undefined;
      if (!run || (artifact.sessionId && !session)) missing.push(artifact.id);
    }
    return checkResult("artifact_refs", missing);
  } catch (err) {
    return {
      name: "artifact_refs",
      passed: false,
      details: String(err),
    };
  }
}

function checkResult(name: string, missing: string[]): ConsistencyCheck {
  return missing.length === 0
    ? { name, passed: true }
    : { name, passed: false, details: `Missing references/events for: ${missing.join(", ")}` };
}
