import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalTaskAdapter } from "../../../src/orchestrator/adapters/localTask.js";
import type { PlanNode } from "../../../src/shared/schemas/plan.js";
import type { Plan } from "../../../src/shared/schemas/plan.js";
import { JsonSharedStateStore } from "../../../src/orchestrator/state/sharedState.js";
import { MemoryCheckpointStore } from "../../../src/orchestrator/state/checkpoint.js";
import type { ExecutionContext } from "../../../src/orchestrator/executor/types.js";

vi.mock("got", () => {
  return {
    default: vi.fn(async () => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true })
    }))
  };
});

vi.mock("execa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("execa")>();
  return {
    execa: vi.fn(actual.execa)
  };
});

const gotMock = (await import("got")).default as unknown as ReturnType<typeof vi.fn>;
const execaMock = (await import("execa")).execa as unknown as ReturnType<typeof vi.fn>;

function createExecutionContext(): ExecutionContext {
  const plan: Plan = {
    id: "plan-test",
    version: "v1",
    entry: "local-task",
    nodes: []
  };
  const planContext = {
    plan,
    nodeMap: new Map<string, PlanNode>(),
    adjacency: new Map<string, string[]>()
  };

  return {
    planContext,
    adapters: new Map(),
    checkpointStore: new MemoryCheckpointStore(),
    sharedState: new JsonSharedStateStore(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } as ExecutionContext;
}

function createLocalTaskNode(overrides: Partial<Extract<PlanNode, { type: "local_task" }>>): Extract<PlanNode, { type: "local_task" }> {
  return {
    id: overrides.id ?? `local-${Math.random().toString(16).slice(2)}`,
    type: "local_task",
    driver: "shell",
    riskLevel: "low",
    requiresApproval: false,
    ...overrides
  } as Extract<PlanNode, { type: "local_task" }>;
}

describe("createLocalTaskAdapter", () => {
  const adapter = createLocalTaskAdapter();
  const tmpDir = mkdtempSync(join(tmpdir(), "local-task-test-"));

  it("executes shell command via execa", async () => {
    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "shell-task",
      driver: "shell",
      command: process.execPath,
      args: ["-e", "process.stdout.write('hello')"],
      cwd: tmpDir
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("success");
    const stored = ctx.sharedState.get(`${node.id}.output`) as Record<string, unknown>;
    expect(stored).toMatchObject({ stdout: "hello" });
  });

  it("performs http request via got", async () => {
    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "http-task",
      driver: "http",
      request: {
        method: "GET",
        url: "https://example.com/api",
        timeoutMs: 1000
      }
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("success");
    expect(gotMock).toHaveBeenCalled();
    const stored = ctx.sharedState.get(`${node.id}.output`) as Record<string, unknown>;
    expect(stored.response).toMatchObject({ statusCode: 200, body: { ok: true } });
  });

  it("reads file content when driver=file", async () => {
    const filePath = join(tmpDir, "sample.txt");
    writeFileSync(filePath, "sample-content", "utf-8");
    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "file-task",
      driver: "file",
      args: [filePath],
      metadata: { action: "read" }
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("success");
    const stored = ctx.sharedState.get(`${node.id}.output`) as Record<string, unknown>;
    expect(stored).toMatchObject({ path: filePath, content: "sample-content" });
  });

  it("validates cron expression when driver=scheduled", async () => {
    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "scheduled-task",
      driver: "scheduled",
      schedule: { cron: "*/5 * * * *" }
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("success");
    const stored = ctx.sharedState.get(`${node.id}.output`) as Record<string, unknown>;
    expect(stored.nextRun).toBeTruthy();
  });

  it("returns failure when command missing", async () => {
    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "invalid-shell",
      driver: "shell",
      command: undefined
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("failed");
  });

  it("retries shell tasks according to retryPolicy and succeeds", async () => {
    execaMock.mockClear();
    vi.useFakeTimers();
    const failure = Object.assign(new Error("process failed"), { exitCode: 1 });
    const success = {
      exitCode: 0,
      stdout: "retry-ok",
      stderr: "",
      command: process.execPath
    };
    execaMock.mockRejectedValueOnce(failure);
    execaMock.mockResolvedValueOnce(success as never);

    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "retry-shell",
      driver: "shell",
      command: process.execPath,
      args: ["-e", "process.stdout.write('retry-ok')"],
      retryPolicy: { maxAttempts: 2, backoffSeconds: 1 }
    });

    const executePromise = adapter.execute(node, ctx);
    await vi.runOnlyPendingTimersAsync();
    const result = await executePromise;

    expect(result.status).toBe("success");
    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      "local_task 即将重试",
      expect.objectContaining({
        nodeId: "retry-shell",
        nextAttempt: 2,
        maxAttempts: 2,
        backoffSeconds: 1
      })
    );
    expect(ctx.sharedState.get("retry-shell.error")).toBeNull();
    const stored = ctx.sharedState.get("retry-shell.output") as Record<string, unknown>;
    expect(stored).toMatchObject({ stdout: "retry-ok" });

    execaMock.mockClear();
    vi.useRealTimers();
  });

  it("records failure metadata after exhausting retries", async () => {
    execaMock.mockClear();
    vi.useFakeTimers();
    const failure = Object.assign(new Error("hard failure"), { exitCode: 2 });
    execaMock.mockRejectedValue(failure);

    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "retry-shell-fail",
      driver: "shell",
      command: process.execPath,
      args: ["-e", "process.exit(2)"],
      retryPolicy: { maxAttempts: 2, backoffSeconds: 1 }
    });

    const executePromise = adapter.execute(node, ctx);
    await vi.runOnlyPendingTimersAsync();
    const result = await executePromise;

    expect(result.status).toBe("failed");
    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(ctx.logger.error).toHaveBeenCalledTimes(2);
    const failureState = ctx.sharedState.get("retry-shell-fail.error") as Record<string, unknown>;
    expect(failureState).toMatchObject({
      classification: "shell_exit_code",
      attempt: 2,
      maxAttempts: 2
    });
    expect(failureState.details).toEqual({ exitCode: 2 });

    const actualExeca = await vi.importActual<typeof import("execa")>("execa");
    execaMock.mockReset();
    execaMock.mockImplementation(actualExeca.execa);
    vi.useRealTimers();
  });

  it("classifies http timeout failures", async () => {
    gotMock.mockReset();
    gotMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));

    const ctx = createExecutionContext();
    const node = createLocalTaskNode({
      id: "http-timeout",
      driver: "http",
      request: {
        method: "GET",
        url: "https://timeout.test",
        timeoutMs: 1000
      },
      retryPolicy: { maxAttempts: 1, backoffSeconds: 1 }
    });

    const result = await adapter.execute(node, ctx);
    expect(result.status).toBe("failed");
    const failureState = ctx.sharedState.get("http-timeout.error") as Record<string, unknown>;
    expect(failureState).toMatchObject({
      classification: "http_timeout",
      attempt: 1,
      maxAttempts: 1
    });
    expect(ctx.logger.error).toHaveBeenCalledWith(
      "local_task 执行失败",
      expect.any(Error),
      expect.objectContaining({ classification: "http_timeout" })
    );
  });
});
