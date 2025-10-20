import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryWithBackoff } from "../../../src/shared/retry/retryWithBackoff.js";

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("成功场景", () => {
    it("第一次调用成功应立即返回结果", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const promise = retryWithBackoff(fn, { retries: 3 });
      const result = await promise;

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("第二次重试成功应返回结果", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createTransientError("EBUSY"))
        .mockResolvedValueOnce("success");

      const promise = retryWithBackoff(fn, { retries: 3, baseDelay: 100 });

      // 等待第一次失败
      await vi.advanceTimersByTimeAsync(0);

      // 等待第一次重试延迟
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("多次重试后成功", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createTransientError("EAGAIN"))
        .mockRejectedValueOnce(createTransientError("EBUSY"))
        .mockResolvedValueOnce("success");

      const promise = retryWithBackoff(fn, { retries: 3, baseDelay: 100 });

      // 第一次失败
      await vi.advanceTimersByTimeAsync(0);
      // 第一次重试延迟 (100ms)
      await vi.advanceTimersByTimeAsync(100);
      // 第二次失败
      await vi.advanceTimersByTimeAsync(0);
      // 第二次重试延迟 (200ms)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe("失败场景", () => {
    it("达到最大重试次数应抛出错误", async () => {
      const error = createTransientError("EBUSY");
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, { retries: 2, baseDelay: 100 });

      // 第一次调用失败
      await vi.advanceTimersByTimeAsync(0);
      // 第一次重试延迟 (100ms)
      await vi.advanceTimersByTimeAsync(100);
      // 第二次重试延迟 (200ms)
      await vi.advanceTimersByTimeAsync(200);

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2次重试
    });

    it("非瞬态错误应立即失败不重试", async () => {
      const error = new Error("ENOENT: no such file or directory");
      (error as NodeJS.ErrnoException).code = "ENOENT";
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { retries: 3 })).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1); // 只调用一次，不重试
    });

    it("业务逻辑错误应立即失败", async () => {
      const error = new Error("Validation failed");
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { retries: 3 })).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("指数退避延迟", () => {
    it("延迟应按指数增长", async () => {
      const delays: number[] = [];
      const error = createTransientError("EBUSY");
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, { retries: 3, baseDelay: 100 });

      const startTime = Date.now();

      // 第一次调用失败
      await vi.advanceTimersByTimeAsync(0);
      delays.push(Date.now() - startTime);

      // 第一次重试延迟 (100ms)
      await vi.advanceTimersByTimeAsync(100);
      delays.push(Date.now() - startTime);

      // 第二次重试延迟 (200ms)
      await vi.advanceTimersByTimeAsync(200);
      delays.push(Date.now() - startTime);

      // 第三次重试延迟 (400ms)
      await vi.advanceTimersByTimeAsync(400);
      delays.push(Date.now() - startTime);

      await expect(promise).rejects.toThrow();

      // 验证延迟模式：0, 100, 300, 700
      expect(delays[0]).toBe(0); // 第一次调用
      expect(delays[1]).toBe(100); // baseDelay * 2^0
      expect(delays[2]).toBe(300); // baseDelay * 2^0 + baseDelay * 2^1
      expect(delays[3]).toBe(700); // 累计: 100 + 200 + 400
    });

    it("自定义baseDelay应生效", async () => {
      const error = createTransientError("EAGAIN");
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, { retries: 2, baseDelay: 50 });

      await vi.advanceTimersByTimeAsync(0); // 第一次失败
      await vi.advanceTimersByTimeAsync(50); // 第一次重试延迟
      await vi.advanceTimersByTimeAsync(100); // 第二次重试延迟

      await expect(promise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe("瞬态错误识别", () => {
    const transientErrorCodes = ["EBUSY", "EPERM", "EAGAIN", "EMFILE", "ENFILE"];

    transientErrorCodes.forEach((code) => {
      it(`应该重试 ${code} 错误`, async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(createTransientError(code))
          .mockResolvedValueOnce("success");

        const promise = retryWithBackoff(fn, { retries: 3, baseDelay: 100 });

        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    const nonTransientErrorCodes = ["ENOENT", "EISDIR", "ENOTDIR"];

    nonTransientErrorCodes.forEach((code) => {
      it(`不应重试 ${code} 错误`, async () => {
        const error = new Error(`${code} error`);
        (error as NodeJS.ErrnoException).code = code;
        const fn = vi.fn().mockRejectedValue(error);

        await expect(retryWithBackoff(fn, { retries: 3 })).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("边界条件", () => {
    it("maxRetries=0 应只调用一次", async () => {
      const error = createTransientError("EBUSY");
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { retries: 0 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("maxRetries=1 应最多调用两次", async () => {
      const error = createTransientError("EBUSY");
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, { retries: 1, baseDelay: 100 });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      await expect(promise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("baseDelay=0 应立即重试", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createTransientError("EBUSY"))
        .mockResolvedValueOnce("success");

      const promise = retryWithBackoff(fn, { retries: 3, baseDelay: 0 });

      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("并发调用", () => {
    it("多个并发调用应独立重试", async () => {
      const fn1 = vi
        .fn()
        .mockRejectedValueOnce(createTransientError("EBUSY"))
        .mockResolvedValueOnce("result1");

      const fn2 = vi
        .fn()
        .mockRejectedValueOnce(createTransientError("EAGAIN"))
        .mockResolvedValueOnce("result2");

      const promise1 = retryWithBackoff(fn1, { retries: 2, baseDelay: 100 });
      const promise2 = retryWithBackoff(fn2, { retries: 2, baseDelay: 100 });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe("result1");
      expect(result2).toBe("result2");
      expect(fn1).toHaveBeenCalledTimes(2);
      expect(fn2).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * 创建模拟的瞬态错误
 */
function createTransientError(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code} error`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}
