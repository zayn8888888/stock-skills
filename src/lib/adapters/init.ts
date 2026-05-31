/**
 * Adapter + Router initialization.
 *
 * Registers all available data source adapters with the global registry
 * and creates the SourceRouter singleton backed by the DB route table.
 */

import { SourceRouter } from "@/lib/data-source/router";
import { getDb } from "@/lib/db";
import { EastMoneyAdapter } from "./eastmoney";
import { FixtureAdapter } from "./fixture";
import { FutuAdapter } from "./futu";
import { FutuNewsAdapter } from "./futu-news";
import { registry } from "./registry";

let adaptersInitialized = false;
let router: SourceRouter | null = null;

export function initAdapters(): void {
  if (adaptersInitialized) return;
  adaptersInitialized = true;

  // Fixture adapter (always available for testing)
  registry.register(new FixtureAdapter());

  // Futu OpenD adapter (requires running OpenD instance)
  try {
    registry.register(new FutuAdapter());
  } catch {
    // Non-fatal: Futu OpenD may not be running
    console.warn("[adapters] Futu OpenD not available");
  }

  // Futu news/sentiment (public HTTP API, always available)
  registry.register(new FutuNewsAdapter());

  // East Money (A-share board scanning, public HTTP API, always available)
  registry.register(new EastMoneyAdapter());
}

/**
 * Get the SourceRouter singleton. Initializes adapters on first call.
 * The router reads the route table from the DB and caches it in memory.
 */
export function getRouter(): SourceRouter {
  if (!router) {
    initAdapters();
    const db = getDb();
    router = new SourceRouter(db, registry.getMap());
  }
  return router;
}

/** Force-reload the router's route cache (call after admin CRUD). */
export function reloadRouter(): void {
  if (router) router.reload();
}

export { registry };
