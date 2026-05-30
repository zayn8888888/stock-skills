/**
 * SourceRouter — resolves (capability, market) → ordered provider list with fallback.
 *
 * The router reads the route table from the DB, caches it in memory,
 * and provides resolve/execute methods for tool dispatch.
 */

import { eq, and, or, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/lib/db/schema";
import { dataProviders, dataCapabilities, dataSourceRoutes } from "@/lib/db/schema";
import type { DataSourceAdapter, AdapterRequest, RawResponse, SourceHealth } from "@/lib/adapters/base";

type DB = BetterSQLite3Database<typeof schema>;

// ── Types ────────────────────────────────────────────────────────

export interface RouteEntry {
  routeId: string;
  priority: number;
  markets: string[];
  providerId: string;
  providerName: string;
  adapterId: string;
  adapter: DataSourceAdapter;
}

interface CachedRoute {
  routeId: string;
  capabilitySlug: string;
  providerId: string;
  providerName: string;
  adapterId: string;
  markets: string[];
  priority: number;
  enabled: boolean;
  providerEnabled: boolean;
}

// ── SourceRouter ─────────────────────────────────────────────────

export class SourceRouter {
  private db: DB;
  private registry: Map<string, DataSourceAdapter>;
  private cache: CachedRoute[] = [];
  private loaded = false;

  constructor(db: DB, registry: Map<string, DataSourceAdapter>) {
    this.db = db;
    this.registry = registry;
  }

  /** Load route table from DB into memory. Call after CRUD mutations. */
  reload(): void {
    const rows = this.db
      .select({
        routeId: dataSourceRoutes.id,
        capabilitySlug: dataCapabilities.slug,
        providerId: dataProviders.id,
        providerName: dataProviders.name,
        adapterId: dataProviders.adapterId,
        markets: dataSourceRoutes.markets,
        priority: dataSourceRoutes.priority,
        routeEnabled: dataSourceRoutes.enabled,
        providerEnabled: dataProviders.enabled,
      })
      .from(dataSourceRoutes)
      .innerJoin(dataProviders, eq(dataSourceRoutes.providerId, dataProviders.id))
      .innerJoin(dataCapabilities, eq(dataSourceRoutes.capabilityId, dataCapabilities.id))
      .all();

    this.cache = rows.map((r) => ({
      routeId: r.routeId,
      capabilitySlug: r.capabilitySlug,
      providerId: r.providerId,
      providerName: r.providerName,
      adapterId: r.adapterId,
      markets: JSON.parse(r.markets) as string[],
      priority: r.priority,
      enabled: r.routeEnabled === 1,
      providerEnabled: r.providerEnabled === 1,
    }));

    this.loaded = true;
  }

  /** Ensure cache is loaded. */
  private ensureLoaded(): void {
    if (!this.loaded) this.reload();
  }

  /**
   * Resolve (capability, market?) → ordered list of adapters to try.
   * Results are sorted by priority (ascending). Disabled routes/providers are excluded.
   */
  resolve(capability: string, market?: string): RouteEntry[] {
    this.ensureLoaded();

    const matches = this.cache.filter((r) => {
      // Match capability
      if (r.capabilitySlug !== capability) return false;
      // Skip disabled
      if (!r.enabled || !r.providerEnabled) return false;
      // Match market: wildcard ["*"] matches all, or markets must include the target
      if (market && !r.markets.includes("*") && !r.markets.includes(market)) {
        return false;
      }
      return true;
    });

    // Sort by priority ascending (lower = higher priority)
    matches.sort((a, b) => a.priority - b.priority);

    // Resolve adapter instances
    const entries: RouteEntry[] = [];
    for (const m of matches) {
      const adapter = this.registry.get(m.adapterId);
      if (!adapter) continue; // adapter not registered (e.g. not running)
      entries.push({
        routeId: m.routeId,
        priority: m.priority,
        markets: m.markets,
        providerId: m.providerId,
        providerName: m.providerName,
        adapterId: m.adapterId,
        adapter,
      });
    }

    return entries;
  }

  /**
   * Execute a fetch with automatic fallback.
   * Tries providers in priority order; returns the first successful result.
   */
  async execute(
    request: AdapterRequest,
  ): Promise<{ raw: RawResponse; adapter: DataSourceAdapter }> {
    const routes = this.resolve(request.operation, request.market);

    if (routes.length === 0) {
      throw new Error(
        `No available source for ${request.operation} (market=${request.market ?? "*"})`,
      );
    }

    const errors: string[] = [];
    for (const route of routes) {
      try {
        const raw = await route.adapter.fetch(request);
        return { raw, adapter: route.adapter };
      } catch (err) {
        errors.push(`${route.providerName}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    throw new Error(
      `All sources failed for ${request.operation}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  /**
   * Test a specific provider's connection for a given capability.
   */
  async testConnection(
    providerId: string,
    capability: string,
    market?: string,
  ): Promise<SourceHealth> {
    const routes = this.resolve(capability, market);
    const route = routes.find((r) => r.providerId === providerId);
    if (!route) {
      return {
        name: providerId,
        status: "down",
        last_checked_at: new Date().toISOString(),
        last_error: `No route found for ${capability} (market=${market ?? "*"})`,
      };
    }

    try {
      const start = Date.now();
      await route.adapter.fetch({
        operation: capability,
        ticker: "00700", // test ticker
        market: market ?? "HK",
      });
      return {
        name: route.providerName,
        status: "healthy",
        latency_ms: Date.now() - start,
        last_checked_at: new Date().toISOString(),
      };
    } catch (err) {
      return {
        name: route.providerName,
        status: "down",
        last_checked_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Get all registered capabilities from the DB. */
  getCapabilities(): Array<{
    id: string; slug: string; category: string;
    displayName: string; description: string | null;
    paramsSchema: string | null; responseSchema: string | null;
  }> {
    const rows = this.db.select().from(dataCapabilities).all();
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      category: r.category,
      displayName: r.displayName,
      description: r.description,
      paramsSchema: r.paramsSchema,
      responseSchema: r.responseSchema,
    }));
  }
}
