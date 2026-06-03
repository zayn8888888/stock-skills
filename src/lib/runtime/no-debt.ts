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
 * After Task 11, most old files have been deleted. This list is now nearly empty.
 */
export const TEMPORARY_OLD_FILE_ALLOWLIST: readonly string[] = [
  "src/lib/runtime/run-manager.ts",
  "src/lib/runtime/artifact-writer.ts",
  "src/lib/db/schema.ts",
  "src/lib/agent/loop-registry.ts",
  "src/app/page.tsx",
  "tests/event-bus.test.ts",
  "tests/agent-store.test.ts",
];

/**
 * Paths allowed to reference old patterns in both default and strict modes.
 * Only migration tooling, fixtures, docs, and tests that assert old names are absent.
 */
export const MIGRATION_ONLY_ALLOWLIST: readonly string[] = [
  "src/lib/runtime/no-debt.ts",
  "scripts/check-no-runtime-debt.ts",
  "tests/runtime/no-runtime-debt.test.ts",
  "tests/runtime/projectors.test.ts",
  "src/lib/migrations/",
  "tests/fixtures/runtime-v0/",
  "tests/migrations/",
  "docs/superpowers/",
];
