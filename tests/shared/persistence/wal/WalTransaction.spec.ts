import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { WalTransactionManager } from "../../../../src/shared/persistence/wal/WalTransaction.js";

describe("WalTransactionManager", () => {
  const testDir = join(process.cwd(), ".test-tmp", "wal-transaction");
  const walDir = join(testDir, "wal");
  let walManager: WalTransactionManager;

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    walManager = new WalTransactionManager({
      walDirectory: walDir,
      logCategory: "test-wal"
    });
    await walManager.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("基础功能", () => {
    it("应该初始化WAL目录", async () => {
      const { access } = await import("node:fs/promises");
      await expect(access(walDir)).resolves.toBeUndefined();
    });

    it("应该创建WAL事务日志", async () => {
      const operations = [
        { type: "create" as const, entityId: "entity-1", data: { name: "test" } }
      ];

      const walLog = await walManager.beginTransaction(operations);

      expect(walLog.transactionId).toMatch(/^wal-/);
      expect(walLog.operations).toEqual(operations);
      expect(walLog.createdAt).toBeTruthy();
    });

    it("应该读取WAL事务日志", async () => {
      const operations = [
        { type: "update" as const, entityId: "entity-1", data: { status: "active" } }
      ];

      const created = await walManager.beginTransaction(operations);
      const read = await walManager.readTransaction(created.transactionId);

      expect(read).toEqual(created);
    });

    it("读取不存在的事务应返回null", async () => {
      const result = await walManager.readTransaction("wal-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("事务提交", () => {
    it("应该提交事务并删除WAL日志", async () => {
      const operations = [
        { type: "create" as const, entityId: "entity-1", data: {} }
      ];

      const walLog = await walManager.beginTransaction(operations);
      await walManager.commitTransaction(walLog.transactionId);

      const read = await walManager.readTransaction(walLog.transactionId);
      expect(read).toBeNull();
    });

    it("提交不存在的事务应抛出错误", async () => {
      await expect(
        walManager.commitTransaction("wal-nonexistent")
      ).rejects.toThrow();
    });
  });

  describe("事务回滚", () => {
    it("应该回滚事务并删除WAL日志", async () => {
      const operations = [
        { type: "delete" as const, entityId: "entity-1" }
      ];

      const walLog = await walManager.beginTransaction(operations);
      await walManager.rollbackTransaction(walLog.transactionId);

      const read = await walManager.readTransaction(walLog.transactionId);
      expect(read).toBeNull();
    });
  });

  describe("待恢复事务管理", () => {
    it("应该列出所有待恢复的事务", async () => {
      const operations1 = [
        { type: "create" as const, entityId: "entity-1", data: {} }
      ];
      const operations2 = [
        { type: "update" as const, entityId: "entity-2", data: {} }
      ];

      const wal1 = await walManager.beginTransaction(operations1);
      const wal2 = await walManager.beginTransaction(operations2);

      const pending = await walManager.listPendingTransactions();

      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.transactionId)).toContain(wal1.transactionId);
      expect(pending.map((p) => p.transactionId)).toContain(wal2.transactionId);
    });

    it("应该按时间顺序排序待恢复事务", async () => {
      const operations = [{ type: "create" as const, entityId: "test", data: {} }];

      await walManager.beginTransaction(operations, { order: 1 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await walManager.beginTransaction(operations, { order: 2 });

      const pending = await walManager.listPendingTransactions();

      expect(pending[0]?.metadata?.order).toBe(1);
      expect(pending[1]?.metadata?.order).toBe(2);
    });

    it("空目录应返回空列表", async () => {
      const pending = await walManager.listPendingTransactions();
      expect(pending).toEqual([]);
    });
  });

  describe("批量操作", () => {
    it("应该支持多操作事务", async () => {
      const operations = [
        { type: "create" as const, entityId: "entity-1", data: { a: 1 } },
        { type: "update" as const, entityId: "entity-2", data: { b: 2 } },
        { type: "delete" as const, entityId: "entity-3" }
      ];

      const walLog = await walManager.beginTransaction(operations);

      expect(walLog.operations).toHaveLength(3);
      expect(walLog.operations[0]?.type).toBe("create");
      expect(walLog.operations[1]?.type).toBe("update");
      expect(walLog.operations[2]?.type).toBe("delete");
    });

    it("应该支持事务元数据", async () => {
      const operations = [{ type: "create" as const, entityId: "test", data: {} }];
      const metadata = { batchId: "batch-123", userId: "user-1" };

      const walLog = await walManager.beginTransaction(operations, metadata);

      expect(walLog.metadata).toEqual(metadata);
    });
  });

  describe("错误处理", () => {
    it("无效的WAL文件应被跳过", async () => {
      const { writeFile } = await import("node:fs/promises");
      await mkdir(walDir, { recursive: true });
      await writeFile(join(walDir, "wal-invalid.json"), "invalid json");

      const pending = await walManager.listPendingTransactions();
      expect(pending).toEqual([]);
    });
  });

  describe("清理操作", () => {
    it("应该清理所有待恢复事务", async () => {
      await walManager.beginTransaction([
        { type: "create" as const, entityId: "e1", data: {} }
      ]);
      await walManager.beginTransaction([
        { type: "create" as const, entityId: "e2", data: {} }
      ]);

      await walManager.clearAll();

      const pending = await walManager.listPendingTransactions();
      expect(pending).toEqual([]);
    });
  });
});
