/**
 * Repository 健康监控器
 *
 * 提供自动降级和恢复能力：
 * - 跟踪连续失败次数
 * - 超过阈值后自动禁用 Repository
 * - 恢复后重新启用
 *
 * 使用场景：
 * ```typescript
 * const monitor = new RepositoryHealthMonitor({ maxFailures: 3 });
 *
 * // 尝试操作
 * if (monitor.isHealthy()) {
 *   try {
 *     await repository.write(data);
 *     monitor.recordSuccess();
 *   } catch (error) {
 *     monitor.recordFailure(error);
 *     // 降级到内存模式
 *   }
 * }
 * ```
 */

import { createLoggerFacade, type LoggerFacade } from "../logging/logger.js";

export interface RepositoryHealthMonitorOptions {
  /**
   * 连续失败多少次后标记为不健康
   * @default 3
   */
  maxFailures?: number;

  /**
   * 恢复测试间隔（毫秒）
   * @default 60000 (1分钟)
   */
  recoveryTestInterval?: number;

  /**
   * 日志类别
   * @default "RepositoryHealthMonitor"
   */
  logCategory?: string;

  /**
   * 当健康状态变化时的回调
   */
  onHealthChange?: (healthy: boolean) => void;
}

export interface RepositoryHealthStatus {
  /**
   * 是否健康（可用）
   */
  healthy: boolean;

  /**
   * 连续失败次数
   */
  consecutiveFailures: number;

  /**
   * 最大失败阈值
   */
  maxFailures: number;

  /**
   * 上次失败时间
   */
  lastFailureAt?: string;

  /**
   * 上次失败的错误信息
   */
  lastError?: string;

  /**
   * 总操作次数
   */
  totalOperations: number;

  /**
   * 总失败次数
   */
  totalFailures: number;

  /**
   * 下次恢复测试时间
   */
  nextRecoveryTestAt?: string;
}

export class RepositoryHealthMonitor {
  private readonly options: Required<RepositoryHealthMonitorOptions>;
  private readonly logger: LoggerFacade;

  private healthy = true;
  private consecutiveFailures = 0;
  private totalOperations = 0;
  private totalFailures = 0;
  private lastFailureAt?: Date;
  private lastError?: string;
  private nextRecoveryTestAt?: Date;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(options: RepositoryHealthMonitorOptions = {}) {
    this.options = {
      maxFailures: options.maxFailures ?? 3,
      recoveryTestInterval: options.recoveryTestInterval ?? 60000,
      logCategory: options.logCategory ?? "RepositoryHealthMonitor",
      onHealthChange: options.onHealthChange ?? (() => {})
    };

    this.logger = createLoggerFacade(this.options.logCategory, {});
  }

  /**
   * 记录成功操作
   */
  recordSuccess(): void {
    this.totalOperations++;

    // 如果之前不健康，现在恢复了
    if (!this.healthy) {
      this.logger.info("Repository recovered", {
        previousFailures: this.consecutiveFailures,
        totalFailures: this.totalFailures
      });

      this.healthy = true;
      this.consecutiveFailures = 0;
      delete this.lastFailureAt;
      delete this.lastError;
      delete this.nextRecoveryTestAt;

      // 清除恢复定时器
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        delete this.recoveryTimer;
      }

      // 通知健康状态变化
      this.options.onHealthChange(true);
    } else {
      // 仍然健康，重置连续失败计数
      this.consecutiveFailures = 0;
    }
  }

  /**
   * 记录失败操作
   */
  recordFailure(error: Error): void {
    this.totalOperations++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureAt = new Date();
    this.lastError = error.message;

    this.logger.warn("Repository operation failed", {
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.options.maxFailures,
      error: error.message
    });

    // 超过阈值，标记为不健康
    if (this.consecutiveFailures >= this.options.maxFailures && this.healthy) {
      this.healthy = false;

      this.logger.error("Repository marked as unhealthy - degrading to memory-only mode", {
        consecutiveFailures: this.consecutiveFailures,
        maxFailures: this.options.maxFailures,
        totalFailures: this.totalFailures,
        totalOperations: this.totalOperations
      });

      // 设置下次恢复测试时间
      this.scheduleRecoveryTest();

      // 通知健康状态变化
      this.options.onHealthChange(false);
    }
  }

  /**
   * 安排恢复测试
   */
  private scheduleRecoveryTest(): void {
    this.nextRecoveryTestAt = new Date(Date.now() + this.options.recoveryTestInterval);

    this.logger.info("Scheduled repository recovery test", {
      nextTestAt: this.nextRecoveryTestAt.toISOString(),
      intervalMs: this.options.recoveryTestInterval
    });

    // 清除旧的定时器
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    // 设置新的恢复定时器
    this.recoveryTimer = setTimeout(() => {
      this.logger.info("Attempting repository recovery test");
      // 恢复测试不会自动执行，需要外部调用 testRecovery()
      // 这里只是通知下次可以尝试了
      delete this.nextRecoveryTestAt;
    }, this.options.recoveryTestInterval);
  }

  /**
   * 手动测试恢复（由外部调用）
   */
  async testRecovery(testFn: () => Promise<void>): Promise<boolean> {
    if (this.healthy) {
      // 已经健康，无需测试
      return true;
    }

    this.logger.info("Testing repository recovery");

    try {
      await testFn();

      // 测试成功，记录为成功操作（会自动恢复健康状态）
      this.recordSuccess();
      return true;
    } catch (error) {
      // 测试失败，安排下次测试
      this.logger.warn("Repository recovery test failed", {
        error: error instanceof Error ? error.message : String(error)
      });

      this.scheduleRecoveryTest();
      return false;
    }
  }

  /**
   * 检查是否健康
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * 获取健康状态快照
   */
  getStatus(): RepositoryHealthStatus {
    const base: RepositoryHealthStatus = {
      healthy: this.healthy,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.options.maxFailures,
      totalOperations: this.totalOperations,
      totalFailures: this.totalFailures,
    };
    if (this.lastFailureAt) {
      (base as any).lastFailureAt = this.lastFailureAt.toISOString();
    }
    if (this.lastError) {
      (base as any).lastError = this.lastError;
    }
    if (this.nextRecoveryTestAt) {
      (base as any).nextRecoveryTestAt = this.nextRecoveryTestAt.toISOString();
    }
    return base;
  }

  /**
   * 手动重置健康状态（用于测试或管理员干预）
   */
  reset(): void {
    this.healthy = true;
    this.consecutiveFailures = 0;
    this.totalOperations = 0;
    this.totalFailures = 0;
    delete this.lastFailureAt;
    delete this.lastError;
    delete this.nextRecoveryTestAt;

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      delete this.recoveryTimer;
    }

    this.logger.info("Repository health monitor reset");
    this.options.onHealthChange(true);
  }

  /**
   * 清理资源（停止恢复定时器）
   */
  close(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      delete this.recoveryTimer;
    }
  }
}
