import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ApprovalStore } from "../../src/shared/approvals/store.js";
import type { PendingApprovalEntry } from "../../src/shared/approvals/types.js";

const CLI_ENTRY = resolve("src/cli/index.ts");
const NODE = process.execPath;

async function createTempStoreDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hush-ops-approvals-"));
}

async function runCli(args: string[]) {
  return execa(NODE, ["--import", "tsx", CLI_ENTRY, ...args]);
}

describe("approvals CLI", () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await createTempStoreDir();
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  test("pending prints empty message when no entries", async () => {
    const { stdout } = await runCli(["approvals:pending", "--database", storageDir]);
    expect(stdout).toContain("暂无待审批项");
  });

  test("pending lists stored entries", async () => {
    const store = new ApprovalStore({ directory: storageDir });
    const entry: PendingApprovalEntry = {
      id: `APP-${randomUUID()}`,
      planId: "plan-list",
      planVersion: "v1",
      nodeId: "node-list",
      nodeType: "agent_invocation",
      riskLevel: "medium",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "test-suite",
      payload: { metadata: {} }
    };
    await store.appendPending(entry);
    store.close();

    const { stdout } = await runCli(["approvals:pending", "--database", storageDir]);
    expect(stdout).toContain(entry.id);
    expect(stdout).toContain("plan=plan-list");
  });

  test("approve command removes pending entry and records decision", async () => {
    const store = new ApprovalStore({ directory: storageDir });
    const entry: PendingApprovalEntry = {
      id: `APP-${randomUUID()}`,
      planId: "plan-demo",
      planVersion: "v1",
      nodeId: "node-approve",
      nodeType: "mcp_tool",
      riskLevel: "high",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "test-suite",
      payload: { metadata: { scope: "test" } }
    };
    await store.appendPending(entry);
    store.close();

    const { stdout } = await runCli([
      "approvals:approve",
      entry.id,
      "--database",
      storageDir,
      "--comment",
      "自动测试"
    ]);
    expect(stdout).toContain(`已记录审批结果：${entry.id} -> approved`);

    const verifyStore = new ApprovalStore({ directory: storageDir });
    const pending = await verifyStore.findPending(entry.id);
    const completed = await verifyStore.findDecision(entry.id);
    expect(pending).toBeUndefined();
    expect(completed?.status).toBe("approved");
    expect(completed?.comment).toBe("自动测试");
    verifyStore.close();
  });
});
