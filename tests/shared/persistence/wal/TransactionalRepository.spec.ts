import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { JsonFileStore } from "../../../../src/shared/persistence/JsonFileStore.js";
import { createTransactionalRepository } from "../../../../src/shared/persistence/wal/TransactionalRepository.js";

// 测试实体schema
const TestEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number()
});

type TestEntity = z.infer<typeof TestEntitySchema>;

// 测试Repository
class TestRepository extends JsonFileStore<TestEntity> {
  constructor(directory: string) {
    super({
      directory,
      schema: TestEntitySchema,
      idField: "id",
      logCategory: "TestRepository"
    });
  }
}

describe("TransactionalRepository", () => {
  const testDir = join(process.cwd(), ".test-tmp", "txn-repository");
  const dataDir = join(testDir, "data");
  const walDir = join(testDir, "wal");

  let repository: ReturnType<typeof createTransactionalRepository<TestEntity>>;

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });

    const baseRepo = new TestRepository(dataDir);
    await baseRepo.initialize();

    repository = createTransactionalRepository(baseRepo, {
      walDirectory: walDir,
      recoverOnInit: true
    });

    // 等待初始化完成
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("批量创建 (batchCreate)", () => {
    it("应该原子性创建多个实体", async () => {
      const entities: TestEntity[] = [
        { id: "e1", name: "Entity 1", value: 100 },
        { id: "e2", name: "Entity 2", value: 200 },
        { id: "e3", name: "Entity 3", value: 300 }
      ];

      const results = await repository.batchCreate(entities);

      expect(results).toHaveLength(3);
      expect(results[0]?.name).toBe("Entity 1");

      // 验证持久化
      const read1 = await repository.read("e1");
      const read2 = await repository.read("e2");
      const read3 = await repository.read("e3");

      expect(read1?.value).toBe(100);
      expect(read2?.value).toBe(200);
      expect(read3?.value).toBe(300);
    });

    it("空数组应返回空结果", async () => {
      const results = await repository.batchCreate([]);
      expect(results).toEqual([]);
    });

    it("部分失败应回滚所有创建", async () => {
      const entities: TestEntity[] = [
        { id: "valid-1", name: "Valid", value: 100 },
        { id: "valid-1", name: "Duplicate", value: 200 } // 重复ID
      ];

      await expect(repository.batchCreate(entities)).rejects.toThrow();

      // 验证第一个实体也被回滚
      const read = await repository.read("valid-1");
      expect(read).toBeNull();
    });
  });

  describe("批量更新 (batchUpdate)", () => {
    beforeEach(async () => {
      // 创建初始数据
      await repository.create({ id: "u1", name: "Original 1", value: 10 });
      await repository.create({ id: "u2", name: "Original 2", value: 20 });
    });

    it("应该原子性更新多个实体", async () => {
      const updates = [
        { id: "u1", entity: { id: "u1", name: "Updated 1", value: 15 } },
        { id: "u2", entity: { id: "u2", name: "Updated 2", value: 25 } }
      ];

      const results = await repository.batchUpdate(updates);

      expect(results).toHaveLength(2);
      expect(results[0]?.value).toBe(15);
      expect(results[1]?.value).toBe(25);

      // 验证持久化
      const read1 = await repository.read("u1");
      const read2 = await repository.read("u2");

      expect(read1?.name).toBe("Updated 1");
      expect(read2?.name).toBe("Updated 2");
    });

    it("空数组应返回空结果", async () => {
      const results = await repository.batchUpdate([]);
      expect(results).toEqual([]);
    });

    it("部分失败应回滚所有更新", async () => {
      const updates = [
        { id: "u1", entity: { id: "u1", name: "Modified", value: 99 } },
        { id: "nonexistent", entity: { id: "nonexistent", name: "Bad", value: 0 } }
      ];

      await expect(repository.batchUpdate(updates)).rejects.toThrow();

      // 验证第一个更新被回滚
      const read = await repository.read("u1");
      expect(read?.name).toBe("Original 1");
      expect(read?.value).toBe(10);
    });
  });

  describe("批量删除 (batchDelete)", () => {
    beforeEach(async () => {
      await repository.create({ id: "d1", name: "Delete 1", value: 1 });
      await repository.create({ id: "d2", name: "Delete 2", value: 2 });
      await repository.create({ id: "d3", name: "Delete 3", value: 3 });
    });

    it("应该原子性删除多个实体", async () => {
      await repository.batchDelete(["d1", "d2"]);

      const read1 = await repository.read("d1");
      const read2 = await repository.read("d2");
      const read3 = await repository.read("d3");

      expect(read1).toBeNull();
      expect(read2).toBeNull();
      expect(read3).not.toBeNull();
    });

    it("空数组应正常返回", async () => {
      await expect(repository.batchDelete([])).resolves.toBeUndefined();
    });

    it("部分失败应回滚所有删除", async () => {
      await expect(
        repository.batchDelete(["d1", "nonexistent"])
      ).rejects.toThrow();

      // 验证第一个删除被回滚
      const read = await repository.read("d1");
      expect(read).not.toBeNull();
      expect(read?.name).toBe("Delete 1");
    });
  });

  describe("事务恢复 (recoverPendingTransactions)", () => {
    it("初始化时无待恢复事务应返回0", async () => {
      const count = await repository.recoverPendingTransactions();
      expect(count).toBe(0);
    });

    it("应该恢复未完成的事务（通过回滚）", async () => {
      // 创建一个禁用自动恢复的repository
      const baseRepo = new TestRepository(dataDir);
      await baseRepo.initialize();

      const testRepo = createTransactionalRepository(baseRepo, {
        walDirectory: walDir,
        recoverOnInit: false  // 禁用初始化时自动恢复
      });

      // 手动创建未完成的WAL日志
      const { WalTransactionManager } = await import(
        "../../../../src/shared/persistence/wal/WalTransaction.js"
      );

      const walManager = new WalTransactionManager({
        walDirectory: walDir,
        logCategory: "test-recovery"
      });
      await walManager.initialize();

      await walManager.beginTransaction([
        { type: "create", entityId: "recovery-1", data: {} }
      ]);

      const count = await testRepo.recoverPendingTransactions();
      expect(count).toBe(1);

      // 验证事务被清理
      const pending = await walManager.listPendingTransactions();
      expect(pending).toHaveLength(0);
    });
  });

  describe("与基础Repository的集成", () => {
    it("应该保留基础Repository的所有方法", async () => {
      const entity: TestEntity = { id: "base-1", name: "Base", value: 999 };

      // 使用基础方法
      await repository.create(entity);
      const read = await repository.read("base-1");
      expect(read).toEqual(entity);

      await repository.update("base-1", { ...entity, value: 1000 });
      const updated = await repository.read("base-1");
      expect(updated?.value).toBe(1000);

      await repository.delete("base-1");
      const deleted = await repository.read("base-1");
      expect(deleted).toBeNull();
    });

    it("应该支持list操作", async () => {
      await repository.create({ id: "l1", name: "List 1", value: 1 });
      await repository.create({ id: "l2", name: "List 2", value: 2 });

      const list = await repository.list();
      expect(list).toHaveLength(2);
    });
  });

  describe("并发安全性", () => {
    it("批量操作应该是线程安全的", async () => {
      const batch1 = [
        { id: "c1", name: "Concurrent 1", value: 1 },
        { id: "c2", name: "Concurrent 2", value: 2 }
      ];

      const batch2 = [
        { id: "c3", name: "Concurrent 3", value: 3 },
        { id: "c4", name: "Concurrent 4", value: 4 }
      ];

      // 并发执行批量创建
      await Promise.all([
        repository.batchCreate(batch1),
        repository.batchCreate(batch2)
      ]);

      const list = await repository.list();
      expect(list).toHaveLength(4);
    });
  });
});
