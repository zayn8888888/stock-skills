/**
 * Data Source Service — CRUD operations for providers, capabilities, and routes.
 */

import type * as schema from "@/lib/db/schema";
import { dataCapabilities, dataProviders, dataSourceRoutes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { customAlphabet } from "nanoid";

type DB = BetterSQLite3Database<typeof schema>;
const genId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 12);

function requireRow<T>(row: T | null | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not found after write`);
  }
  return row;
}

// ── Providers ────────────────────────────────────────────────────

export function listProviders(db: DB) {
  return db.select().from(dataProviders).all();
}

export function getProvider(db: DB, id: string) {
  const rows = db.select().from(dataProviders).where(eq(dataProviders.id, id)).limit(1).all();
  return rows[0] ?? null;
}

export function createProvider(
  db: DB,
  input: { name: string; adapterId: string; connectionConfig?: string },
) {
  const now = new Date().toISOString();
  const id = `prov_${genId()}`;
  db.insert(dataProviders)
    .values({
      id,
      name: input.name,
      adapterId: input.adapterId,
      connectionConfig: input.connectionConfig ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return requireRow(getProvider(db, id), `Provider "${id}"`);
}

export function updateProvider(
  db: DB,
  id: string,
  input: Partial<{
    name: string;
    adapterId: string;
    enabled: number;
    connectionConfig: string;
    status: string;
    lastCheckAt: string;
    lastError: string;
  }>,
) {
  db.update(dataProviders)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(dataProviders.id, id))
    .run();
  return requireRow(getProvider(db, id), `Provider "${id}"`);
}

export function deleteProvider(db: DB, id: string) {
  // Cascade: delete routes referencing this provider
  db.delete(dataSourceRoutes).where(eq(dataSourceRoutes.providerId, id)).run();
  db.delete(dataProviders).where(eq(dataProviders.id, id)).run();
}

// ── Capabilities ─────────────────────────────────────────────────

export function listCapabilities(db: DB) {
  return db.select().from(dataCapabilities).all();
}

export function getCapability(db: DB, id: string) {
  const rows = db.select().from(dataCapabilities).where(eq(dataCapabilities.id, id)).limit(1).all();
  return rows[0] ?? null;
}

export function createCapability(
  db: DB,
  input: {
    slug: string;
    category: string;
    displayName: string;
    description?: string;
    paramsSchema?: string;
    responseSchema?: string;
  },
) {
  const id = `cap_${genId()}`;
  db.insert(dataCapabilities)
    .values({
      id,
      slug: input.slug,
      category: input.category,
      displayName: input.displayName,
      description: input.description ?? null,
      paramsSchema: input.paramsSchema ?? null,
      responseSchema: input.responseSchema ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return requireRow(getCapability(db, id), `Capability "${id}"`);
}

export function updateCapability(
  db: DB,
  id: string,
  input: Partial<{
    slug: string;
    category: string;
    displayName: string;
    description: string;
    paramsSchema: string;
    responseSchema: string;
  }>,
) {
  db.update(dataCapabilities).set(input).where(eq(dataCapabilities.id, id)).run();
  return requireRow(getCapability(db, id), `Capability "${id}"`);
}

export function deleteCapability(db: DB, id: string) {
  // Cascade: delete routes referencing this capability
  db.delete(dataSourceRoutes).where(eq(dataSourceRoutes.capabilityId, id)).run();
  db.delete(dataCapabilities).where(eq(dataCapabilities.id, id)).run();
}

// ── Routes ───────────────────────────────────────────────────────

export function listRoutes(db: DB, filters?: { providerId?: string; capabilityId?: string }) {
  let rows = db.select().from(dataSourceRoutes).all();
  if (filters?.providerId) rows = rows.filter((r) => r.providerId === filters.providerId);
  if (filters?.capabilityId) rows = rows.filter((r) => r.capabilityId === filters.capabilityId);
  return rows;
}

export function createRoute(
  db: DB,
  input: { providerId: string; capabilityId: string; markets?: string[]; priority?: number },
) {
  const now = new Date().toISOString();
  const id = `rt_${genId()}`;
  // Use INSERT with ON CONFLICT: if route already exists, toggle enabled
  const markets = JSON.stringify(input.markets ?? ["*"]);
  const priority = input.priority ?? 1;

  const existing = db
    .select()
    .from(dataSourceRoutes)
    .where(
      and(
        eq(dataSourceRoutes.providerId, input.providerId),
        eq(dataSourceRoutes.capabilityId, input.capabilityId),
      ),
    )
    .all();

  if (existing.length > 0) {
    // Toggle enabled state
    const r = existing[0];
    const newEnabled = r.enabled ? 0 : 1;
    db.update(dataSourceRoutes)
      .set({ enabled: newEnabled, updatedAt: now })
      .where(eq(dataSourceRoutes.id, r.id))
      .run();
    const [updatedRoute] = db
      .select()
      .from(dataSourceRoutes)
      .where(eq(dataSourceRoutes.id, r.id))
      .all();
    return requireRow(updatedRoute, `Route "${r.id}"`);
  }

  db.insert(dataSourceRoutes)
    .values({
      id,
      providerId: input.providerId,
      capabilityId: input.capabilityId,
      markets,
      priority,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const [createdRoute] = db
    .select()
    .from(dataSourceRoutes)
    .where(eq(dataSourceRoutes.id, id))
    .all();
  return requireRow(createdRoute, `Route "${id}"`);
}

export function updateRoute(
  db: DB,
  id: string,
  input: Partial<{ markets: string[]; priority: number; enabled: number }>,
) {
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.markets !== undefined) update.markets = JSON.stringify(input.markets);
  if (input.priority !== undefined) update.priority = input.priority;
  if (input.enabled !== undefined) update.enabled = input.enabled;
  db.update(dataSourceRoutes).set(update).where(eq(dataSourceRoutes.id, id)).run();
  const [updatedRoute] = db
    .select()
    .from(dataSourceRoutes)
    .where(eq(dataSourceRoutes.id, id))
    .all();
  return requireRow(updatedRoute, `Route "${id}"`);
}

export function deleteRoute(db: DB, id: string) {
  db.delete(dataSourceRoutes).where(eq(dataSourceRoutes.id, id)).run();
}
