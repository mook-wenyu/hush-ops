import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileBridgeSessionRegistry } from "../../../src/mcp/bridge/sessionRegistry.js";
import { ToolStreamStore } from "../../../src/shared/persistence/toolStreamStore.js";
import {
  getHushOpsStateDirectory,
  joinStatePath,
  resetHushOpsPathCache
} from "../../../src/shared/environment/pathResolver.js";

function isoNow(): string {
  return new Date().toISOString();
}

describe("外部配置与状态 JSON 迁移", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "hush-ops-state-"));
    vi.stubEnv("HUSH_OPS_HOME", tempRoot);
    resetHushOpsPathCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    resetHushOpsPathCache();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("ToolStreamStore 在损坏文件时回退为空文档", async () => {
    const stateDir = path.join(tempRoot, "state");
    await mkdir(stateDir, { recursive: true });
    const storePath = path.join(stateDir, "tool-streams.json");
    await writeFile(storePath, "{ invalid json", "utf-8");

    const store = new ToolStreamStore({ directory: stateDir });
    store.appendChunk({
      correlationId: "corr-1",
      toolName: "demo.tool",
      executionId: "exec-bad",
      planId: "plan-demo",
      nodeId: "node-1",
      status: "error",
      message: "损坏文件恢复测试",
      timestamp: isoNow()
    });
    store.close();

    const reopened = new ToolStreamStore({ directory: stateDir });
    expect(reopened.listSummariesByExecution("exec-bad")).toHaveLength(1);
    reopened.close();
  });

  it("FileBridgeSessionRegistry 兼容旧记录结构并允许重新写入", async () => {
    const stateDir = path.join(tempRoot, "state");
    await mkdir(stateDir, { recursive: true });
    const registryPath = path.join(stateDir, "mcp-sessions.json");
    await writeFile(
      registryPath,
      JSON.stringify({ version: 1, records: { legacy: { sessionId: "s-1" } } }),
      "utf-8"
    );

    const registry = new FileBridgeSessionRegistry({ directory: stateDir });
    expect(registry.load("server-x", "legacy")).toBeNull();

    registry.save({
      serverName: "server-x",
      userId: "legacy",
      sessionId: "sess-2",
      updatedAt: isoNow()
    });

    const updated = registry.load("server-x", "legacy");
    expect(updated?.sessionId).toBe("sess-2");

    const raw = await readFile(registryPath, "utf-8");
    expect(() => JSON.parse(raw.trim())).not.toThrow();

    registry.clear("server-x", "legacy");
    expect(registry.load("server-x", "legacy")).toBeNull();
    registry.close();
  });

  it("在缺失 state 文件时自动创建持久化目录", async () => {
    const stateDir = path.join(tempRoot, "state");
    await mkdir(stateDir, { recursive: true });

    const registry = new FileBridgeSessionRegistry({ directory: stateDir });
    registry.close();

    const store = new ToolStreamStore({ directory: stateDir });
    store.close();

    await expect(readFile(path.join(stateDir, "mcp-sessions.json"), "utf-8")).resolves.toBeDefined();
    await expect(readFile(path.join(stateDir, "tool-streams.json"), "utf-8")).resolves.toBeDefined();

    const files = await readdir(stateDir);
    expect(files).toContain("mcp-sessions.json");
    expect(files).toContain("tool-streams.json");
  });
});
