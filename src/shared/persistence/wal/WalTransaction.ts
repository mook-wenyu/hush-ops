import { randomUUID } from "node:crypto";
import { writeFile, readFile, unlink, readdir, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLoggerFacade, type LoggerFacade } from "../../logging/logger.js";

/**
 * WAL (Write-Ahead Log) 事务操作类型
 */
export type WalOperationType = "create" | "update" | "delete";

/**
 * WAL 操作记录
 */
export interface WalOperation {
  /**
   * 操作类型
   */
  readonly type: WalOperationType;

  /**
   * 目标实体ID
   */
  readonly entityId: string;

  /**
   * 操作数据（create/update时需要）
   */
  readonly data?: unknown;
}

/**
 * WAL 事务日志
 */
export interface WalLog {
  /**
   * 事务ID
   */
  readonly transactionId: string;

  /**
   * 创建时间
   */
  readonly createdAt: string;

  /**
   * 操作列表
   */
  readonly operations: WalOperation[];

  /**
   * 事务元数据
   */
  readonly metadata?: Record<string, unknown>;
}

/**
 * WAL 事务管理器选项
 */
export interface WalTransactionManagerOptions {
  /**
   * WAL 日志目录
   */
  readonly walDirectory: string;

  /**
   * 日志类别
   */
  readonly logCategory?: string;
}

/**
 * WAL 事务管理器
 *
 * 提供 Write-Ahead Log 机制，确保多操作的原子性：
 * 1. 写入WAL日志文件
 * 2. 执行实际操作
 * 3. 删除WAL日志文件
 *
 * 如果在步骤2失败，下次启动时可以通过WAL恢复或回滚。
 *
 * @example
 * ```typescript
 * const walManager = new WalTransactionManager({ walDirectory: ".wal" });
 * await walManager.initialize();
 *
 * // 开始事务
 * const txn = await walManager.beginTransaction([
 *   { type: "create", entityId: "user-1", data: { name: "Alice" } },
 *   { type: "update", entityId: "user-2", data: { status: "active" } }
 * ]);
 *
 * try {
 *   // 执行操作...
 *   await walManager.commitTransaction(txn.transactionId);
 * } catch (error) {
 *   await walManager.rollbackTransaction(txn.transactionId);
 * }
 * ```
 */
export class WalTransactionManager {
  private readonly walDirectory: string;
  private readonly logger: LoggerFacade;

  constructor(options: WalTransactionManagerOptions) {
    this.walDirectory = options.walDirectory;
    this.logger = createLoggerFacade(
      options.logCategory ?? "WalTransactionManager",
      {}
    );
  }

  /**
   * 初始化WAL目录
   */
  async initialize(): Promise<void> {
    await mkdir(this.walDirectory, { recursive: true });
    this.logger.info("WAL directory initialized", {
      directory: this.walDirectory
    });
  }

  /**
   * 开始新事务
   *
   * @param operations 事务操作列表
   * @param metadata 可选元数据
   * @returns WAL日志
   */
  async beginTransaction(
    operations: WalOperation[],
    metadata?: Record<string, unknown>
  ): Promise<WalLog> {
    const transactionId = `wal-${randomUUID()}`;
    const walLog: WalLog = {
      transactionId,
      createdAt: new Date().toISOString(),
      operations,
      ...(metadata !== undefined ? { metadata } : {})
    };

    // 写入WAL日志文件（原子写入）
    const walPath = this.getWalPath(transactionId);
    const tempPath = `${walPath}.tmp`;

    try {
      await mkdir(dirname(walPath), { recursive: true });
      const json = JSON.stringify(walLog, null, 2);
      await writeFile(tempPath, json + "\n", "utf-8");
      await rename(tempPath, walPath);

      this.logger.info("WAL transaction started", {
        transactionId,
        operationCount: operations.length
      });

      return walLog;
    } catch (error) {
      // 清理临时文件
      try {
        await unlink(tempPath);
      } catch {
        // 忽略清理失败
      }

      this.logger.error("Failed to start WAL transaction", error, {
        transactionId
      });
      throw new Error(
        `Failed to start WAL transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 提交事务（删除WAL日志）
   *
   * @param transactionId 事务ID
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const walPath = this.getWalPath(transactionId);

    try {
      await unlink(walPath);
      this.logger.info("WAL transaction committed", { transactionId });
    } catch (error) {
      this.logger.error("Failed to commit WAL transaction", error, {
        transactionId
      });
      throw new Error(
        `Failed to commit WAL transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 回滚事务（删除WAL日志）
   *
   * 注意：回滚只删除WAL日志，不会撤销已执行的操作。
   * 调用者需要自行实现回滚逻辑。
   *
   * @param transactionId 事务ID
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const walPath = this.getWalPath(transactionId);

    try {
      await unlink(walPath);
      this.logger.warn("WAL transaction rolled back", { transactionId });
    } catch (error) {
      this.logger.error("Failed to rollback WAL transaction", error, {
        transactionId
      });
      throw new Error(
        `Failed to rollback WAL transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 列出所有待恢复的WAL日志
   *
   * @returns WAL日志列表
   */
  async listPendingTransactions(): Promise<WalLog[]> {
    try {
      const files = await readdir(this.walDirectory);
      const walFiles = files.filter((f) => f.startsWith("wal-") && f.endsWith(".json"));

      const logs: WalLog[] = [];
      for (const file of walFiles) {
        const walPath = join(this.walDirectory, file);
        try {
          const raw = await readFile(walPath, "utf-8");
          const log = JSON.parse(raw) as WalLog;
          logs.push(log);
        } catch (error) {
          this.logger.warn("Skipping invalid WAL file", {
            file,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      this.logger.error("Failed to list pending transactions", error);
      return [];
    }
  }

  /**
   * 读取指定事务的WAL日志
   *
   * @param transactionId 事务ID
   * @returns WAL日志，不存在时返回null
   */
  async readTransaction(transactionId: string): Promise<WalLog | null> {
    const walPath = this.getWalPath(transactionId);

    try {
      const raw = await readFile(walPath, "utf-8");
      const log = JSON.parse(raw) as WalLog;
      return log;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      this.logger.error("Failed to read WAL transaction", error, {
        transactionId
      });
      throw new Error(
        `Failed to read WAL transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取WAL日志文件路径
   */
  private getWalPath(transactionId: string): string {
    return join(this.walDirectory, `${transactionId}.json`);
  }

  /**
   * 清理所有WAL日志（危险操作，仅用于测试或维护）
   */
  async clearAll(): Promise<void> {
    const pending = await this.listPendingTransactions();
    for (const log of pending) {
      await this.commitTransaction(log.transactionId);
    }
    this.logger.warn("All WAL transactions cleared", {
      count: pending.length
    });
  }
}
