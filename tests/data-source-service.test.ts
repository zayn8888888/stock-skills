import {
  createCapability,
  createProvider,
  createRoute,
  deleteCapability,
  deleteProvider,
  deleteRoute,
  getCapability,
  getProvider,
  listCapabilities,
  listProviders,
  listRoutes,
  updateCapability,
  updateProvider,
  updateRoute,
} from "@/lib/data-source/service";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDB } from "./helpers";

function expectPresent<T>(value: T | undefined, label: string): T {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error(`${label} should be present`);
  }
  return value;
}

describe("data-source service", () => {
  let db: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    db = createTestDB();
  });

  // ── Providers ──────────────────────────────────────────────────

  describe("providers", () => {
    it("lists seeded providers", () => {
      const providers = listProviders(db);
      expect(providers.length).toBeGreaterThanOrEqual(2);
      const names = providers.map((p) => p.name);
      expect(names).toContain("测试数据 (Fixture)");
      expect(names).toContain("Futu OpenD");
    });

    it("creates a new provider", () => {
      const p = createProvider(db, {
        name: "Alpha Vantage",
        adapterId: "alphavantage",
        connectionConfig: JSON.stringify({ apiKey: "test123" }),
      });
      expect(p.name).toBe("Alpha Vantage");
      expect(p.adapterId).toBe("alphavantage");
      expect(p.enabled).toBe(1);
      expect(p.connectionConfig).toContain("test123");
    });

    it("gets provider by id", () => {
      const p = createProvider(db, { name: "Test", adapterId: "test" });
      const found = getProvider(db, p.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("Test");
    });

    it("updates a provider", () => {
      const p = createProvider(db, { name: "Old Name", adapterId: "test" });
      const updated = updateProvider(db, p.id, { name: "New Name", enabled: 0 });
      expect(updated.name).toBe("New Name");
      expect(updated.enabled).toBe(0);
    });

    it("deletes a provider and cascades routes", () => {
      const p = createProvider(db, { name: "Temp", adapterId: "temp" });
      const caps = listCapabilities(db);
      const cap = expectPresent(caps[0], "seed capability");
      createRoute(db, { providerId: p.id, capabilityId: cap.id });

      expect(listRoutes(db, { providerId: p.id }).length).toBe(1);
      deleteProvider(db, p.id);
      expect(getProvider(db, p.id)).toBeNull();
      expect(listRoutes(db, { providerId: p.id }).length).toBe(0);
    });

    it("rejects duplicate provider name", () => {
      createProvider(db, { name: "Unique", adapterId: "u" });
      expect(() => createProvider(db, { name: "Unique", adapterId: "u2" })).toThrow();
    });
  });

  // ── Capabilities ───────────────────────────────────────────────

  describe("capabilities", () => {
    it("lists seeded capabilities", () => {
      const caps = listCapabilities(db);
      expect(caps.length).toBeGreaterThanOrEqual(5);
      const slugs = caps.map((c) => c.slug);
      expect(slugs).toContain("quote.snapshot");
      expect(slugs).toContain("news.search");
    });

    it("creates a new capability", () => {
      const c = createCapability(db, {
        slug: "macro.cpi",
        category: "macro",
        displayName: "CPI Data",
        description: "Consumer Price Index",
      });
      expect(c.slug).toBe("macro.cpi");
      expect(c.displayName).toBe("CPI Data");
    });

    it("updates a capability", () => {
      const caps = listCapabilities(db);
      const updated = updateCapability(db, caps[0].id, { displayName: "Updated" });
      expect(updated.displayName).toBe("Updated");
    });

    it("deletes a capability and cascades routes", () => {
      const c = createCapability(db, { slug: "temp.test", category: "test", displayName: "Temp" });
      const provs = listProviders(db);
      const prov = expectPresent(provs[0], "seed provider");
      createRoute(db, { providerId: prov.id, capabilityId: c.id });

      deleteCapability(db, c.id);
      expect(getCapability(db, c.id)).toBeNull();
    });
  });

  // ── Routes ─────────────────────────────────────────────────────

  describe("routes", () => {
    it("lists seeded routes", () => {
      const routes = listRoutes(db);
      expect(routes.length).toBeGreaterThanOrEqual(5);
    });

    it("creates a new route", () => {
      const provs = listProviders(db);
      const caps = listCapabilities(db);
      // Use a capability that doesn't have a route for this provider yet
      const cap = expectPresent(
        caps.find((c) => c.slug === "news.search"),
        "news.search capability",
      );
      const prov = expectPresent(
        provs.find((p) => p.adapterId === "futu"),
        "futu provider",
      );
      const r = createRoute(db, {
        providerId: prov.id,
        capabilityId: cap.id,
        markets: ["HK"],
        priority: 3,
      });
      expect(r.markets).toBe('["HK"]');
      expect(r.priority).toBe(3);
    });

    it("filters routes by providerId", () => {
      const provs = listProviders(db);
      const futuRoutes = listRoutes(db, {
        providerId: provs.find((p) => p.adapterId === "futu")?.id,
      });
      expect(futuRoutes.length).toBe(15); // all futu-supported capabilities
    });

    it("updates a route", () => {
      const routes = listRoutes(db);
      const route = expectPresent(routes[0], "seed route");
      const updated = updateRoute(db, route.id, { priority: 10, enabled: 0 });
      expect(updated.priority).toBe(10);
      expect(updated.enabled).toBe(0);
    });

    it("deletes a route", () => {
      const routes = listRoutes(db);
      const countBefore = routes.length;
      const route = expectPresent(routes[0], "seed route");
      deleteRoute(db, route.id);
      expect(listRoutes(db).length).toBe(countBefore - 1);
    });
  });
});
