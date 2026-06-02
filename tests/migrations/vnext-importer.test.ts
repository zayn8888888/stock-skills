import { describe, expect, it } from "vitest";
import { mapOldRunStatus, mapOldRunEventType } from "@/lib/migrations/vnext-importer";

describe("vNext importer", () => {
  describe("mapOldRunStatus", () => {
    it("maps pending -> queued", () => {
      expect(mapOldRunStatus("pending")).toBe("queued");
    });

    it("maps running -> running", () => {
      expect(mapOldRunStatus("running")).toBe("running");
    });

    it("maps success -> succeeded", () => {
      expect(mapOldRunStatus("success")).toBe("succeeded");
    });

    it("maps failed -> failed", () => {
      expect(mapOldRunStatus("failed")).toBe("failed");
    });

    it("maps cancelled -> cancelled", () => {
      expect(mapOldRunStatus("cancelled")).toBe("cancelled");
    });

    it("passes through unknown statuses unchanged", () => {
      expect(mapOldRunStatus("unknown_status")).toBe("unknown_status");
    });
  });

  describe("mapOldRunEventType", () => {
    it("maps tool_use running -> tool.call.created", () => {
      expect(mapOldRunEventType("tool_use", "running")).toBe("tool.call.created");
    });

    it("maps tool_use completed -> tool.call.completed", () => {
      expect(mapOldRunEventType("tool_use", "completed")).toBe("tool.call.completed");
    });

    it("maps tool_use error -> tool.call.failed", () => {
      expect(mapOldRunEventType("tool_use", "error")).toBe("tool.call.failed");
    });

    it("maps error -> error.created", () => {
      expect(mapOldRunEventType("error")).toBe("error.created");
    });

    it("maps run_started -> run.started", () => {
      expect(mapOldRunEventType("run_started")).toBe("run.started");
    });

    it("maps run.created -> run.created", () => {
      expect(mapOldRunEventType("run.created")).toBe("run.created");
    });

    it("maps progress -> run.progressed", () => {
      expect(mapOldRunEventType("progress")).toBe("run.progressed");
    });

    it("maps log -> run.progressed", () => {
      expect(mapOldRunEventType("log")).toBe("run.progressed");
    });

    it("maps unknown event type to system.info", () => {
      expect(mapOldRunEventType("unknown_event")).toBe("system.info");
    });
  });
});
