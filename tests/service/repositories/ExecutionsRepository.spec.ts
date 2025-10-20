import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  ExecutionsRepository,
  type ExecutionStatus
} from "../../../src/service/orchestrator/repositories/ExecutionsRepository.js";
import type { ExecutionRecord } from "../../../src/ui/types/orchestrator.js";

describe("ExecutionsRepository", () => {
  let testDir: string;
  let repository: ExecutionsRepository;

  beforeEach(async () => {
    testDir = join(
      process.cwd(),
      ".test-executions-repo",
      `test-${Date.now()}`
    );
    await mkdir(testDir, { recursive: true });
    repository = new ExecutionsRepository({ directory: testDir });
    await repository.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // 基础 CRUD 测试
  describe("基础 CRUD", () => {
    it("创建执行记录", async () => {
      const record: ExecutionRecord = {
        id: "exec-1",
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp",
        status: "pending",
        bridgeStates: [],
        pendingApprovals: []
      };

      const created = await repository.create(record);
      expect(created).toEqual(record);

      const read = await repository.read("exec-1");
      expect(read).toEqual(record);
    });

    it("读取不存在的记录返回 null", async () => {
      const result = await repository.read("non-existent");
      expect(result).toBeNull();
    });

    it("更新执行记录", async () => {
      const record: ExecutionRecord = {
        id: "exec-1",
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp",
        status: "pending",
        bridgeStates: [],
        pendingApprovals: []
      };

      await repository.create(record);

      const updated: ExecutionRecord = {
        ...record,
        status: "running",
        startedAt: new Date().toISOString()
      };

      await repository.update("exec-1", updated);

      const read = await repository.read("exec-1");
      expect(read?.status).toBe("running");
      expect(read?.startedAt).toBeDefined();
    });

    it("删除执行记录", async () => {
      const record: ExecutionRecord = {
        id: "exec-1",
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp",
        status: "success",
        bridgeStates: [],
        pendingApprovals: []
      };

      await repository.create(record);
      await repository.delete("exec-1");

      const read = await repository.read("exec-1");
      expect(read).toBeNull();
    });

    it("列出所有执行记录", async () => {
      const records: ExecutionRecord[] = [
        {
          id: "exec-1",
          planId: "plan-1",
          createdAt: new Date().toISOString(),
          executorType: "mcp",
          status: "success",
          bridgeStates: [],
          pendingApprovals: []
        },
        {
          id: "exec-2",
          planId: "plan-2",
          createdAt: new Date().toISOString(),
          executorType: "mock",
          status: "failed",
          bridgeStates: [],
          pendingApprovals: []
        }
      ];

      for (const record of records) {
        await repository.create(record);
      }

      const list = await repository.list();
      expect(list).toHaveLength(2);
    });
  });

  // 状态查询测试
  describe("状态查询", () => {
    beforeEach(async () => {
      const statuses: ExecutionStatus[] = [
        "pending",
        "running",
        "success",
        "failed",
        "cancelled"
      ];

      for (let i = 0; i < statuses.length; i++) {
        await repository.create({
          id: `exec-${i}`,
          planId: `plan-${i}`,
          createdAt: new Date().toISOString(),
          executorType: "mcp",
          status: statuses[i]!,
          bridgeStates: [],
          pendingApprovals: []
        });
      }
    });

    it("按状态查找执行记录", async () => {
      const running = await repository.findByStatus("running");
      const success = await repository.findByStatus("success");
      const failed = await repository.findByStatus("failed");

      expect(running).toHaveLength(1);
      expect(success).toHaveLength(1);
      expect(failed).toHaveLength(1);

      expect(running[0]?.status).toBe("running");
      expect(success[0]?.status).toBe("success");
      expect(failed[0]?.status).toBe("failed");
    });

    it("查找正在运行的执行记录", async () => {
      const running = await repository.findRunning();

      expect(running).toHaveLength(1);
      expect(running[0]?.status).toBe("running");
    });

    it("按状态统计执行记录数量", async () => {
      const pendingCount = await repository.countByStatus("pending");
      const runningCount = await repository.countByStatus("running");
      const successCount = await repository.countByStatus("success");

      expect(pendingCount).toBe(1);
      expect(runningCount).toBe(1);
      expect(successCount).toBe(1);
    });
  });

  // planId 查询测试
  describe("planId 查询", () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create({
          id: `exec-${i}`,
          planId: i < 3 ? "plan-A" : "plan-B",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          executorType: "mcp",
          status: "success",
          bridgeStates: [],
          pendingApprovals: []
        });
      }
    });

    it("按 planId 查找执行记录", async () => {
      const planA = await repository.findByPlanId("plan-A");
      const planB = await repository.findByPlanId("plan-B");

      expect(planA).toHaveLength(3);
      expect(planB).toHaveLength(2);
    });

    it("查找指定 planId 的最新执行记录", async () => {
      const latest = await repository.findLatestByPlanId("plan-A");

      expect(latest).toBeDefined();
      expect(latest?.planId).toBe("plan-A");
      expect(latest?.id).toBe("exec-0"); // 最新创建的
    });

    it("查找不存在的 planId 返回 null", async () => {
      const latest = await repository.findLatestByPlanId("non-existent");
      expect(latest).toBeNull();
    });
  });

  // 时间范围查询测试
  describe("时间范围查询", () => {
    it("按时间范围查找执行记录", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      await repository.create({
        id: "exec-old",
        planId: "plan-1",
        createdAt: twoHoursAgo.toISOString(),
        executorType: "mcp",
        status: "success",
        bridgeStates: [],
        pendingApprovals: []
      });

      await repository.create({
        id: "exec-recent",
        planId: "plan-1",
        createdAt: oneHourAgo.toISOString(),
        executorType: "mcp",
        status: "success",
        bridgeStates: [],
        pendingApprovals: []
      });

      const results = await repository.findByTimeRange(
        oneHourAgo.toISOString(),
        now.toISOString()
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("exec-recent");
    });

    it("查找最近的执行记录", async () => {
      for (let i = 0; i < 15; i++) {
        await repository.create({
          id: `exec-${i}`,
          planId: "plan-1",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          executorType: "mcp",
          status: "success",
          bridgeStates: [],
          pendingApprovals: []
        });
      }

      const recent = await repository.findRecent(10);

      expect(recent).toHaveLength(10);
      // 应该按时间倒序排列
      expect(recent[0]?.id).toBe("exec-0");
      expect(recent[9]?.id).toBe("exec-9");
    });
  });

  // 分页查询测试
  describe("分页查询", () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) {
        await repository.create({
          id: `exec-${i}`,
          planId: i < 15 ? "plan-A" : "plan-B",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          executorType: "mcp",
          status: i % 2 === 0 ? "success" : "failed",
          bridgeStates: [],
          pendingApprovals: []
        });
      }
    });

    it("分页查询第一页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 0 });

      expect(result.total).toBe(25);
      expect(result.executions).toHaveLength(10);
    });

    it("分页查询中间页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 10 });

      expect(result.total).toBe(25);
      expect(result.executions).toHaveLength(10);
    });

    it("分页查询最后一页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 20 });

      expect(result.total).toBe(25);
      expect(result.executions).toHaveLength(5);
    });

    it("按状态过滤的分页查询", async () => {
      const result = await repository.paginate({
        limit: 10,
        offset: 0,
        status: "success"
      });

      expect(result.total).toBe(13); // 偶数索引
      expect(result.executions).toHaveLength(10);
      expect(result.executions.every((e) => e.status === "success")).toBe(true);
    });

    it("按 planId 过滤的分页查询", async () => {
      const result = await repository.paginate({
        limit: 10,
        offset: 0,
        planId: "plan-A"
      });

      expect(result.total).toBe(15);
      expect(result.executions).toHaveLength(10);
      expect(result.executions.every((e) => e.planId === "plan-A")).toBe(true);
    });

    it("按创建时间升序排序", async () => {
      const result = await repository.paginate({
        limit: 5,
        offset: 0,
        sortBy: "createdAt",
        sortOrder: "asc"
      });

      expect(result.executions[0]?.id).toBe("exec-24"); // 最早创建
      expect(result.executions[4]?.id).toBe("exec-20");
    });

    it("超出范围的分页返回空数组", async () => {
      const result = await repository.paginate({ limit: 10, offset: 100 });

      expect(result.total).toBe(25);
      expect(result.executions).toHaveLength(0);
    });
  });

  // 清理操作测试
  describe("清理操作", () => {
    it("清理旧的执行记录", async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 35 * 24 * 3600000); // 35天前

      // 创建旧的已完成记录
      await repository.create({
        id: "exec-old-success",
        planId: "plan-1",
        createdAt: oldDate.toISOString(),
        executorType: "mcp",
        status: "success",
        bridgeStates: [],
        pendingApprovals: []
      });

      // 创建旧的失败记录
      await repository.create({
        id: "exec-old-failed",
        planId: "plan-1",
        createdAt: oldDate.toISOString(),
        executorType: "mcp",
        status: "failed",
        bridgeStates: [],
        pendingApprovals: []
      });

      // 创建旧的运行中记录（不应被清理）
      await repository.create({
        id: "exec-old-running",
        planId: "plan-1",
        createdAt: oldDate.toISOString(),
        executorType: "mcp",
        status: "running",
        bridgeStates: [],
        pendingApprovals: []
      });

      // 创建新记录
      await repository.create({
        id: "exec-recent",
        planId: "plan-1",
        createdAt: now.toISOString(),
        executorType: "mcp",
        status: "success",
        bridgeStates: [],
        pendingApprovals: []
      });

      const deleted = await repository.cleanupOld(30);

      expect(deleted).toBe(2); // 只删除已完成的旧记录

      const remaining = await repository.list();
      expect(remaining).toHaveLength(2);
      expect(remaining.find((e) => e.id === "exec-old-running")).toBeDefined();
      expect(remaining.find((e) => e.id === "exec-recent")).toBeDefined();
    });
  });

  // 统计功能测试
  describe("统计功能", () => {
    it("获取执行统计信息", async () => {
      const now = new Date();

      await repository.create({
        id: "exec-1",
        planId: "plan-1",
        createdAt: now.toISOString(),
        executorType: "mcp",
        status: "success",
        startedAt: now.toISOString(),
        finishedAt: new Date(now.getTime() + 5000).toISOString(),
        bridgeStates: [],
        pendingApprovals: []
      });

      await repository.create({
        id: "exec-2",
        planId: "plan-1",
        createdAt: now.toISOString(),
        executorType: "mcp",
        status: "failed",
        startedAt: now.toISOString(),
        finishedAt: new Date(now.getTime() + 3000).toISOString(),
        bridgeStates: [],
        pendingApprovals: []
      });

      await repository.create({
        id: "exec-3",
        planId: "plan-1",
        createdAt: now.toISOString(),
        executorType: "mcp",
        status: "running",
        bridgeStates: [],
        pendingApprovals: []
      });

      const stats = await repository.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byStatus.success).toBe(1);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.running).toBe(1);
      expect(stats.avgDurationMs).toBe(4000); // (5000 + 3000) / 2
    });

    it("统计执行记录总数", async () => {
      for (let i = 0; i < 10; i++) {
        await repository.create({
          id: `exec-${i}`,
          planId: "plan-1",
          createdAt: new Date().toISOString(),
          executorType: "mcp",
          status: "success",
          bridgeStates: [],
          pendingApprovals: []
        });
      }

      const count = await repository.count();
      expect(count).toBe(10);
    });
  });

  // 性能测试
  describe("性能", () => {
    it("paginate 在 1000 条记录下应 <300ms", async () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        id: `perf-exec-${i}`,
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp" as const,
        status: "success" as const,
        bridgeStates: [],
        pendingApprovals: []
      }));

      // 并发创建以加速数据准备
      await Promise.all(records.map((r) => repository.create(r)));

      // 只测试paginate本身的性能
      const start = Date.now();
      await repository.paginate({ limit: 50, offset: 0 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(300);
    }, 30000); // 30秒超时

    it("并发创建 10 个执行记录无数据丢失", async () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp" as const,
        status: "pending" as const,
        bridgeStates: [],
        pendingApprovals: []
      }));

      await Promise.all(records.map((r) => repository.create(r)));

      const list = await repository.list();
      expect(list).toHaveLength(10);
    }, 10000);
  });

  // 边界条件测试
  describe("边界条件", () => {
    it("创建包含完整字段的执行记录", async () => {
      const record: ExecutionRecord = {
        id: "exec-full",
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp",
        status: "success",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        bridgeStates: ["connecting", "connected"],
        result: { output: "success" },
        pendingApprovals: [
          {
            id: "approval-1",
            planId: "plan-1",
            nodeId: "node-1",
            nodeType: "human_approval",
            riskLevel: "high",
            requiresApproval: true,
            requestedAt: new Date().toISOString(),
            requestedBy: "system"
          }
        ],
        executionStatus: "success",
        running: false,
        currentNodeId: "node-1",
        lastCompletedNodeId: "node-0",
        bridgeState: "connected",
        bridgeMeta: { reason: "test-session" }
      };

      await repository.create(record);
      const read = await repository.read("exec-full");

      expect(read).toEqual(record);
    });

    it("创建包含错误信息的执行记录", async () => {
      const record: ExecutionRecord = {
        id: "exec-error",
        planId: "plan-1",
        createdAt: new Date().toISOString(),
        executorType: "mcp",
        status: "failed",
        error: { message: "Execution failed" },
        bridgeStates: [],
        pendingApprovals: []
      };

      await repository.create(record);
      const read = await repository.read("exec-error");

      expect(read?.error).toEqual({ message: "Execution failed" });
    });
  });
});
