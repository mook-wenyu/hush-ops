import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, unlink, mkdir, rename, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { z } from "zod";

import { createLoggerFacade, type LoggerFacade } from "../logging/logger.js";
import { retryWithBackoff, type RetryOptions } from "../retry/retryWithBackoff.js";

/**
 * JsonFileStore 配置选项
 */
export interface JsonFileStoreOptions<T> {
  /**
   * 存储目录路径（绝对路径）
   */
  readonly directory: string;

  /**
   * Zod schema 用于验证实体
   * 使用宽松的类型约束以兼容 exactOptionalPropertyTypes
   */
  readonly schema: z.ZodType<T, any, any>;

  /**
   * 实体 ID 字段名，默认为 'id'
   */
  readonly idField?: keyof T;

  /**
   * 日志类别，默认为类名
   */
  readonly logCategory?: string;

  /**
   * 重试配置（可选）
   * 为文件系统操作提供自动重试能力
   */
  readonly retryOptions?: Partial<RetryOptions>;
}

/**
 * 文件存储错误
 */
export class JsonFileStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "JsonFileStoreError";
  }
}

/**
 * JsonFileStore 抽象基类
 *
 * 提供基于文件系统的 JSON 实体存储，每个实体一个文件。
 *
 * 特性：
 * - 原子写入（使用 rename）
 * - Zod schema 验证
 * - 通用 CRUD 操作
 * - 并发安全（通过原子文件操作）
 * - 结构化日志
 * - 自动重试机制（可配置）
 *
 * @template T 实体类型
 */
export abstract class JsonFileStore<T extends object> {
  protected readonly directory: string;
  protected readonly schema: z.ZodType<T, any, any>;
  protected readonly idField: keyof T;
  protected readonly logger: LoggerFacade;
  protected readonly retryOptions: RetryOptions;

  constructor(options: JsonFileStoreOptions<T>) {
    this.directory = options.directory;
    this.schema = options.schema;
    this.idField = options.idField ?? ("id" as keyof T);
    this.logger = createLoggerFacade(
      options.logCategory ?? this.constructor.name,
      {}
    );

    // 配置重试选项
    this.retryOptions = {
      retries: 3,
      baseDelay: 100,
      ...options.retryOptions,
      // 重写 onFailedAttempt 以使用实例 logger
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        this.logger.warn("File operation failed, retrying", {
          attemptNumber,
          retriesLeft,
          error: error.message
        });
      },
      // 配置 shouldRetry：只重试瞬态错误
      shouldRetry: this.isTransientError.bind(this)
    };
  }

  /**
   * 初始化存储（确保目录存在）
   *
   * 包含自动重试机制以处理瞬态文件系统错误
   */
  async initialize(): Promise<void> {
    await retryWithBackoff(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        this.logger.info("Storage initialized", { directory: this.directory });
      } catch (error) {
        this.logger.error("Failed to initialize storage", error, {
          directory: this.directory
        });
        throw new JsonFileStoreError(
          "Failed to initialize storage directory",
          "initialization_failed",
          error
        );
      }
    }, this.retryOptions);
  }

  /**
   * 创建新实体
   */
  async create(entity: T): Promise<T> {
    const validated = this.validateEntity(entity);
    const id = this.extractId(validated);
    const filePath = this.getFilePath(id);

    // 检查文件是否已存在
    this.logger.info("Checking file existence before create", {
      directory: this.directory,
      id,
      filePath
    });

    const exists = await this.fileExists(filePath);
    if (exists) {
      this.logger.error("File already exists!", {
        directory: this.directory,
        id,
        filePath
      });
      throw new JsonFileStoreError(
        `Entity with id '${String(id)}' already exists`,
        "entity_exists"
      );
    }

    await this.atomicWrite(filePath, validated);
    this.logger.info("Entity created", { id });
    return validated;
  }

  /**
   * 读取实体
   *
   * 包含自动重试机制以处理瞬态文件系统错误
   */
  async read(id: string): Promise<T | null> {
    const filePath = this.getFilePath(id);
    const exists = await this.fileExists(filePath);

    if (!exists) {
      return null;
    }

    return retryWithBackoff(async () => {
      try {
        const raw = await readFile(filePath, "utf-8");
        const data = JSON.parse(raw) as unknown;
        const validated = this.validateEntity(data);
        return validated;
      } catch (error) {
        this.logger.error("Failed to read entity", error, { id, filePath });
        throw new JsonFileStoreError(
          `Failed to read entity '${id}'`,
          "read_failed",
          error
        );
      }
    }, this.retryOptions);
  }

  /**
   * 更新实体
   */
  async update(id: string, entity: T): Promise<T> {
    const validated = this.validateEntity(entity);
    const entityId = this.extractId(validated);

    // 确保实体 ID 与参数 ID 一致
    if (String(entityId) !== id) {
      throw new JsonFileStoreError(
        `Entity id '${String(entityId)}' does not match provided id '${id}'`,
        "id_mismatch"
      );
    }

    const filePath = this.getFilePath(id);
    const exists = await this.fileExists(filePath);

    if (!exists) {
      throw new JsonFileStoreError(
        `Entity with id '${id}' not found`,
        "entity_not_found"
      );
    }

    await this.atomicWrite(filePath, validated);
    this.logger.info("Entity updated", { id });
    return validated;
  }

  /**
   * 删除实体
   *
   * 包含自动重试机制以处理瞬态文件系统错误
   */
  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    const exists = await this.fileExists(filePath);

    if (!exists) {
      throw new JsonFileStoreError(
        `Entity with id '${id}' not found`,
        "entity_not_found"
      );
    }

    await retryWithBackoff(async () => {
      try {
        await unlink(filePath);
        this.logger.info("Entity deleted", { id });
      } catch (error) {
        this.logger.error("Failed to delete entity", error, { id, filePath });
        throw new JsonFileStoreError(
          `Failed to delete entity '${id}'`,
          "delete_failed",
          error
        );
      }
    }, this.retryOptions);
  }

  /**
   * 列出所有实体
   *
   * 包含自动重试机制以处理瞬态文件系统错误
   */
  async list(): Promise<T[]> {
    return retryWithBackoff(async () => {
      try {
        // 确保目录存在
        await mkdir(this.directory, { recursive: true });

        const files = await readdir(this.directory);
        const jsonFiles = files.filter((f) => f.endsWith(".json"));

        const entities: T[] = [];
        for (const file of jsonFiles) {
          const filePath = join(this.directory, file);
          try {
            const raw = await readFile(filePath, "utf-8");
            const data = JSON.parse(raw) as unknown;
            const validated = this.validateEntity(data);
            entities.push(validated);
          } catch (error) {
            // 跳过无效文件，记录警告
            this.logger.warn("Skipping invalid file during list", {
              file,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        return entities;
      } catch (error) {
        this.logger.error("Failed to list entities", error, {
          directory: this.directory
        });
        throw new JsonFileStoreError(
          "Failed to list entities",
          "list_failed",
          error
        );
      }
    }, this.retryOptions);
  }

  /**
   * 检查实体是否存在
   */
  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    return this.fileExists(filePath);
  }

  /**
   * 原子写入文件
   *
   * 使用临时文件 + rename 保证原子性：
   * 1. 写入临时文件
   * 2. rename 到目标文件（原子操作）
   * 3. 失败时清理临时文件
   *
   * 包含自动重试机制以处理瞬态文件系统错误
   */
  protected async atomicWrite(filePath: string, data: T): Promise<void> {
    const validated = this.validateEntity(data);
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    await retryWithBackoff(async () => {
      try {
        // 确保目录存在
        await mkdir(dirname(filePath), { recursive: true });

        // 写入临时文件
        const json = JSON.stringify(validated, null, 2);
        await writeFile(tempPath, json + "\n", "utf-8");

        // 原子 rename
        await rename(tempPath, filePath);
      } catch (error) {
        // 清理临时文件
        try {
          await unlink(tempPath);
        } catch {
          // 忽略清理失败
        }

        this.logger.error("Atomic write failed", error, { filePath, tempPath });
        throw new JsonFileStoreError(
          "Atomic write failed",
          "write_failed",
          error
        );
      }
    }, this.retryOptions);
  }

  /**
   * 验证实体
   */
  protected validateEntity(data: unknown): T {
    try {
      return this.schema.parse(data);
    } catch (error) {
      throw new JsonFileStoreError(
        "Entity validation failed",
        "validation_failed",
        error
      );
    }
  }

  /**
   * 提取实体 ID
   */
  protected extractId(entity: T): string {
    const id = entity[this.idField];
    if (typeof id !== "string" || id.length === 0) {
      throw new JsonFileStoreError(
        `Entity must have a valid '${String(this.idField)}' field`,
        "invalid_id"
      );
    }
    return id;
  }

  /**
   * 获取实体文件路径
   */
  protected getFilePath(id: string): string {
    // 净化 ID，防止路径遍历攻击
    const safeId = this.sanitizeId(id);
    return join(this.directory, `${safeId}.json`);
  }

  /**
   * 净化 ID（移除非法字符）
   */
  protected sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  }

  /**
   * 检查文件是否存在
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 判断错误是否为瞬态错误（可重试）
   *
   * 瞬态错误包括：
   * - EBUSY: 文件被占用（临时锁定）
   * - EPERM: 权限错误（可能是临时权限问题）
   * - EAGAIN: 资源暂时不可用
   * - EMFILE/ENFILE: 文件描述符耗尽（临时资源限制）
   *
   * 非瞬态错误（不可重试）：
   * - ENOENT: 文件不存在（预期错误，快速失败）
   * - EISDIR: 目标是目录而非文件
   * - JsonFileStoreError: 业务逻辑错误（验证失败等）
   */
  protected isTransientError({ error }: { error: Error }): boolean {
    // 业务逻辑错误不重试
    if (error instanceof JsonFileStoreError) {
      return false;
    }

    // 检查 Node.js 文件系统错误码
    const nodeError = error as NodeJS.ErrnoException;
    if (!nodeError.code) {
      // 未知错误，保守起见不重试
      return false;
    }

    // 可重试的瞬态错误
    const transientCodes = new Set([
      "EBUSY",    // 文件被占用
      "EPERM",    // 权限错误（可能是临时的）
      "EAGAIN",   // 资源暂时不可用
      "EMFILE",   // 进程打开文件过多
      "ENFILE"    // 系统打开文件过多
    ]);

    return transientCodes.has(nodeError.code);
  }
}
