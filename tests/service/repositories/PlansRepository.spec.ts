import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { PlansRepository, type PlanWithSchedule } from "../../../src/service/orchestrator/repositories/PlansRepository.js";

describe("PlansRepository", () => {
  let testDir: string;
  let repository: PlansRepository;

  beforeEach(async () => {
    testDir = join(
      process.cwd(),
      ".test-plans-repo",
      `test-${Date.now()}`
    );
    await mkdir(testDir, { recursive: true });
    repository = new PlansRepository({ directory: testDir });
    await repository.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // 基础 CRUD 测试
  describe("基础 CRUD", () => {
    it("创建计划", async () => {
      const plan: PlanWithSchedule = {
        id: "test-plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            driver: "shell" as const,
            command: "echo",
            args: ["test"],
            riskLevel: "low" as const,
            requiresApproval: false,
            effectScope: "filesystem"
          }
        ]
      };

      const created = await repository.create(plan);
      expect(created).toEqual(plan);

      const read = await repository.read("test-plan-1");
      expect(read).toEqual(plan);
    });

    it("读取不存在的计划返回 null", async () => {
      const result = await repository.read("non-existent");
      expect(result).toBeNull();
    });

    it("更新计划", async () => {
      const plan: PlanWithSchedule = {
        id: "test-plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      };

      await repository.create(plan);

      const updated = {
        ...plan,
        description: "Updated description",
        version: "v2"
      };

      await repository.update("test-plan-1", updated);

      const read = await repository.read("test-plan-1");
      expect(read?.description).toBe("Updated description");
      expect(read?.version).toBe("v2");
    });

    it("删除计划", async () => {
      const plan: PlanWithSchedule = {
        id: "test-plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      };

      await repository.create(plan);
      await repository.delete("test-plan-1");

      const read = await repository.read("test-plan-1");
      expect(read).toBeNull();
    });

    it("列出所有计划", async () => {
      const plans: PlanWithSchedule[] = [
        {
          id: "plan-1",
          version: "v1",
          entry: "root",
          nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
        },
        {
          id: "plan-2",
          version: "v1",
          entry: "root",
          nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
        }
      ];

      for (const plan of plans) {
        await repository.create(plan);
      }

      const list = await repository.list();
      expect(list).toHaveLength(2);
    });
  });

  // Schedule 相关测试
  describe("Schedule 查询", () => {
    beforeEach(async () => {
      // 创建带 schedule 的计划
      await repository.create({
        id: "scheduled-plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ],
        schedule: {
          enabled: true,
          kind: "cron",
          cron: "*/10 * * * *"
        }
      });

      await repository.create({
        id: "scheduled-plan-2",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ],
        schedule: {
          enabled: false,
          kind: "cron",
          cron: "0 * * * *"
        }
      });

      await repository.create({
        id: "no-schedule-plan",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });
    });

    it("查找所有启用调度的计划", async () => {
      const scheduled = await repository.findScheduledPlans();

      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]?.id).toBe("scheduled-plan-1");
    });

    it("按调度启用状态查找计划", async () => {
      const enabled = await repository.findByScheduleEnabled(true);
      const disabled = await repository.findByScheduleEnabled(false);

      expect(enabled).toHaveLength(1);
      expect(enabled[0]?.id).toBe("scheduled-plan-1");

      expect(disabled).toHaveLength(1);
      expect(disabled[0]?.id).toBe("scheduled-plan-2");
    });

    it("按 cron 表达式查找计划", async () => {
      const plans = await repository.findByCron("*/10 * * * *");

      expect(plans).toHaveLength(1);
      expect(plans[0]?.id).toBe("scheduled-plan-1");
    });

    it("检查计划是否有调度配置", async () => {
      const hasSchedule1 = await repository.hasSchedule("scheduled-plan-1");
      const hasSchedule2 = await repository.hasSchedule("scheduled-plan-2");
      const hasSchedule3 = await repository.hasSchedule("no-schedule-plan");

      expect(hasSchedule1).toBe(true);
      expect(hasSchedule2).toBe(false);
      expect(hasSchedule3).toBe(false);
    });

    it("统计启用调度的计划数量", async () => {
      const count = await repository.countScheduled();
      expect(count).toBe(1);
    });
  });

  // 导入导出测试
  describe("导入导出", () => {
    it("从 JSON 导入计划", async () => {
      const json = JSON.stringify({
        id: "imported-plan",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const imported = await repository.importFromJSON(json);

      expect(imported.id).toBe("imported-plan");

      const read = await repository.read("imported-plan");
      expect(read).toBeDefined();
    });

    it("导入已存在的计划时抛出错误", async () => {
      await repository.create({
        id: "existing",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const json = JSON.stringify({
        id: "existing",
        version: "v2",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      await expect(repository.importFromJSON(json)).rejects.toThrow(
        "already exists"
      );
    });

    it("使用 overwrite 选项覆盖已存在的计划", async () => {
      await repository.create({
        id: "existing",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const json = JSON.stringify({
        id: "existing",
        version: "v2",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const imported = await repository.importFromJSON(json, {
        overwrite: true
      });

      expect(imported.version).toBe("v2");
    });

    it("导入无效 JSON 时抛出错误", async () => {
      await expect(
        repository.importFromJSON("{ invalid json")
      ).rejects.toThrow("Invalid JSON");
    });

    it("导出计划为 JSON", async () => {
      const plan: PlanWithSchedule = {
        id: "export-test",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            driver: "shell" as const,
            command: "echo",
            args: ["test"],
            riskLevel: "low" as const,
            requiresApproval: false,
            effectScope: "filesystem"
          }
        ]
      };

      await repository.create(plan);

      const json = await repository.exportToJSON("export-test");
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(plan);
    });

    it("导出不存在的计划时抛出错误", async () => {
      await expect(
        repository.exportToJSON("non-existent")
      ).rejects.toThrow("not found");
    });

    it("批量导出所有计划", async () => {
      await repository.create({
        id: "plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });
      await repository.create({
        id: "plan-2",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const exported = await repository.exportAll();
      expect(exported).toHaveLength(2);
    });
  });

  // 查询功能测试
  describe("查询功能", () => {
    beforeEach(async () => {
      await repository.create({
        id: "plan-v1-alpha",
        version: "v1",
        description: "Alpha version plan",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });
      await repository.create({
        id: "plan-v2-beta",
        version: "v2",
        description: "Beta version plan",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });
      await repository.create({
        id: "plan-v1-gamma",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });
    });

    it("按版本查找计划", async () => {
      const v1Plans = await repository.findByVersion("v1");
      const v2Plans = await repository.findByVersion("v2");

      expect(v1Plans).toHaveLength(2);
      expect(v2Plans).toHaveLength(1);
    });

    it("搜索计划（按 id 匹配）", async () => {
      const results = await repository.search("alpha");

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("plan-v1-alpha");
    });

    it("搜索计划（按 description 匹配）", async () => {
      const results = await repository.search("beta");

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("plan-v2-beta");
    });

    it("搜索不区分大小写", async () => {
      const results = await repository.search("ALPHA");

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("plan-v1-alpha");
    });

    it("统计计划总数", async () => {
      const count = await repository.count();
      expect(count).toBe(3);
    });
  });

  // 分页测试
  describe("分页查询", () => {
    beforeEach(async () => {
      for (let i = 1; i <= 25; i++) {
        await repository.create({
          id: `plan-${i}`,
          version: "v1",
          entry: "root",
          nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
        });
      }
    });

    it("分页查询第一页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 0 });

      expect(result.total).toBe(25);
      expect(result.plans).toHaveLength(10);
    });

    it("分页查询中间页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 10 });

      expect(result.total).toBe(25);
      expect(result.plans).toHaveLength(10);
    });

    it("分页查询最后一页", async () => {
      const result = await repository.paginate({ limit: 10, offset: 20 });

      expect(result.total).toBe(25);
      expect(result.plans).toHaveLength(5);
    });

    it("超出范围的分页返回空数组", async () => {
      const result = await repository.paginate({ limit: 10, offset: 100 });

      expect(result.total).toBe(25);
      expect(result.plans).toHaveLength(0);
    });
  });

  // 性能测试
  describe("性能", () => {
    it("list() 操作在 100 个计划下应 <50ms", async () => {
      // 创建 100 个计划
      const plans = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-plan-${i}`,
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      }));

      for (const plan of plans) {
        await repository.create(plan);
      }

      // 测试 list() 性能
      const start = Date.now();
      await repository.list();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    }, 10000); // 10秒超时

    it("并发创建 50 个计划", async () => {
      const plans = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrent-${i}`,
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      }));

      await Promise.all(plans.map((p) => repository.create(p)));

      const list = await repository.list();
      expect(list).toHaveLength(50);
    }, 10000);
  });

  // 边界条件测试
  describe("边界条件", () => {
    it("创建包含 metadata 的计划", async () => {
      const plan: PlanWithSchedule = {
        id: "with-metadata",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ],
        metadata: {
          author: "test",
          tags: ["tag1", "tag2"],
          createdAt: new Date().toISOString()
        }
      };

      await repository.create(plan);
      const read = await repository.read("with-metadata");

      expect(read?.metadata).toEqual(plan.metadata);
    });

    it("创建包含复杂 schedule 配置的计划", async () => {
      const plan: PlanWithSchedule = {
        id: "complex-schedule",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ],
        schedule: {
          enabled: true,
          kind: "cron",
          cron: "0 0 * * *",
          concurrency: "forbid"
        }
      };

      await repository.create(plan);
      const read = await repository.read("complex-schedule");

      expect(read?.schedule).toEqual(plan.schedule);
    });

    it("空查询返回所有计划", async () => {
      await repository.create({
        id: "plan-1",
        version: "v1",
        entry: "root",
        nodes: [
          { id: "root", type: "sequence" as const, riskLevel: "low" as const, requiresApproval: false, children: ["task"] },
          {
            id: "task",
            type: "local_task" as const,
            riskLevel: "low" as const,
            requiresApproval: false,
            driver: "shell" as const,
            effectScope: "process" as const,
            command: "echo",
            args: ["test"]
          }
        ]
      });

      const results = await repository.search("");
      expect(results).toHaveLength(1);
    });
  });
});
