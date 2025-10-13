import { describe, expect, it } from "vitest";

import {
  EventEnvelopeSchema,
  EventNameSchema,
  EventSchemaVersion
} from "../../../src/service/orchestrator/eventSchema.js";

describe("event schema", () => {
  it("parses runtime.state-change envelope", () => {
    const parsed = EventEnvelopeSchema.parse({
      event: "runtime.state-change",
      payload: {
        bridgeState: "connected",
        planId: "plan-1",
        executionStatus: "idle",
        running: false,
        pendingApprovals: []
      },
      timestamp: new Date().toISOString(),
      topics: ["runtime"]
    });

    expect(parsed.event).toBe("runtime.state-change");
    if (parsed.event !== "runtime.state-change") {
      throw new Error("unexpected event name");
    }
    expect(parsed.payload.planId).toBe("plan-1");
  });

  it("parses logs.appended envelope", () => {
    const parsed = EventEnvelopeSchema.parse({
      event: "logs.appended",
      payload: {
        category: "app",
        level: "info",
        message: "ping"
      },
      timestamp: new Date().toISOString(),
      topics: ["logs"]
    });
    expect(parsed.event).toBe("logs.appended");
    if (parsed.event !== "logs.appended") {
      throw new Error("unexpected event name");
    }
    expect(parsed.payload.message).toBe("ping");
  });

  it("exposes event name enumeration and schema version", () => {
    expect(EventNameSchema.options.length).toBeGreaterThan(0);
    expect(typeof EventSchemaVersion).toBe("string");
  });
});
