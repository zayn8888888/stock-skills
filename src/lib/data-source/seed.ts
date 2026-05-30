/**
 * Seed script — reads capabilities.json + all adapter manifests,
 * then DELETE → INSERT into the DB (idempotent).
 *
 * Called by the migration, or standalone for re-seeding.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type * as schema from "@/lib/db/schema";
import { dataProviders, dataCapabilities, dataSourceRoutes } from "@/lib/db/schema";

type DB = BetterSQLite3Database<typeof schema>;

// ── Manifest types ───────────────────────────────────────────────

interface AdapterManifest {
  provider: {
    id: string;
    name: string;
    adapterId: string;
    connectionConfig?: Record<string, unknown>;
  };
  supports: string[]; // capability slugs
  routes: Array<{
    capabilitySlug: string;
    markets: string[];
    priority: number;
  }>;
}

interface CapabilityDef {
  id: string;
  slug: string;
  category: string;
  displayName: string;
  description: string;
  paramsSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
}

// ── Helpers ──────────────────────────────────────────────────────

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function findManifests(): string[] {
  const adaptersDir = join(process.cwd(), "src/lib/adapters");
  const manifests: string[] = [];
  for (const dir of readdirSync(adaptersDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const manifestPath = join(adaptersDir, dir.name, "manifest.json");
    try {
      readFileSync(manifestPath); // throws if not exists
      manifests.push(manifestPath);
    } catch {
      // no manifest — skip
    }
  }
  return manifests;
}

// ── Seed function ────────────────────────────────────────────────

export function seed(db: DB): void {
  const now = new Date().toISOString();

  // 1. Load capabilities
  const capsPath = join(process.cwd(), "src/lib/data-source/capabilities.json");
  const { capabilities } = readJson(capsPath) as { capabilities: CapabilityDef[] };

  // 2. Load all adapter manifests
  const manifestPaths = findManifests();
  const manifests = manifestPaths.map((p) => readJson(p) as AdapterManifest);

  // ── DELETE existing seed data ──────────────────────────────────
  // Delete in correct order: routes → capabilities → providers
  const allCapIds = capabilities.map((c) => c.id);
  const allProvIds = manifests.map((m) => m.provider.id);

  if (allCapIds.length > 0) {
    db.delete(dataSourceRoutes).run();
  }
  if (allCapIds.length > 0) {
    db.delete(dataCapabilities).run();
  }
  if (allProvIds.length > 0) {
    db.delete(dataSourceRoutes).run(); // routes reference providers
    db.delete(dataProviders).run();
  }

  // ── DELETE routes + capabilities (always refresh from JSON) ─────
  db.delete(dataSourceRoutes).run();
  db.delete(dataCapabilities).run();

  // ── UPSERT providers (preserve enabled + status from UI) ──────
  const existingProviders = new Map(
    db.select({ id: dataProviders.id, enabled: dataProviders.enabled, status: dataProviders.status, lastCheckAt: dataProviders.lastCheckAt, lastError: dataProviders.lastError })
      .from(dataProviders).all().map((p) => [p.id, p])
  );
  db.delete(dataProviders).run();

  for (const manifest of manifests) {
    const { provider } = manifest;
    const existing = existingProviders.get(provider.id);
    db.insert(dataProviders).values({
      id: provider.id,
      name: provider.name,
      adapterId: provider.adapterId,
      enabled: existing?.enabled ?? 1,
      connectionConfig: provider.connectionConfig
        ? JSON.stringify(provider.connectionConfig)
        : null,
      status: existing?.status ?? "unknown",
      lastCheckAt: existing?.lastCheckAt ?? null,
      lastError: existing?.lastError ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // ── INSERT capabilities ────────────────────────────────────────
  for (const cap of capabilities) {
    db.insert(dataCapabilities).values({
      id: cap.id,
      slug: cap.slug,
      category: cap.category,
      displayName: cap.displayName,
      description: cap.description ?? null,
      paramsSchema: cap.paramsSchema ? JSON.stringify(cap.paramsSchema) : null,
      responseSchema: cap.responseSchema ? JSON.stringify(cap.responseSchema) : null,
      createdAt: now,
    }).run();
  }

  // Build slug → id map for route resolution
  const slugToId = new Map<string, string>();
  for (const cap of capabilities) {
    slugToId.set(cap.slug, cap.id);
  }

  // ── INSERT routes from manifests ──────────────────────────────
  for (const manifest of manifests) {
    const { provider, routes } = manifest;
    for (const route of routes) {
      const capId = slugToId.get(route.capabilitySlug);
      if (!capId) {
        console.warn(`[seed] capability "${route.capabilitySlug}" not found, skipping route`);
        continue;
      }
      db.insert(dataSourceRoutes).values({
        id: `rt_${provider.id}_${route.capabilitySlug.replace(/\./g, "_")}`,
        providerId: provider.id,
        capabilityId: capId,
        markets: JSON.stringify(route.markets),
        priority: route.priority,
        enabled: 1,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
  }

  const capCount = db.select().from(dataCapabilities).all().length;
  const provCount = db.select().from(dataProviders).all().length;
  const routeCount = db.select().from(dataSourceRoutes).all().length;
  console.log(`[seed] ${capCount} capabilities, ${provCount} providers, ${routeCount} routes`);
}
