import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AdapterRegistry } from "@/lib/adapters/registry";
import type { writeArtifact } from "@/lib/runtime/artifact-writer";
import type * as goalManager from "@/lib/runtime/goal-manager";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// ──────────────────── system tools (static definitions) ─────────────

const writeArtifactTool: Anthropic.Tool = {
  name: "write_artifact",
  description:
    "Write a file artifact (report, chart, data, model) to the analysis output directory. " +
    "The artifact is associated with the current run.",
  input_schema: {
    type: "object" as const,
    properties: {
      filename: {
        type: "string",
        description: "Target filename (e.g. 'analysis.md', 'chart.png')",
      },
      content: {
        type: "string",
        description: "UTF-8 content to write",
      },
      kind: {
        type: "string",
        enum: ["report", "chart", "data", "model"],
        description: "Artifact kind",
      },
    },
    required: ["filename", "content", "kind"],
  },
};

const updateGoalEvidenceTool: Anthropic.Tool = {
  name: "update_goal_evidence",
  description:
    "Attach evidence to a goal criterion. Use this to track progress toward research goals.",
  input_schema: {
    type: "object" as const,
    properties: {
      criterionId: {
        type: "string",
        description: "ID of the criterion to attach evidence to",
      },
      evidence: {
        type: "string",
        description: "Evidence text describing the finding",
      },
      source: {
        type: "string",
        description: "Data source that produced the evidence (optional)",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0-1 (optional)",
      },
    },
    required: ["criterionId", "evidence"],
  },
};

// ──────────────────── adapter tool builder ──────────────────────────

/**
 * Build an Anthropic tool definition from an adapter capability string.
 *
 * Convention: tool name is `{adapterName}_{capability_dots_to_underscores}`.
 * For example, adapter "yfinance" with capability "quote.snapshot"
 * becomes tool name "yfinance_quote_snapshot".
 */
function buildAdapterTool(
  adapterName: string,
  capability: string,
): Anthropic.Tool {
  const toolName = `${adapterName}_${capability.replace(/\./g, "_")}`;

  return {
    name: toolName,
    description:
      `Fetch ${capability} data from ${adapterName}. ` +
      `Operation: ${capability}`,
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: {
          type: "string",
          description: "Ticker symbol (e.g. 'NVDA', 'AAPL')",
        },
        market: {
          type: "string",
          description: "Market identifier (e.g. 'NASDAQ', 'SSE')",
        },
        params: {
          type: "object",
          description: "Additional operation-specific parameters",
          additionalProperties: true,
        },
      },
      required: [],
    },
  };
}

// ──────────────────── public API ────────────────────────────────────

/**
 * Create the full list of Anthropic tool definitions for an agent run.
 *
 * Includes:
 * - One tool per adapter capability (data fetching)
 * - System tools: write_artifact, update_goal_evidence
 */
export function createTools(
  adapterRegistry: AdapterRegistry,
  _artifactWriter: typeof writeArtifact,
  _goalManager: typeof goalManager,
  _runId: string,
  _sessionId: string,
  _db: DB,
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  // Adapter tools
  for (const adapter of adapterRegistry.list()) {
    for (const capability of adapter.capabilities()) {
      tools.push(buildAdapterTool(adapter.name, capability));
    }
  }

  // System tools
  tools.push(writeArtifactTool);
  tools.push(updateGoalEvidenceTool);

  return tools;
}

// ──────────────────── tool executor factory ─────────────────────────

export interface ToolExecutorFn {
  (toolName: string, input: Record<string, unknown>): Promise<string>;
}

/**
 * Create a tool executor function that dispatches tool calls to the
 * appropriate handler (adapter, artifact writer, or goal manager).
 */
export function createToolExecutor(
  adapterRegistry: AdapterRegistry,
  artifactWriter: typeof writeArtifact,
  goalManagerModule: typeof goalManager,
  runId: string,
  sessionId: string,
  db: DB,
): ToolExecutorFn {
  return async (toolName: string, input: Record<string, unknown>): Promise<string> => {
    // ── System tool: write_artifact ──
    if (toolName === "write_artifact") {
      const { filename, content, kind } = input as {
        filename: string;
        content: string;
        kind: string;
      };

      const result = artifactWriter(runId, filename, content);

      // Persist artifact record in DB
      db.insert(schema.artifacts)
        .values({
          id: nanoid(),
          runId,
          kind,
          name: filename,
          path: result.path,
          content: null,
          mimeType: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      return JSON.stringify({
        success: true,
        path: result.path,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
      });
    }

    // ── System tool: update_goal_evidence ──
    if (toolName === "update_goal_evidence") {
      const { criterionId, evidence, source, confidence } = input as {
        criterionId: string;
        evidence: string;
        source?: string;
        confidence?: number;
      };

      // Find the goal that owns this criterion
      const [criterion] = db
        .select({ goalId: schema.goalCriteria.goalId })
        .from(schema.goalCriteria)
        .where(eq(schema.goalCriteria.id, criterionId))
        .limit(1)
        .all();

      if (!criterion) {
        return JSON.stringify({ error: `Criterion "${criterionId}" not found` });
      }

      const result = goalManagerModule.addEvidence(db, criterion.goalId, {
        criterionId,
        evidence,
        source,
        confidence,
      });

      return JSON.stringify({ success: true, evidenceId: result.id });
    }

    // ── Adapter tools: {adapterName}_{capability} ──
    const adapters = adapterRegistry.list();
    for (const adapter of adapters) {
      for (const capability of adapter.capabilities()) {
        const expectedName = `${adapter.name}_${capability.replace(/\./g, "_")}`;
        if (toolName !== expectedName) continue;

        const { ticker, market, params } = input as {
          ticker?: string;
          market?: string;
          params?: Record<string, unknown>;
        };

        const raw = await adapter.fetch({
          operation: capability,
          ticker,
          market,
          params,
        });

        const observations = adapter.normalize(raw, {
          operation: capability,
          ticker,
          market,
          params,
        });

        return JSON.stringify({
          source: raw.source,
          operation: raw.operation,
          latency_ms: raw.latency_ms,
          observations,
          data: raw.data,
        });
      }
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  };
}
