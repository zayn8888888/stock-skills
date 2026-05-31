import type { SourceRouter } from "@/lib/data-source/router";
import * as schema from "@/lib/db/schema";
import type * as artifactWriterModule from "@/lib/runtime/artifact-writer";
import type * as goalManager from "@/lib/runtime/goal-manager";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";

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

// ──────────────────── capability tool builder ─────────────────────

/**
 * Build an Anthropic tool definition from a capability record.
 *
 * Convention: tool name is `get_{capability_slug_dots_to_underscores}`.
 * For example, capability "quote.snapshot" becomes "get_quote_snapshot".
 */
function buildCapabilityTool(cap: {
  slug: string;
  displayName: string;
  description: string | null;
  paramsSchema: string | null;
  responseSchema: string | null;
}): Anthropic.Tool {
  const toolName = `get_${cap.slug.replace(/\./g, "_")}`;

  // Build description: name + description + response schema summary
  let desc = `${cap.displayName}${cap.description ? `: ${cap.description}` : ""}`;
  if (cap.responseSchema) {
    try {
      const schema = JSON.parse(cap.responseSchema) as {
        properties?: Record<string, { type: string; description?: string }>;
      };
      if (schema.properties) {
        const fields = Object.entries(schema.properties)
          .map(
            ([name, prop]) =>
              `${name}(${prop.type})${prop.description ? `: ${prop.description}` : ""}`,
          )
          .join("; ");
        desc += `\n返回字段: ${fields}`;
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // Build input schema from paramsSchema or use default
  let inputSchema: Anthropic.Tool["input_schema"];
  if (cap.paramsSchema) {
    try {
      const parsed = JSON.parse(cap.paramsSchema);
      inputSchema = { type: "object" as const, ...parsed };
    } catch {
      inputSchema = buildDefaultInputSchema();
    }
  } else {
    inputSchema = buildDefaultInputSchema();
  }

  return { name: toolName, description: desc, input_schema: inputSchema };
}

function buildDefaultInputSchema(): Anthropic.Tool["input_schema"] {
  return {
    type: "object" as const,
    properties: {
      ticker: { type: "string", description: "Ticker symbol (e.g. 'NVDA', '00700', 'BTC')" },
      market: {
        type: "string",
        description: "Market identifier (e.g. 'HK', 'US', 'CN', 'CRYPTO')",
      },
      params: {
        type: "object",
        description: "Additional operation-specific parameters",
        additionalProperties: true,
      },
    },
    required: [],
  };
}

// ──────────────────── public API ────────────────────────────────────

/**
 * Create the full list of Anthropic tool definitions for an agent run.
 *
 * Includes:
 * - One tool per registered capability (data fetching via router)
 * - System tools: write_artifact, update_goal_evidence
 */
export function createTools(
  router: SourceRouter,
  _artifactWriter: typeof artifactWriterModule,
  _goalManager: typeof goalManager,
  _runId: string,
  _sessionId: string,
  _db: DB,
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  // Capability-based tools (from DB via router)
  const capabilities = router.getCapabilities();
  for (const cap of capabilities) {
    tools.push(buildCapabilityTool(cap));
  }

  // System tools
  tools.push(writeArtifactTool);
  tools.push(updateGoalEvidenceTool);

  return tools;
}

// ──────────────────── tool executor factory ─────────────────────────

export type ToolExecutorFn = (toolName: string, input: Record<string, unknown>) => Promise<string>;

/**
 * Create a tool executor function that dispatches tool calls to the
 * appropriate handler (router for data tools, artifact writer, or goal manager).
 */
export function createToolExecutor(
  router: SourceRouter,
  artifactWriter: typeof artifactWriterModule,
  goalManagerModule: typeof goalManager,
  runId: string,
  _sessionId: string,
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

      const result = artifactWriter.writeArtifact(runId, filename, content);

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

    // ── Data tools: get_{capability} ──
    if (toolName.startsWith("get_")) {
      const capability = toolName.slice(4).replace(/_/g, ".");
      let { ticker, market, params } = input as {
        ticker?: string;
        market?: string;
        params?: Record<string, unknown>;
      };

      // Normalize ticker: strip market prefixes like "US.FUTU" → "FUTU"
      // If a prefix is found and market wasn't set, extract it.
      if (ticker) {
        const prefixMatch = ticker.match(/^(US|HK|CN|SH|SZ|SG|JP)\.(.+)$/i);
        if (prefixMatch) {
          const prefix = prefixMatch[1].toUpperCase();
          ticker = prefixMatch[2];
          if (!market) {
            market = prefix === "SH" || prefix === "SZ" ? "CN" : prefix;
          }
        }
      }

      const { raw, adapter } = await router.execute({
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

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  };
}
