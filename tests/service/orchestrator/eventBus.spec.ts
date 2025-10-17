import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_BUS_MAX_BUFFER_BYTES,
  buildEventMessage,
  createOrchestratorService
} from "../../../src/service/orchestrator/server.js";
import { setLogEventPublisher } from "../../../src/shared/logging/logger.js";
import type { LogsAppendedPayload } from "../../../src/shared/logging/events.js";

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
      const parsed = JSON.parse(result.message);
      expect(parsed.event).toBe("runtime.state-change");
      expect(parsed.topics).toContain("runtime");
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

describe("event bus integration", () => {
  const capturedLogs: LogsAppendedPayload[] = [];

  beforeEach(() => {
    capturedLogs.length = 0;
    setLogEventPublisher((payload) => {
      capturedLogs.push(payload);
    });
  });

  afterEach(() => {
    setLogEventPublisher(null);
    capturedLogs.length = 0;
  });

  it("drops非法 runtime.state-change 事件并写入日志", async () => {
    const { app, controller } = await createOrchestratorService();
    setLogEventPublisher((payload) => {
      capturedLogs.push(payload);
    });
    const clients: Set<{
      socket: { readyState: number; OPEN: number; bufferedAmount: number; send: (payload: unknown) => void };
      topics: Set<string>;
    }> = (app as unknown as { __eventBusClients: Set<any> }).__eventBusClients;

    const sendSpy = vi.fn();
    clients.add({
      socket: { readyState: 1, OPEN: 1, bufferedAmount: 0, send: sendSpy },
      topics: new Set(["runtime"])
    });

    controller.emit("runtime.state-change", {
      executionId: "exec-invalid",
      payload: { invalid: true }
    });

    expect(sendSpy).not.toHaveBeenCalled();
    const errorEntry = capturedLogs.find((entry) => entry.message === "事件 payload 校验失败");
    expect(errorEntry).toBeDefined();
    const errorContext = (errorEntry?.context?.error ?? errorEntry?.context) as Record<string, unknown> | undefined;
    expect(errorContext?.executionId).toBe("exec-invalid");

    clients.clear();
    await app.close();
  });

  it("在背压恢复后重新投递事件并记录阈值日志", async () => {
    const { app, controller } = await createOrchestratorService();
    setLogEventPublisher((payload) => {
      capturedLogs.push(payload);
    });
    const clients: Set<{
      socket: { readyState: number; OPEN: number; bufferedAmount: number; send: (payload: unknown) => void };
      topics: Set<string>;
    }> = (app as unknown as { __eventBusClients: Set<any> }).__eventBusClients;

    const sendSpy = vi.fn();
    const socket = {
      readyState: 1,
      OPEN: 1,
      bufferedAmount: EVENT_BUS_MAX_BUFFER_BYTES + 1024,
      send: sendSpy
    };
    clients.add({ socket, topics: new Set(["runtime"]) });

    const payload = {
      bridgeState: "connected",
      planId: "plan-123",
      executionStatus: "idle",
      running: false,
      pendingApprovals: []
    };

    controller.emit("runtime.state-change", { executionId: "exec-bp", payload });

    expect(sendSpy).not.toHaveBeenCalled();
    const dropEntry = capturedLogs.find((entry) => entry.message === "事件被丢弃：背压阈值超出");
    expect(dropEntry).toBeDefined();
    expect(dropEntry?.context?.executionId).toBe("exec-bp");
    expect(dropEntry?.context?.bufferedBytes).toBeGreaterThan(EVENT_BUS_MAX_BUFFER_BYTES);

    socket.bufferedAmount = 0;
    controller.emit("runtime.state-change", { executionId: "exec-bp", payload });

    expect(sendSpy).toHaveBeenCalled();

    clients.clear();
    await app.close();
  });
});
