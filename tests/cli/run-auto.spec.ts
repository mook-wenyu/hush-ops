import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { createOrchestratorService } from "../../src/service/orchestrator/server.js";

const CLI_ENTRY = resolve("src/cli/index.ts");
const NODE = process.execPath;

async function runCli(args: string[], env?: Record<string, string>) {
  return execa(NODE, ["--import", "tsx", CLI_ENTRY, ...args], { env });
}

describe("run auto CLI", () => {
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
    tempDir = await mkdtemp(join(tmpdir(), "hush-ops-run-auto-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") {
        throw error;
      }
    }
  });

  test(
    "run:auto local with mock bridge",
    async () => {
      const dbPath = join(tempDir, "auto.db");
      const planPath = join(tempDir, "auto-plan.json");
      const plan = {
        id: "auto-plan",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence", children: ["agent"] },
          {
            id: "agent",
            type: "agent_invocation",
            agentName: "demo-agent",
            input: { task: "say hello" }
          }
        ]
      };
      await writeFile(planPath, JSON.stringify(plan), "utf-8");

      const { stdout } = await runCli([
        "run:auto",
        "--plan",
        planPath,
        "--database",
        dbPath,
        "--mock-mcp",
        "--local"
      ]);
      expect(stdout).toContain("执行完成");
    },
    20000
  );

  test(
    "run:auto via Orchestrator Service",
    async () => {
      const planPath = join(tempDir, "remote-plan.json");
      const plan = {
        id: "remote-plan",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence", children: ["task"] },
          {
            id: "task",
            type: "local_task",
            driver: "shell",
            command: "node",
            args: ["-e", "process.stdout.write('remote')"]
          }
        ]
      };
      await writeFile(planPath, JSON.stringify(plan), "utf-8");

      const { stdout } = await runCli([
        "run:auto",
        "--plan",
        planPath,
        "--remote",
        "--base-url",
        baseUrl,
        "--wait",
        "--mock-mcp"
      ]);
      expect(stdout).toContain("已提交执行");
      expect(stdout).toMatch(/当前状态：/);
    },
    30000
  );

});
