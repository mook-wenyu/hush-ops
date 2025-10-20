import { WalTransactionManager, type WalOperation, type WalLog } from "./WalTransaction.js";
import type { JsonFileStore } from "../JsonFileStore.js";
import { createLoggerFacade } from "../../logging/logger.js";

/**
 * 事务性Repository混入选项
 */
export interface TransactionalRepositoryOptions {
  /**
   * WAL目录路径
   */
  readonly walDirectory: string;

  /**
   * 是否在初始化时恢复未完成事务
   * @default true
   */
  readonly recoverOnInit?: boolean;
}

/**
 * 事务性Repository接口
 *
 * 为JsonFileStore提供事务性批量操作能力
 */
export interface TransactionalRepository<T extends object> {
  /**
   * 批量创建实体（原子性）
   */
  batchCreate(entities: T[]): Promise<T[]>;

  /**
   * 批量更新实体（原子性）
   */
  batchUpdate(updates: Array<{ id: string; entity: T }>): Promise<T[]>;

  /**
   * 批量删除实体（原子性）
   */
  batchDelete(ids: string[]): Promise<void>;

  /**
   * 恢复未完成的事务
   */
  recoverPendingTransactions(): Promise<number>;
}

/**
 * 为JsonFileStore创建事务性Repository包装器
 *
 * @param store JsonFileStore实例
 * @param options 事务性Repository选项
 * @returns 扩展了事务性操作的Repository
 *
 * @example
 * ```typescript
 * const plansRepo = new PlansRepository();
 * const txnRepo = createTransactionalRepository(plansRepo, {
 *   walDirectory: ".wal/plans"
 * });
 *
 * // 批量创建（原子性）
 * await txnRepo.batchCreate([plan1, plan2, plan3]);
 * ```
 */
export function createTransactionalRepository<T extends object>(
  store: JsonFileStore<T>,
  options: TransactionalRepositoryOptions
): JsonFileStore<T> & TransactionalRepository<T> {
  const walManager = new WalTransactionManager({
    walDirectory: options.walDirectory,
    logCategory: `${store.constructor.name}-WAL`
  });

  const logger = createLoggerFacade(`${store.constructor.name}-Transactional`, {});

  // 标记初始化状态
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  // 确保初始化（惰性初始化）
  const ensureInitialized = async (): Promise<void> => {
    if (initialized) {
      return;
    }

    if (!initPromise) {
      initPromise = (async () => {
        await walManager.initialize();

        if (options.recoverOnInit ?? true) {
          const recovered = await internalRecoverPendingTransactions();
          if (recovered > 0) {
            logger.info("Recovered pending transactions on init", {
              count: recovered
            });
          }
        }
        initialized = true;
      })();
    }

    await initPromise;
  };

  /**
   * 批量创建实体（原子性）
   */
  async function batchCreate(entities: T[]): Promise<T[]> {
    await ensureInitialized();

    if (entities.length === 0) {
      return [];
    }

    const operations: WalOperation[] = entities.map((entity) => {
      const id = (entity as any).id as string;
      return {
        type: "create" as const,
        entityId: id,
        data: entity
      };
    });

    const txn = await walManager.beginTransaction(operations, {
      operation: "batchCreate",
      count: entities.length
    });

    try {
      // 执行所有create操作
      const results: T[] = [];
      for (const entity of entities) {
        const result = await store.create(entity);
        results.push(result);
      }

      // 提交事务
      await walManager.commitTransaction(txn.transactionId);

      logger.info("Batch create completed", {
        transactionId: txn.transactionId,
        count: entities.length
      });

      return results;
    } catch (error) {
      // 回滚事务
      await walManager.rollbackTransaction(txn.transactionId);

      // 尝试清理已创建的实体
      for (const entity of entities) {
        try {
          const id = (entity as any).id as string;
          if (await store.exists(id)) {
            await store.delete(id);
          }
        } catch {
          // 忽略清理失败
        }
      }

      logger.error("Batch create failed, rolled back", error, {
        transactionId: txn.transactionId,
        count: entities.length
      });

      throw error;
    }
  }

  /**
   * 批量更新实体（原子性）
   */
  async function batchUpdate(
    updates: Array<{ id: string; entity: T }>
  ): Promise<T[]> {
    await ensureInitialized();

    if (updates.length === 0) {
      return [];
    }

    const operations: WalOperation[] = updates.map(({ id, entity }) => ({
      type: "update" as const,
      entityId: id,
      data: entity
    }));

    const txn = await walManager.beginTransaction(operations, {
      operation: "batchUpdate",
      count: updates.length
    });

    // 保存原始状态用于回滚
    const originalStates = new Map<string, T | null>();
    for (const { id } of updates) {
      const original = await store.read(id);
      originalStates.set(id, original);
    }

    try {
      // 执行所有update操作
      const results: T[] = [];
      for (const { id, entity } of updates) {
        const result = await store.update(id, entity);
        results.push(result);
      }

      // 提交事务
      await walManager.commitTransaction(txn.transactionId);

      logger.info("Batch update completed", {
        transactionId: txn.transactionId,
        count: updates.length
      });

      return results;
    } catch (error) {
      // 回滚事务
      await walManager.rollbackTransaction(txn.transactionId);

      // 尝试恢复原始状态
      for (const [_id, original] of originalStates.entries()) {
        if (original) {
          try {
            await store.update(_id, original);
          } catch {
            // 忽略恢复失败
          }
        }
      }

      logger.error("Batch update failed, rolled back", error, {
        transactionId: txn.transactionId,
        count: updates.length
      });

      throw error;
    }
  }

  /**
   * 批量删除实体（原子性）
   */
  async function batchDelete(ids: string[]): Promise<void> {
    await ensureInitialized();

    if (ids.length === 0) {
      return;
    }

    const operations: WalOperation[] = ids.map((id) => ({
      type: "delete" as const,
      entityId: id
    }));

    const txn = await walManager.beginTransaction(operations, {
      operation: "batchDelete",
      count: ids.length
    });

    // 保存原始状态用于回滚
    const originalStates = new Map<string, T | null>();
    for (const id of ids) {
      const original = await store.read(id);
      originalStates.set(id, original);
    }

    try {
      // 执行所有delete操作
      for (const id of ids) {
        await store.delete(id);
      }

      // 提交事务
      await walManager.commitTransaction(txn.transactionId);

      logger.info("Batch delete completed", {
        transactionId: txn.transactionId,
        count: ids.length
      });
    } catch (error) {
      // 回滚事务
      await walManager.rollbackTransaction(txn.transactionId);

      // 尝试恢复原始状态
      for (const [_id, original] of originalStates.entries()) {
        if (original) {
          try {
            await store.create(original);
          } catch {
            // 忽略恢复失败
          }
        }
      }

      logger.error("Batch delete failed, rolled back", error, {
        transactionId: txn.transactionId,
        count: ids.length
      });

      throw error;
    }
  }

  /**
   * 内部恢复未完成的事务（不调用 ensureInitialized，避免循环依赖）
   */
  async function internalRecoverPendingTransactions(): Promise<number> {
    const pending = await walManager.listPendingTransactions();

    if (pending.length === 0) {
      return 0;
    }

    logger.warn("Found pending WAL transactions", {
      count: pending.length
    });

    let recovered = 0;
    for (const walLog of pending) {
      try {
        await recoverTransaction(walLog);
        recovered++;
      } catch (error) {
        logger.error("Failed to recover transaction", error, {
          transactionId: walLog.transactionId
        });
      }
    }

    return recovered;
  }

  /**
   * 恢复未完成的事务（公共接口）
   */
  async function recoverPendingTransactions(): Promise<number> {
    // 确保初始化（如果还未初始化，会在初始化时恢复一次）
    await ensureInitialized();

    // 再次检查并恢复（可能在初始化后又有新的未完成事务）
    return internalRecoverPendingTransactions();
  }

  /**
   * 恢复单个事务
   */
  async function recoverTransaction(walLog: WalLog): Promise<void> {
    logger.info("Recovering transaction", {
      transactionId: walLog.transactionId,
      operationCount: walLog.operations.length
    });

    // 简单策略：回滚所有未完成的事务
    // 更复杂的策略可以尝试重放操作
    await walManager.rollbackTransaction(walLog.transactionId);

    logger.info("Transaction rolled back during recovery", {
      transactionId: walLog.transactionId
    });
  }

  // 创建代理对象，合并原Store和事务性操作
  return new Proxy(store as JsonFileStore<T> & TransactionalRepository<T>, {
    get(target, prop) {
      if (prop === "batchCreate") return batchCreate;
      if (prop === "batchUpdate") return batchUpdate;
      if (prop === "batchDelete") return batchDelete;
      if (prop === "recoverPendingTransactions") return recoverPendingTransactions;
      return (target as any)[prop];
    }
  });
}
