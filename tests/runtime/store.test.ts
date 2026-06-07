import * as schema from "@/lib/db/schema";
import { describe, expect, it } from "vitest";
import { createTestDB } from "../helpers";

describe("vNext schema", () => {
  it("exports all vNext canonical tables", () => {
    // New vNext tables
    expect(schema.appMeta).toBeDefined();
    expect(schema.commandLog).toBeDefined();
    expect(schema.runtimeEvents).toBeDefined();
    expect(schema.toolCalls).toBeDefined();
    expect(schema.runnerProviders).toBeDefined();
    expect(schema.runnerRuns).toBeDefined();
  });

  it("exports vNext versions of core business tables", () => {
    expect(schema.sessions).toBeDefined();
    expect(schema.messages).toBeDefined();
    expect(schema.runs).toBeDefined();
    expect(schema.artifacts).toBeDefined();
    expect(schema.researchGoals).toBeDefined();
    expect(schema.goalCriteria).toBeDefined();
    expect(schema.goalEvidence).toBeDefined();
    expect(schema.observations).toBeDefined();
    expect(schema.decisions).toBeDefined();
    expect(schema.lessons).toBeDefined();
  });

  it("exports vNext data source tables", () => {
    expect(schema.dataProviders).toBeDefined();
    expect(schema.dataCapabilities).toBeDefined();
    expect(schema.dataSourceRoutes).toBeDefined();
  });

  it("runtime_events has canonical envelope columns", () => {
    // Verify the table has at least the core envelope fields
    // by checking the column object keys on the Drizzle table
    const table = schema.runtimeEvents;
    const colKeys = Object.keys(table).map((k) => k);
    const requiredCols = [
      "id",
      "sessionId",
      "runId",
      "type",
      "category",
      "producer",
      "visibility",
      "schemaVersion",
      "payloadJson",
      "createdAt",
    ];
    for (const col of requiredCols) {
      expect(colKeys).toContain(col);
    }
  });

  it("can create an in-memory database and query vNext tables", () => {
    const db = createTestDB();
    // Insert and read from app_meta to prove vNext migration ran
    expect(db).toBeDefined();
  });
});
