import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import { execa } from "execa";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { createOrchestratorService } from "../../src/service/orchestrator/server.js";
import { OrchestratorClient } from "../../src/client/orchestrator.js";

const CLI_ENTRY = resolve("src/cli/index.ts");
const NODE = process.execPath;

const LONG_RUNNING_PLAN = {
  id: "cli-stop-plan",
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

describe("executions stop CLI", () => {
  let baseUrl: string;
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { app } = await createOrchestratorService({
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  test("stops running execution", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const { executionId } = await client.executePlan({ plan: LONG_RUNNING_PLAN });

    await vi.waitUntil(async () => {
      const record = await client.getExecution(executionId);
      return record.status === "running";
    }, { timeout: 5000, interval: 100 });

    const { stdout } = await execa(NODE, ["--import", "tsx", CLI_ENTRY, "executions:stop", executionId, "--base-url", baseUrl]);
    expect(stdout).toContain(`执行 ${executionId} 已标记为 cancelled`);

    await vi.waitUntil(async () => {
      const record = await client.getExecution(executionId);
      return record.status === "cancelled";
    }, { timeout: 5000, interval: 200 });
  });
});