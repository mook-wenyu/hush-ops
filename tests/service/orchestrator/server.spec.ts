import { AddressInfo } from "node:net";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOrchestratorService } from "../../../src/service/orchestrator/server.js";
import { OrchestratorClient } from "../../../src/client/orchestrator.js";
import type { OrchestratorController, ManualApprovalRequestInput } from "../../../src/service/orchestrator/controller.js";
import type { OrchestratorEventTopic, RuntimeToolStreamPayload } from "../../../src/service/orchestrator/types.js";
import type { PendingApprovalEntry } from "../../../src/shared/approvals/types.js";

const SAMPLE_PLAN = {
  id: "svc-sample-plan",
  version: "v1",
  entry: "root",
  nodes: [
    { id: "root", type: "sequence", children: ["task"] },
    {
      id: "task",
      type: "local_task",
      driver: "shell",
      command: "node",
      args: ["-e", "process.stdout.write('ok')"],
      riskLevel: "low"
    }
  ]
} as const;

const LONG_RUNNING_PLAN = {
  id: "svc-slow-plan",
  version: "v1",
  entry: "root",
  nodes: [
    { id: "root", type: "sequence", children: ["sleep"] },
    {
      id: "sleep",
      type: "local_task",
      driver: "shell",
      command: "node",
      args: ["-e", "setTimeout(() => process.exit(0), 5000)"],
      riskLevel: "low"
    }
  ]
} as const;

describe("orchestrator service", () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;
  let controller: OrchestratorController | null = null;

  beforeEach(async () => {
    const { app, controller: svcController } = await createOrchestratorService({
      controllerOptions: {
        defaultUseMockBridge: true
      }
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    controller = svcController;
    closeServer = async () => {
      await app.close();
    };
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
    controller = null;
  });

  it("validates plan via REST", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const result = await client.validatePlan(SAMPLE_PLAN);
    expect(result.planId).toBe("svc-sample-plan");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("executes plan and exposes status", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const executeResponse = await client.executePlan({ plan: SAMPLE_PLAN });
    expect(executeResponse.executionId).toMatch(/^exec-/);
    expect(executeResponse.status).toBe("running");

    await vi.waitUntil(async () => {
      const record = await client.getExecution(executeResponse.executionId);
      return record.status !== "running";
    }, { timeout: 15000, interval: 200 });

    const record = await client.getExecution(executeResponse.executionId);
    expect(record.status).toBe("success");
    expect(record.executionStatus).toBe("success");
    expect(record.result?.status).toBe("success");
    expect(record.result?.planId).toBe("svc-sample-plan");
  });

  it("stops running execution via REST", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const executeResponse = await client.executePlan({ plan: LONG_RUNNING_PLAN });
    await vi.waitUntil(async () => {
      const record = await client.getExecution(executeResponse.executionId);
      return record.status === "running";
    }, { timeout: 5000, interval: 100 });

    const stopped = await client.stopExecution(executeResponse.executionId);
    expect(stopped.status).toBe("cancelled");

    await vi.waitUntil(async () => {
      const record = await client.getExecution(executeResponse.executionId);
      return record.status === "cancelled";
    }, { timeout: 5000, interval: 200 });

    const finalRecord = await client.getExecution(executeResponse.executionId);
    expect(finalRecord.status).toBe("cancelled");
  });

  it("creates manual approval via REST", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const executeResponse = await client.executePlan({ plan: SAMPLE_PLAN });
    const requestBody = {
      executionId: executeResponse.executionId,
      planId: SAMPLE_PLAN.id,
      nodeId: "plugin-node",
      title: "插件命令审批",
      metadata: { source: "plugin" }
    } satisfies ManualApprovalRequestInput;

    const response = await fetch(`${baseUrl}/approvals/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { approval: PendingApprovalEntry };
    expect(body.approval.nodeId).toBe("plugin-node");
    expect(body.approval.planId).toBe(SAMPLE_PLAN.id);
  });

it("broadcasts WebSocket events", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const stream = client.connectEvents();
    const messages: string[] = [];
    const snapshots: unknown[] = [];
    const toolStreamEvents: RuntimeToolStreamPayload[] = [];

    let executionError: unknown = null;
    stream.emitter.on("service.connected", () => {
      messages.push("connected");
    });
    stream.emitter.on("runtime.snapshot", (payload) => {
      snapshots.push(payload);
    });
    stream.emitter.on("runtime.tool-stream", (payload: RuntimeToolStreamPayload) => {
      toolStreamEvents.push(payload);
    });
    stream.emitter.on("execution.failed", (error) => {
      executionError = error;
    });

    await vi.waitUntil(() => messages.includes("connected"), { timeout: 5000, interval: 50 });

    const syntheticToolEvent: RuntimeToolStreamPayload = {
      toolName: "mock.tool",
      message: "synthetic summary",
      timestamp: new Date().toISOString(),
      status: "start",
      correlationId: "corr-test"
    };
    controller!.emit("runtime.tool-stream", syntheticToolEvent);
    await vi.waitUntil(() => toolStreamEvents.length > 0, { timeout: 3000, interval: 50 });
    expect(toolStreamEvents[0]?.message).toBe("synthetic summary");
    expect(toolStreamEvents[0]?.correlationId).toBe("corr-test");

    const { executionId } = await client.executePlan({ plan: SAMPLE_PLAN });
    await vi.waitUntil(async () => {
      const record = await client.getExecution(executionId);
      return record.status !== "running";
    }, { timeout: 20000, interval: 200 });
    const finalRecord = await client.getExecution(executionId);
    expect(finalRecord.status).toBe("success");
    expect(executionError).toBeNull();

    await vi.waitUntil(
      () =>
        snapshots.some((snapshot) => {
          const typed = snapshot as { executionStatus?: string; running?: boolean };
          return typed.executionStatus === "success" && typed.running === false;
        }),
      { timeout: 5000, interval: 100 }
    );
    expect(messages).toContain("connected");
    const latestSnapshot = snapshots[snapshots.length - 1] as {
      executionStatus?: string;
      running?: boolean;
      bridgeState?: string;
    };
    expect(latestSnapshot?.executionStatus).toBe("success");
    expect(latestSnapshot?.running).toBe(false);
    stream.close();
  });

  it("提供流式输出历史接口并支持重放", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const executeResponse = await client.executePlan({ plan: SAMPLE_PLAN });
    const executionId = executeResponse.executionId;

    await vi.waitUntil(async () => {
      const record = await client.getExecution(executionId);
      return record.status !== "running";
    }, { timeout: 15000, interval: 200 });

    const store = (controller as unknown as { toolStreamStore: { appendChunk: (input: unknown) => unknown } }).toolStreamStore;
    const now = new Date().toISOString();
    store.appendChunk({
      correlationId: "corr-history",
      toolName: "mock.tool",
      message: "历史摘要",
      status: "start",
      executionId,
      planId: SAMPLE_PLAN.id,
      nodeId: "task",
      timestamp: now,
      source: "test"
    });

    const listResponse = await fetch(`${baseUrl}/executions/${executionId}/tool-streams`);
    expect(listResponse.ok).toBe(true);
    const listBody = (await listResponse.json()) as {
      streams: Array<{ correlationId: string; chunkCount: number }>;
    };
    const historyEntry = listBody.streams.find((stream) => stream.correlationId === "corr-history");
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.chunkCount ?? 0).toBeGreaterThanOrEqual(1);

    const detailResponse = await fetch(`${baseUrl}/executions/${executionId}/tool-streams/corr-history`);
    expect(detailResponse.ok).toBe(true);
    const detailBody = (await detailResponse.json()) as {
      chunks: RuntimeToolStreamPayload[];
    };
    expect(detailBody.chunks[0]?.message).toBe("历史摘要");
    const historySequence = detailBody.chunks[0]?.sequence;
    expect(typeof historySequence).toBe("number");

    const replayStream = client.connectEvents({ topics: ["runtime"] });
    const replayEvents: RuntimeToolStreamPayload[] = [];
    let replayConnected = false;
    replayStream.emitter.on("service.connected", () => {
      replayConnected = true;
    });
    replayStream.emitter.on("runtime.tool-stream", (payload: RuntimeToolStreamPayload) => {
      replayEvents.push(payload);
    });
    await vi.waitUntil(() => replayConnected, { timeout: 3000, interval: 50 });

    const replayResponse = await fetch(
      `${baseUrl}/executions/${executionId}/tool-streams/corr-history/replay`,
      { method: "POST" }
    );
    expect(replayResponse.ok).toBe(true);
    const replayBody = (await replayResponse.json()) as { replayed: number };
    expect(replayBody.replayed).toBe(1);

    await vi.waitUntil(() => replayEvents.length > 0, { timeout: 3000, interval: 50 });
    expect(replayEvents[0]?.replayed).toBe(true);
    expect(replayEvents[0]?.sequence).toBe(historySequence);

    replayStream.close();
  });

  it("returns aggregated status snapshots via REST", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const executeResponse = await client.executePlan({ plan: SAMPLE_PLAN });

    await vi.waitUntil(async () => {
      const summary = await client.getStatusSummary();
      return summary.snapshots.some((snapshot) => snapshot.executionId === executeResponse.executionId && snapshot.executionStatus === "success");
    }, { timeout: 15000, interval: 200 });

    const summary = await client.getStatusSummary();
    expect(summary.status).toBe("ok");
    expect(summary.executions).toBeGreaterThan(0);
    expect(summary.latestSnapshot?.executionStatus).toBe("success");
  });

  it("filters events by topic", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const runtimeStream = client.connectEvents({ topics: ["runtime"] });
    const approvalsStream = client.connectEvents({ topics: ["approvals"] });

    let runtimeConnected = false;
    let approvalsConnected = false;
    const runtimeEvents: unknown[] = [];
    const approvalsEvents: unknown[] = [];

    runtimeStream.emitter.on("service.connected", () => {
      runtimeConnected = true;
    });
    approvalsStream.emitter.on("service.connected", () => {
      approvalsConnected = true;
    });
    runtimeStream.emitter.on("runtime.execution-start", (payload) => {
      runtimeEvents.push(payload);
    });
    approvalsStream.emitter.on("runtime.execution-start", (payload) => {
      approvalsEvents.push(payload);
    });

    await vi.waitUntil(() => runtimeConnected && approvalsConnected, { timeout: 3000, interval: 50 });

    controller!.emit("runtime.execution-start", { executionId: "test-runtime", planId: "plan-1" });

    await vi.waitUntil(() => runtimeEvents.length > 0, { timeout: 3000, interval: 50 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(runtimeEvents).toHaveLength(1);
    expect(approvalsEvents).toHaveLength(0);

    runtimeStream.close();
    approvalsStream.close();
  });

  it("updates topics via subscribe messages", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const stream = client.connectEvents({ topics: ["approvals"] });

    let connected = false;
    const receivedEvents: { event: string; topics: OrchestratorEventTopic[] }[] = [];
    stream.emitter.on("service.connected", (payload: { topics: OrchestratorEventTopic[] }) => {
      connected = true;
      receivedEvents.push({ event: "service.connected", topics: payload.topics });
    });
    stream.emitter.on("service.topics-updated", (payload: { topics: OrchestratorEventTopic[] }) => {
      receivedEvents.push({ event: "service.topics-updated", topics: payload.topics });
    });
    const runtimePayloads: unknown[] = [];
    stream.emitter.on("runtime.execution-start", (payload) => {
      runtimePayloads.push(payload);
    });

    await vi.waitUntil(() => connected, { timeout: 3000, interval: 50 });

    controller!.emit("runtime.execution-start", { executionId: "test-1", planId: "plan-run" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(runtimePayloads).toHaveLength(0);

    stream.subscribe(["runtime"]);

    await vi.waitUntil(
      () => receivedEvents.some((entry) => entry.event === "service.topics-updated" && entry.topics.includes("runtime")),
      { timeout: 3000, interval: 50 }
    );

    controller!.emit("runtime.execution-start", { executionId: "test-2", planId: "plan-run" });
    await vi.waitUntil(() => runtimePayloads.length > 0, { timeout: 3000, interval: 50 });

    stream.close();
  });
}, 20000);
