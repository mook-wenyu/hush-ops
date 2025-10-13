import { describe, expect, it } from "vitest";

import { buildEventMessage } from "../../../src/service/orchestrator/server.js";

describe("buildEventMessage", () => {
  it("returns message for valid runtime.state-change event", () => {
    const result = buildEventMessage("runtime.state-change", {
      bridgeState: "connected",
      planId: "plan-1",
      executionStatus: "idle",
      running: false,
      pendingApprovals: []
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain("\"event\":\"runtime.state-change\"");
    }
  });

  it("rejects unknown event name", () => {
    const result = buildEventMessage("runtime.unknown", {});
    expect(result.success).toBe(false);
  });

  it("rejects invalid payload", () => {
    const result = buildEventMessage("execution.completed", { message: "bad" });
    expect(result.success).toBe(false);
  });
});
