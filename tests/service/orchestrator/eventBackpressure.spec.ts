import { describe, expect, it, vi } from "vitest";

import {
  createOrchestratorService,
  EVENT_BUS_MAX_BUFFER_BYTES
} from "../../../src/service/orchestrator/server.js";

describe("event bus backpressure", () => {
  it("drops messages when bufferedAmount exceeds阈值", async () => {
    const service = await createOrchestratorService();
    const app = service.app;
    const controller = service.controller;
    const clients: Set<{
      socket: { readyState: number; bufferedAmount: number; send: (payload: unknown) => void };
      topics: Set<string>;
    }> = (app as any).__eventBusClients;

    const droppingSocket = {
      READY_STATE: 1,
      readyState: 1,
      OPEN: 1,
      bufferedAmount: EVENT_BUS_MAX_BUFFER_BYTES + 1024,
      send: vi.fn()
    };
    const deliveringSocket = {
      READY_STATE: 1,
      readyState: 1,
      OPEN: 1,
      bufferedAmount: 0,
      send: vi.fn()
    };

    clients.add({ socket: droppingSocket, topics: new Set(["runtime"]) });
    clients.add({ socket: deliveringSocket, topics: new Set(["runtime"]) });

    controller.emit("runtime.state-change", {
      executionId: "exec-1",
      payload: {
        bridgeState: "connected",
        planId: "plan-1",
        executionStatus: "idle",
        running: false,
        pendingApprovals: []
      }
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(droppingSocket.send).not.toHaveBeenCalled();
    expect(deliveringSocket.send).toHaveBeenCalledTimes(1);
    clients.clear();
    await app.close();
  });
});
