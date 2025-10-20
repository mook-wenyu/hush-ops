import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { JsonFileStore, JsonFileStoreError } from "../../../src/shared/persistence/JsonFileStore.js";

// 测试实体 schema
const TestEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  value: z.number(),
  metadata: z.record(z.unknown()).optional()
});

type TestEntity = z.infer<typeof TestEntitySchema>;

// 测试用具体实现
class TestEntityStore extends JsonFileStore<TestEntity> {
  constructor(directory: string) {
    super({
      directory,
      schema: TestEntitySchema,
      idField: "id",
      logCategory: "TestEntityStore"
    });
  }
}

describe("JsonFileStore", () => {
  let testDir: string;
  let store: TestEntityStore;

  beforeEach(async () => {
    testDir = join(process.cwd(), ".test-jsonfilestore", `test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    store = new TestEntityStore(testDir);
    await store.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // 初始化测试
  describe("initialize", () => {
    it("创建存储目录", async () => {
      const newDir = join(testDir, "subdir");
      const newStore = new TestEntityStore(newDir);
      await newStore.initialize();

      const { stat } = await import("node:fs/promises");
      const stats = await stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  // 创建操作测试
  describe("create", () => {
    it("创建新实体", async () => {
      const entity: TestEntity = {
        id: "test-1",
        name: "Test Entity",
        value: 42
      };

      const created = await store.create(entity);

      expect(created).toEqual(entity);

      // 验证文件存在
      const filePath = join(testDir, "test-1.json");
      const raw = await readFile(filePath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved).toEqual(entity);
    });

    it("实体已存在时抛出错误", async () => {
      const entity: TestEntity = {
        id: "test-1",
        name: "Test",
        value: 1
      };

      await store.create(entity);

      await expect(store.create(entity)).rejects.toThrow(JsonFileStoreError);
      await expect(store.create(entity)).rejects.toThrow("already exists");
    });

    it("验证失败时抛出错误", async () => {
      const invalidEntity = {
        id: "test-1",
        name: "Test"
        // 缺少 value 字段
      };

      await expect(store.create(invalidEntity as TestEntity)).rejects.toThrow(
        JsonFileStoreError
      );
    });

    it("ID 净化：移除非法字符", async () => {
      const entity: TestEntity = {
        id: "test/path@#$123",
        name: "Test",
        value: 1
      };

      await store.create(entity);

      // 文件名应该只包含合法字符
      const files = await readFile(
        join(testDir, "testpath123.json"),
        "utf-8"
      );
      expect(files).toBeDefined();
    });
  });

  // 读取操作测试
  describe("read", () => {
    it("读取存在的实体", async () => {
      const entity: TestEntity = {
        id: "test-1",
        name: "Test",
        value: 100
      };

      await store.create(entity);
      const read = await store.read("test-1");

      expect(read).toEqual(entity);
    });

    it("实体不存在时返回 null", async () => {
      const read = await store.read("non-existent");
      expect(read).toBeNull();
    });

    it("读取无效 JSON 时抛出错误", async () => {
      // 直接写入无效 JSON
      const filePath = join(testDir, "invalid.json");
      await writeFile(filePath, "{ invalid json", "utf-8");

      await expect(store.read("invalid")).rejects.toThrow(JsonFileStoreError);
    });

    it("读取不符合 schema 的数据时抛出错误", async () => {
      const filePath = join(testDir, "bad-schema.json");
      await writeFile(
        filePath,
        JSON.stringify({ id: "bad-schema", name: "Test" }),
        "utf-8"
      );

      await expect(store.read("bad-schema")).rejects.toThrow(
        JsonFileStoreError
      );
    });
  });

  // 更新操作测试
  describe("update", () => {
    it("更新存在的实体", async () => {
      const original: TestEntity = {
        id: "test-1",
        name: "Original",
        value: 1
      };

      await store.create(original);

      const updated: TestEntity = {
        id: "test-1",
        name: "Updated",
        value: 2
      };

      const result = await store.update("test-1", updated);
      expect(result).toEqual(updated);

      const read = await store.read("test-1");
      expect(read).toEqual(updated);
    });

    it("实体不存在时抛出错误", async () => {
      const entity: TestEntity = {
        id: "non-existent",
        name: "Test",
        value: 1
      };

      await expect(store.update("non-existent", entity)).rejects.toThrow(
        JsonFileStoreError
      );
      await expect(store.update("non-existent", entity)).rejects.toThrow(
        "not found"
      );
    });

    it("ID 不匹配时抛出错误", async () => {
      const entity: TestEntity = {
        id: "test-1",
        name: "Test",
        value: 1
      };

      await store.create(entity);

      const mismatch: TestEntity = {
        id: "test-2",
        name: "Mismatch",
        value: 2
      };

      await expect(store.update("test-1", mismatch)).rejects.toThrow(
        JsonFileStoreError
      );
      await expect(store.update("test-1", mismatch)).rejects.toThrow(
        "does not match"
      );
    });
  });

  // 删除操作测试
  describe("delete", () => {
    it("删除存在的实体", async () => {
      const entity: TestEntity = {
        id: "test-1",
        name: "Test",
        value: 1
      };

      await store.create(entity);
      await store.delete("test-1");

      const read = await store.read("test-1");
      expect(read).toBeNull();
    });

    it("实体不存在时抛出错误", async () => {
      await expect(store.delete("non-existent")).rejects.toThrow(
        JsonFileStoreError
      );
      await expect(store.delete("non-existent")).rejects.toThrow("not found");
    });
  });

  // 列表操作测试
  describe("list", () => {
    it("列出所有实体", async () => {
      const entities: TestEntity[] = [
        { id: "test-1", name: "Test 1", value: 1 },
        { id: "test-2", name: "Test 2", value: 2 },
        { id: "test-3", name: "Test 3", value: 3 }
      ];

      for (const entity of entities) {
        await store.create(entity);
      }

      const list = await store.list();

      expect(list).toHaveLength(3);
      expect(list).toEqual(expect.arrayContaining(entities));
    });

    it("空目录返回空数组", async () => {
      const list = await store.list();
      expect(list).toEqual([]);
    });

    it("跳过无效文件", async () => {
      // 创建有效实体
      await store.create({ id: "valid", name: "Valid", value: 1 });

      // 写入无效 JSON
      await writeFile(join(testDir, "invalid.json"), "{ bad json", "utf-8");

      // 写入不符合 schema 的文件
      await writeFile(
        join(testDir, "bad-schema.json"),
        JSON.stringify({ id: "bad", name: "Bad" }),
        "utf-8"
      );

      const list = await store.list();

      // 应该只返回有效实体
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe("valid");
    });
  });

  // exists 测试
  describe("exists", () => {
    it("实体存在时返回 true", async () => {
      await store.create({ id: "test-1", name: "Test", value: 1 });
      const exists = await store.exists("test-1");
      expect(exists).toBe(true);
    });

    it("实体不存在时返回 false", async () => {
      const exists = await store.exists("non-existent");
      expect(exists).toBe(false);
    });
  });

  // 并发安全测试
  describe("并发操作", () => {
    it("并发写入同一实体（最后写入胜出）", async () => {
      const entity1: TestEntity = { id: "concurrent", name: "V1", value: 1 };
      const entity2: TestEntity = { id: "concurrent", name: "V2", value: 2 };

      await store.create(entity1);

      // 并发更新
      await Promise.all([
        store.update("concurrent", { ...entity1, name: "Updated1" }),
        store.update("concurrent", { ...entity2, name: "Updated2" })
      ]);

      // 读取最终结果（应该是其中一个）
      const final = await store.read("concurrent");
      expect(final).toBeDefined();
      expect(["Updated1", "Updated2"]).toContain(final?.name);
    });

    it("并发创建多个不同实体", async () => {
      const entities: TestEntity[] = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        name: `Entity ${i}`,
        value: i
      }));

      await Promise.all(entities.map((e) => store.create(e)));

      const list = await store.list();
      expect(list).toHaveLength(10);
    });
  });

  // 边界条件测试
  describe("边界条件", () => {
    it("ID 为空字符串时抛出错误", async () => {
      const entity = { id: "", name: "Test", value: 1 };

      await expect(store.create(entity as TestEntity)).rejects.toThrow(
        JsonFileStoreError
      );
    });

    it("ID 超长时截断到128字符", async () => {
      const longId = "a".repeat(200);
      const entity: TestEntity = {
        id: longId,
        name: "Test",
        value: 1
      };

      await store.create(entity);

      // 文件名应该被截断
      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir)
      );
      const file = files.find((f) => f.startsWith("a"));
      expect(file).toBeDefined();
      expect(file!.length).toBeLessThanOrEqual(128 + 5); // +5 for .json
    });

    it("包含 metadata 的实体", async () => {
      const entity: TestEntity = {
        id: "with-metadata",
        name: "Test",
        value: 1,
        metadata: {
          tags: ["a", "b", "c"],
          created: new Date().toISOString(),
          nested: { key: "value" }
        }
      };

      await store.create(entity);
      const read = await store.read("with-metadata");

      expect(read).toEqual(entity);
    });
  });

  // 性能测试
  describe("性能", () => {
    it("1000次写入应在5秒内完成", async () => {
      const start = Date.now();

      const promises = Array.from({ length: 1000 }, async (_, i) => {
        return store.create({
          id: `perf-${i}`,
          name: `Entity ${i}`,
          value: i
        });
      });

      await Promise.all(promises);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);

      // 验证所有实体都已创建
      const list = await store.list();
      expect(list).toHaveLength(1000);
    }, 10000); // 10秒超时
  });
});
