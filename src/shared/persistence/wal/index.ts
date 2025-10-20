/**
 * WAL (Write-Ahead Log) 事务支持
 *
 * 提供基于WAL的事务性Repository操作，确保批量操作的原子性。
 *
 * @module shared/persistence/wal
 */

export { WalTransactionManager, type WalLog, type WalOperation, type WalOperationType } from "./WalTransaction.js";
export { createTransactionalRepository, type TransactionalRepository, type TransactionalRepositoryOptions } from "./TransactionalRepository.js";
