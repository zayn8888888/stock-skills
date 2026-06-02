/**
 * Central allowlists for the runtime no-debt guard.
 *
 * Migration fixtures and doc files may reference old patterns.
 * The app runtime (src/app, src/lib, tests) must not import
 * legacy adapter names, old SSE event names, or Pi runtime code
 * outside the files listed here.
 */

/**
 * Patterns that must never appear in new vNext runtime code.
 */
export const FORBIDDEN_RUNTIME_PATTERNS: readonly string[] = [
  // Legacy adapter class names
  "LegacyRestAdapter",
  "LegacySseAdapter",
  "LegacyPiRunnerAdapter",
  // Old SSE event names (must not be sent by new server code)
  "event: text_delta",
  "event: thinking_delta",
  "event: tool_call",
  "event: tool_result",
  "event: run.updated",
  // Pi runtime imports
  "from.*pi-runner",
  "from.*pi-tools",
  "@earendil-works/pi",
];

/**
 * Pre-existing files that currently use old patterns.
 * During incremental migration (non-strict mode) these are allowed.
 * Once migration is complete, this list should be empty.
 */
export const TEMPORARY_OLD_FILE_ALLOWLIST: readonly string[] = [
  "src/lib/agent/pi-runner.ts",
  "src/lib/agent/pi-tools.ts",
  "src/lib/agent/loop-registry.ts",
  "src/lib/runtime/event-bus.ts",
  "src/lib/runtime/run-manager.ts",
  "src/lib/runtime/artifact-writer.ts",
  "src/lib/db/schema.ts",
  "src/app/page.tsx",
  "src/app/api/sessions/[id]/messages/route.ts",
  "src/app/api/sessions/[id]/tool-events/route.ts",
  "src/app/api/sessions/[id]/cancel/route.ts",
  "src/app/api/runs/[id]/route.ts",
  "tests/sse.test.ts",
  "tests/event-bus.test.ts",
  "tests/use-sse.test.ts",
  "tests/agent-store.test.ts",
];

/**
 * Paths allowed to reference old patterns in both default and strict modes.
 * Only migration tooling, fixtures, and docs.
 */
export const MIGRATION_ONLY_ALLOWLIST: readonly string[] = [
  "src/lib/runtime/no-debt.ts",
  "scripts/check-no-runtime-debt.ts",
  "tests/runtime/no-runtime-debt.test.ts",
  "src/lib/migrations/",
  "tests/fixtures/runtime-v0/",
  "tests/migrations/",
  "docs/superpowers/",
];
