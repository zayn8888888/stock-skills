/**
 * Adapter initialization — registers all available data source adapters
 * with the global registry.
 *
 * Call this once at application startup (e.g., from a Next.js middleware
 * or the first API route that uses adapters).
 */

import { registry } from "./registry";
import { FixtureAdapter } from "./fixture";
import { FutuAdapter } from "./futu";

let initialized = false;

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;

  // Fixture adapter (always available for testing)
  registry.register(new FixtureAdapter());

  // Futu OpenD adapter (requires running OpenD instance)
  try {
    registry.register(new FutuAdapter());
  } catch {
    // Non-fatal: Futu OpenD may not be running
    console.warn("[adapters] Futu OpenD not available");
  }
}
