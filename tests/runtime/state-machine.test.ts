import { assertRunTransition, assertToolTransition } from "@/lib/runtime/state-machine";
import { describe, expect, it } from "vitest";

describe("Run state machine", () => {
  it("allows queued -> running", () => {
    expect(() => assertRunTransition("queued", "running")).not.toThrow();
  });

  it("allows running -> succeeded", () => {
    expect(() => assertRunTransition("running", "succeeded")).not.toThrow();
  });

  it("allows running -> failed", () => {
    expect(() => assertRunTransition("running", "failed")).not.toThrow();
  });

  it("allows running -> cancelling", () => {
    expect(() => assertRunTransition("running", "cancelling")).not.toThrow();
  });

  it("allows cancelling -> cancelled", () => {
    expect(() => assertRunTransition("cancelling", "cancelled")).not.toThrow();
  });

  it("allows queued -> cancelled (cancel before start)", () => {
    expect(() => assertRunTransition("queued", "cancelled")).not.toThrow();
  });

  it("allows running -> waiting_for_input", () => {
    expect(() => assertRunTransition("running", "waiting_for_input")).not.toThrow();
  });

  it("allows waiting_for_input -> running", () => {
    expect(() => assertRunTransition("waiting_for_input", "running")).not.toThrow();
  });

  it("allows waiting_for_input -> cancelled", () => {
    expect(() => assertRunTransition("waiting_for_input", "cancelled")).not.toThrow();
  });

  it("rejects succeeded -> running", () => {
    expect(() => assertRunTransition("succeeded", "running")).toThrow("invalid transition");
  });

  it("rejects failed -> running", () => {
    expect(() => assertRunTransition("failed", "running")).toThrow("invalid transition");
  });

  it("rejects cancelled -> running", () => {
    expect(() => assertRunTransition("cancelled", "running")).toThrow("invalid transition");
  });

  it("rejects succeeded -> failed", () => {
    expect(() => assertRunTransition("succeeded", "failed")).toThrow("invalid transition");
  });
});

describe("Tool state machine", () => {
  it("allows created -> running", () => {
    expect(() => assertToolTransition("created", "running")).not.toThrow();
  });

  it("allows created -> args_streaming", () => {
    expect(() => assertToolTransition("created", "args_streaming")).not.toThrow();
  });

  it("allows args_streaming -> running", () => {
    expect(() => assertToolTransition("args_streaming", "running")).not.toThrow();
  });

  it("allows running -> succeeded", () => {
    expect(() => assertToolTransition("running", "succeeded")).not.toThrow();
  });

  it("allows running -> failed", () => {
    expect(() => assertToolTransition("running", "failed")).not.toThrow();
  });

  it("allows created -> skipped", () => {
    expect(() => assertToolTransition("created", "skipped")).not.toThrow();
  });

  it("rejects succeeded -> running", () => {
    expect(() => assertToolTransition("succeeded", "running")).toThrow("invalid transition");
  });

  it("rejects failed -> running", () => {
    expect(() => assertToolTransition("failed", "running")).toThrow("invalid transition");
  });

  it("rejects running -> created", () => {
    expect(() => assertToolTransition("running", "created")).toThrow("invalid transition");
  });
});
