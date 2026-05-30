import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { SourceRouter } from "@/lib/data-source/router";
import type { DataSourceAdapter, AdapterRequest, RawResponse, SourceHealth } from "@/lib/adapters/base";
import { createTestDB } from "./helpers";

// ── Mock adapter factory ─────────────────────────────────────────

function createMockAdapter(
  name: string,
  capabilities: string[],
  fetchImpl?: (req: AdapterRequest) => Promise<RawResponse>,
): DataSourceAdapter {
  return {
    name,
    capabilities: () => capabilities,
    healthCheck: async (): Promise<SourceHealth> => ({
      name,
      status: "healthy",
      latency_ms: 1,
      last_checked_at: new Date().toISOString(),
    }),
    fetch: fetchImpl
      ? fetchImpl
      : async (req: AdapterRequest): Promise<RawResponse> => ({
          data: { ticker: req.ticker, mock: true },
          latency_ms: 1,
          source: name,
          operation: req.operation,
          fetched_at: new Date().toISOString(),
        }),
    normalize: (raw, req) => [
      {
        id: "obs-1",
        sessionId: "",
        category: req.operation.split(".")[0],
        ticker: req.ticker ?? null,
        detail: JSON.stringify(raw.data),
        confidence: 1.0,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function createFailingAdapter(name: string, capabilities: string[]): DataSourceAdapter {
  return createMockAdapter(name, capabilities, async () => {
    throw new Error(`${name} is down`);
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("SourceRouter", () => {
  let db: ReturnType<typeof createTestDB>;
  let registry: Map<string, DataSourceAdapter>;

  beforeEach(() => {
    db = createTestDB();
    registry = new Map();
  });

  function createRouter(): SourceRouter {
    return new SourceRouter(db, registry);
  }

  describe("resolve", () => {
    it("returns providers in priority order", () => {
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));

      const router = createRouter();
      const routes = router.resolve("quote.snapshot", "HK");

      expect(routes.length).toBe(2);
      // Futu has priority 1 (HK/US), fixture has priority 99
      expect(routes[0].adapterId).toBe("futu");
      expect(routes[1].adapterId).toBe("fixture");
    });

    it("filters by market correctly", () => {
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();

      // HK matches futu (HK,US) and fixture (*)
      const hkRoutes = router.resolve("quote.snapshot", "HK");
      expect(hkRoutes.length).toBe(2);

      // CRYPTO doesn't match futu, only fixture (wildcard)
      const cryptoRoutes = router.resolve("quote.snapshot", "CRYPTO");
      expect(cryptoRoutes.length).toBe(1);
      expect(cryptoRoutes[0].adapterId).toBe("fixture");
    });

    it("wildcard market matches all", () => {
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      const routes = router.resolve("quote.snapshot");
      expect(routes.length).toBe(1);
    });

    it("skips disabled routes", () => {
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      // Disable the futu route
      const { dataSourceRoutes } = schema;
      const futuRoute = db
        .select()
        .from(dataSourceRoutes)
        .all()
        .find((r) => r.providerId === "prov_futu")!;
      db.update(dataSourceRoutes)
        .set({ enabled: 0 })
        .where(eq(dataSourceRoutes.id, futuRoute.id))
        .run();

      const router = createRouter();
      const routes = router.resolve("quote.snapshot", "HK");

      expect(routes.length).toBe(1);
      expect(routes[0].adapterId).toBe("fixture");
    });

    it("skips disabled providers", () => {
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      // Disable the futu provider
      db.update(schema.dataProviders)
        .set({ enabled: 0 })
        .where(eq(schema.dataProviders.id, "prov_futu"))
        .run();

      const router = createRouter();
      const routes = router.resolve("quote.snapshot", "HK");

      expect(routes.length).toBe(1);
      expect(routes[0].adapterId).toBe("fixture");
    });

    it("returns empty for unknown capability", () => {
      const router = createRouter();
      const routes = router.resolve("unknown.cap");
      expect(routes.length).toBe(0);
    });

    it("skips adapters not in registry", () => {
      // Don't register futu
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      const routes = router.resolve("quote.snapshot", "HK");

      // Only fixture should appear (futu not registered)
      expect(routes.length).toBe(1);
      expect(routes[0].adapterId).toBe("fixture");
    });
  });

  describe("execute", () => {
    it("returns result from primary provider", async () => {
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      const { raw, adapter } = await router.execute({
        operation: "quote.snapshot",
        ticker: "00700",
        market: "HK",
      });

      expect(adapter.name).toBe("futu");
      expect(raw.source).toBe("futu");
    });

    it("falls back when primary fails", async () => {
      registry.set("futu", createFailingAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      const { raw, adapter } = await router.execute({
        operation: "quote.snapshot",
        ticker: "00700",
        market: "HK",
      });

      expect(adapter.name).toBe("fixture");
      expect(raw.source).toBe("fixture");
    });

    it("throws when all providers fail", async () => {
      registry.set("futu", createFailingAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createFailingAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      await expect(
        router.execute({ operation: "quote.snapshot", ticker: "00700", market: "HK" }),
      ).rejects.toThrow("All sources failed");
    });

    it("throws when no routes available", async () => {
      const router = createRouter();
      await expect(
        router.execute({ operation: "unknown.cap", ticker: "X" }),
      ).rejects.toThrow("No available source");
    });
  });

  describe("reload", () => {
    it("refreshes cache after DB mutation", () => {
      registry.set("futu", createMockAdapter("futu", ["quote.snapshot"]));
      registry.set("fixture", createMockAdapter("fixture", ["quote.snapshot"]));

      const router = createRouter();
      expect(router.resolve("quote.snapshot", "HK").length).toBe(2);

      // Disable futu route
      const futuRoute = db
        .select()
        .from(schema.dataSourceRoutes)
        .all()
        .find((r) => r.providerId === "prov_futu")!;
      db.update(schema.dataSourceRoutes)
        .set({ enabled: 0 })
        .where(eq(schema.dataSourceRoutes.id, futuRoute.id))
        .run();

      // Before reload: still 2
      expect(router.resolve("quote.snapshot", "HK").length).toBe(2);

      // After reload: 1
      router.reload();
      expect(router.resolve("quote.snapshot", "HK").length).toBe(1);
    });
  });

  describe("getCapabilities", () => {
    it("returns all seeded capabilities", () => {
      const router = createRouter();
      const caps = router.getCapabilities();
      expect(caps.length).toBeGreaterThanOrEqual(5);
      expect(caps.map((c) => c.slug)).toContain("quote.snapshot");
    });
  });
});
