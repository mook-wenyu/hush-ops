/**
 * 重试机制工具模块
 * 
 * 提供指数退避重试策略,用于Repository层持久化操作的容错
 * 
 * 特性:
 * - 指数退避算法(exponential backoff)
 * - 可配置重试次数和基础延迟
 * - onFailedAttempt回调用于日志记录
 * - 支持自定义重试条件判断
 */

import { createLoggerFacade } from "../logging/logger.js";

const logger = createLoggerFacade("retry");

export interface RetryOptions {
  /**
   * 最大重试次数,默认3次
   */
  retries?: number;

  /**
   * 基础延迟时间(ms),默认100ms
   * 每次重试延迟为: baseDelay * 2^attemptNumber
   */
  baseDelay?: number;

  /**
   * 失败尝试的回调
   */
  onFailedAttempt?: (params: {
    error: Error;
    attemptNumber: number;
    retriesLeft: number;
  }) => void;

  /**
   * 自定义重试条件判断
   * 返回true表示应该重试,false表示立即失败
   */
  shouldRetry?: (params: {
    error: Error;
    attemptNumber: number;
    retriesLeft: number;
  }) => boolean;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 计算指数退避延迟时间
 */
function calculateBackoff(attemptNumber: number, baseDelay: number): number {
  return baseDelay * Math.pow(2, attemptNumber - 1);
}

/**
 * 使用指数退避策略重试异步操作
 * 
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   async () => repository.create(data),
 *   {
 *     retries: 3,
 *     baseDelay: 100,
 *     onFailedAttempt: ({ attemptNumber, retriesLeft }) => {
 *       logger.warn(`Attempt ${attemptNumber} failed, ${retriesLeft} retries left`);
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelay = 100,
    onFailedAttempt,
    shouldRetry = () => true
  } = options;

  let lastError: Error | undefined;
  
  for (let attemptNumber = 1; attemptNumber <= retries + 1; attemptNumber++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      
      const retriesLeft = retries + 1 - attemptNumber;
      
      // 最后一次尝试失败,直接抛出
      if (retriesLeft === 0) {
        throw err;
      }

      // 检查是否应该重试
      if (!shouldRetry({ error: err, attemptNumber, retriesLeft })) {
        throw err;
      }

      // 调用失败回调
      if (onFailedAttempt) {
        onFailedAttempt({ error: err, attemptNumber, retriesLeft });
      } else {
        // 默认日志
        logger.warn("Operation failed, retrying", {
          attemptNumber,
          retriesLeft,
          error: err.message
        });
      }

      // 计算延迟时间并等待
      const delayMs = calculateBackoff(attemptNumber, baseDelay);
      await delay(delayMs);
    }
  }

  // 理论上不会到达这里,但为了类型安全
  throw lastError ?? new Error("Retry failed with unknown error");
}

/**
 * 创建可重试的函数
 * 
 * 将普通异步函数包装为自动重试的版本
 * 
 * @example
 * ```ts
 * const retriableCreate = makeRetriable(
 *   async (data) => repository.create(data),
 *   { retries: 3, baseDelay: 100 }
 * );
 * 
 * const result = await retriableCreate(someData);
 * ```
 */
export function makeRetriable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}
