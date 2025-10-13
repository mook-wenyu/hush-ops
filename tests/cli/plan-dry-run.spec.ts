import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import WebSocket from "ws";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { createOrchestratorService } from "../../src/service/orchestrator/server.js";

const CLI_ENTRY = resolve("src/cli/index.ts");
const NODE = process.execPath;

async function runCli(args: string[], env?: Record<string, string>) {
  return execa(NODE, ["--import", "tsx", CLI_ENTRY, ...args], { env });
}

describe("plan dry-run CLI", () => {
  let tempDir: string;
  let baseUrl: string;
  let closeServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { app } = await createOrchestratorService({ controllerOptions: { defaultUseMockBridge: true } });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("无法获取服务端口");
    }
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeServer?.();
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hush-ops-plan-dry-run-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("dry-run default demo plan (local)", async () => {
    const { stdout } = await runCli(["plan:dry-run", "--plan", "plans/demo-mixed.json", "--local"]);
    expect(stdout).toContain("dry-run 完成");
    expect(stdout).toContain("Plan");
  }, 30000);

  test("dry-run custom plan file (local)", async () => {
    const planPath = join(tempDir, "simple-plan.json");
    const plan = {
      id: "simple-plan",
      version: "v1",
      entry: "n1",
      nodes: [
        { id: "n1", type: "sequence", children: ["n2"] },
        {
          id: "n2",
          type: "local_task",
          driver: "shell",
          command: "echo hello"
        }
      ]
    };
    await writeFile(planPath, JSON.stringify(plan), "utf-8");

    const { stdout } = await runCli(["plan:dry-run", "--plan", planPath, "--local"]);
    expect(stdout).toContain("simple-plan");
  }, 30000);

  test("dry-run via Orchestrator Service", async () => {
    const planPath = join(tempDir, "remote-plan.json");
    const plan = {
      id: "remote-plan",
      version: "v1",
      entry: "n1",
      nodes: [
        { id: "n1", type: "sequence", children: ["n2"] },
        {
          id: "n2",
          type: "local_task",
          driver: "shell",
          command: "echo remote"
        }
      ]
    };
    await writeFile(planPath, JSON.stringify(plan), "utf-8");

    const { stdout } = await runCli([
      "plan:dry-run",
      "--plan",
      planPath,
      "--remote",
      "--base-url",
      baseUrl
    ]);
    expect(stdout).toContain("remote-plan");
  }, 30000);

});
