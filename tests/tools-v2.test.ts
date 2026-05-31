import type { AdapterRequest, DataSourceAdapter, RawResponse } from "@/lib/adapters/base";
import { createToolExecutor, createTools } from "@/lib/agent/tools";
import { SourceRouter } from "@/lib/data-source/router";
import * as schema from "@/lib/db/schema";
import type * as artifactWriterModule from "@/lib/runtime/artifact-writer";
import type * as goalManagerModule from "@/lib/runtime/goal-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDB } from "./helpers";

// ── Mock adapter ─────────────────────────────────────────────────

function createMockAdapter(name: string): DataSourceAdapter {
  return {
    name,
    capabilities: () => ["quote.snapshot", "quote.kline"],
    healthCheck: async () => ({
      name,
      status: "healthy" as const,
      latency_ms: 1,
      last_checked_at: new Date().toISOString(),
    }),
    fetch: async (req: AdapterRequest): Promise<RawResponse> => ({
      data: { price: 100, ticker: req.ticker },
      latency_ms: 5,
      source: name,
      operation: req.operation,
      fetched_at: new Date().toISOString(),
    }),
    normalize: (raw, req) => [
      {
        id: "obs-1",
        sessionId: "",
        category: "quote",
        ticker: req.ticker ?? null,
        detail: JSON.stringify(raw.data),
        confidence: 1.0,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

// ── Mock artifact writer & goal manager ──────────────────────────

const mockArtifactWriter = {
  writeArtifact: vi.fn((runId: string, filename: string, content: string) => ({
    path: `/tmp/${runId}/${filename}`,
    checksum: "abc123",
    sizeBytes: content.length,
    sha256: "abc123",
  })),
} satisfies Pick<typeof artifactWriterModule, "writeArtifact">;

const mockGoalManager = {
  addEvidence: vi.fn(() => ({ id: "evidence-1" })),
} satisfies Pick<typeof goalManagerModule, "addEvidence">;

const artifactWriter = mockArtifactWriter as typeof artifactWriterModule;
const goalManager = mockGoalManager as typeof goalManagerModule;

// ── Tests ────────────────────────────────────────────────────────

describe("tools v2", () => {
  let db: ReturnType<typeof createTestDB>;
  let registry: Map<string, DataSourceAdapter>;
  let router: SourceRouter;

  beforeEach(() => {
    db = createTestDB();
    registry = new Map();
    registry.set("fixture", createMockAdapter("fixture"));
    registry.set("futu", createMockAdapter("futu"));
    router = new SourceRouter(db, registry);
    vi.clearAllMocks();
  });

  describe("createTools", () => {
    it("generates get_* tools from DB capabilities", () => {
      const tools = createTools(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_quote_snapshot");
      expect(toolNames).toContain("get_quote_kline");
      expect(toolNames).toContain("get_quote_depth");
      expect(toolNames).toContain("get_news_search");
      expect(toolNames).toContain("get_technical_indicators");
    });

    it("includes system tools", () => {
      const tools = createTools(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("write_artifact");
      expect(toolNames).toContain("update_goal_evidence");
    });

    it("tool descriptions include display_name", () => {
      const tools = createTools(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const snapshotTool = tools.find((t) => t.name === "get_quote_snapshot");
      expect(snapshotTool).toBeDefined();
      expect(snapshotTool?.description).toContain("实时报价");
    });
  });

  describe("createToolExecutor", () => {
    it("dispatches get_* tools through router", async () => {
      const exec = createToolExecutor(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const result = JSON.parse(
        await exec("get_quote_snapshot", { ticker: "00700", market: "HK" }),
      );

      expect(result.source).toBeDefined();
      expect(result.operation).toBe("quote.snapshot");
      expect(result.data.price).toBe(100);
      expect(result.observations.length).toBe(1);
    });

    it("handles write_artifact system tool", async () => {
      // Create session + run so FK constraints are satisfied
      db.insert(schema.sessions)
        .values({
          id: "sess-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      db.insert(schema.runs)
        .values({
          id: "run-1",
          sessionId: "sess-1",
          skillName: "test",
          status: "running",
          createdAt: new Date().toISOString(),
        })
        .run();

      const exec = createToolExecutor(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const result = JSON.parse(
        await exec("write_artifact", {
          filename: "report.md",
          content: "# Report",
          kind: "report",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.path).toContain("report.md");
      expect(mockArtifactWriter.writeArtifact).toHaveBeenCalledWith(
        "run-1",
        "report.md",
        "# Report",
      );
    });

    it("returns error for unknown tool", async () => {
      const exec = createToolExecutor(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const result = JSON.parse(await exec("nonexistent_tool", {}));
      expect(result.error).toContain("Unknown tool");
    });

    it("converts underscores back to dots for capability", async () => {
      const exec = createToolExecutor(router, artifactWriter, goalManager, "run-1", "sess-1", db);

      const result = JSON.parse(await exec("get_technical_indicators", { ticker: "AAPL" }));

      expect(result.operation).toBe("technical.indicators");
    });
  });
});
