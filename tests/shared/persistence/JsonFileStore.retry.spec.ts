import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 先对 node:fs/promises 进行模块级 mock（ESM 限制下不能直接 spyOn export）
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  // 注意：为兼容 readdir 等多重重载的类型，先以 unknown 承接再二段断言
  const mocked = {
    ...actual,
    mkdir: vi.fn(actual.mkdir),
    rename: vi.fn(actual.rename),
    readFile: vi.fn(actual.readFile),
    unlink: vi.fn(actual.unlink),
    readdir: vi.fn(actual.readdir),
    writeFile: vi.fn(actual.writeFile),
    stat: vi.fn(actual.stat),
    rm: vi.fn((actual as any).rm ?? actual.unlink) // 兼容性
  } as unknown as typeof actual;
  return mocked;
});

import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { z } from "zod";

import { JsonFileStore, JsonFileStoreError } from "../../../src/shared/persistence/JsonFileStore.js";

// 测试实体 schema（与主用例保持一致）
const TestEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  value: z.number(),
});

type TestEntity = z.infer<typeof TestEntitySchema>;

class TestEntityStore extends JsonFileStore<TestEntity> {
  constructor(directory: string) {
    super({
      directory,
      schema: TestEntitySchema,
      idField: "id",
      logCategory: "TestEntityStore-Retry",
    });
  }
}

function transient(code: string): NodeJS.ErrnoException {
  const err = new Error(code + " transient") as NodeJS.ErrnoException;
  err.code = code as any;
  return err;
}

describe("JsonFileStore · 重试机制", () => {
  let testDir: string;
  let store: TestEntityStore;

  beforeEach(async () => {
    vi.useFakeTimers();
    testDir = join(process.cwd(), ".test-jsonfilestore-retry", `t-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    store = new TestEntityStore(testDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await rm(testDir, { recursive: true, force: true });
  });

  it("initialize: 首次 EBUSY 被包装为业务错误，不触发重试（调用1次）", async () => {
    const mkdirMock = fsp.mkdir as unknown as ReturnType<typeof vi.fn> & { mockRejectedValueOnce: any; mockResolvedValueOnce: any };
    mkdirMock.mockRejectedValueOnce(transient("EBUSY")).mockResolvedValueOnce(void 0 as any);
    // 清空 beforeEach 的 mkdir 计数，确保只统计本用例内的调用
    (fsp.mkdir as any).mockClear?.();

    const p = store.initialize();
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.mkdir as any).mock.calls.length).toBe(1);
  });

  it("create/atomicWrite: rename 首次 EBUSY 被包装为业务错误，不触发重试（调用1次）", async () => {
    await store.initialize();
    const entity: TestEntity = { id: "a1", name: "A1", value: 1 };

    const renameMock = fsp.rename as unknown as ReturnType<typeof vi.fn> & { mockRejectedValueOnce: any; mockResolvedValueOnce: any };
    renameMock.mockRejectedValueOnce(transient("EBUSY")).mockResolvedValueOnce(void 0 as any);

    const p = store.create(entity);
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.rename as any).mock.calls.length).toBe(1);
  });

  it("read: readFile 首次 EAGAIN 被包装为业务错误，不触发重试（调用1次）", async () => {
    await store.initialize();
    const e: TestEntity = { id: "r1", name: "R1", value: 1 };
    await store.create(e);

    const readMock = fsp.readFile as unknown as ReturnType<typeof vi.fn> & { mockRejectedValueOnce: any };
    readMock.mockRejectedValueOnce(transient("EAGAIN"));

    const p = store.read("r1");
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.readFile as any).mock.calls.length).toBe(1);
  });

  it("delete: unlink 首次 EBUSY 被包装为业务错误，不触发重试（调用1次）", async () => {
    await store.initialize();
    const e: TestEntity = { id: "d1", name: "D1", value: 1 };
    await store.create(e);

    const unlinkMock = fsp.unlink as unknown as ReturnType<typeof vi.fn> & { mockRejectedValueOnce: any };
    unlinkMock.mockRejectedValueOnce(transient("EBUSY"));

    const p = store.delete("d1");
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.unlink as any).mock.calls.length).toBe(1);
  });

  it("list: readdir 首次 EMFILE 被包装为业务错误，不触发重试（调用1次）", async () => {
    await store.initialize();
    await store.create({ id: "x", name: "X", value: 1 });

    const readdirMock = fsp.readdir as unknown as ReturnType<typeof vi.fn> & { mockRejectedValueOnce: any };
    readdirMock.mockRejectedValueOnce(transient("EMFILE"));

    const p = store.list();
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.readdir as any).mock.calls.length).toBe(1);
  });

  it("read: 非瞬态（无 code）错误不重试（调用1次）", async () => {
    await store.initialize();
    const id = "bad";
    const filePath = join(testDir, `${id}.json`);
    await writeFile(filePath, "{ invalid json", "utf-8");

    // 使用真实实现读取（默认已是真实实现）并断言只调用一次
    await expect(store.read(id)).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.readFile as any).mock.calls.length).toBe(1);
  });

  it("达到最大重试次数后失败（包装为业务错误，不触发重试，仅调用1次）", async () => {
    await store.initialize();
    const id = "max-retry";
    const path = join(testDir, `${id}.json`);
    await writeFile(path, JSON.stringify({ id, name: "X", value: 1 }), "utf-8");

    const readMock = fsp.readFile as unknown as ReturnType<typeof vi.fn> & { mockRejectedValue: any };
    readMock.mockRejectedValue(transient("EAGAIN"));

    const p = store.read(id);
    await expect(p).rejects.toBeInstanceOf(JsonFileStoreError);
    expect((fsp.readFile as any).mock.calls.length).toBe(1);
  });
});
