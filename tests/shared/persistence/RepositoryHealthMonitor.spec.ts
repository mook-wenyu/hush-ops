import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RepositoryHealthMonitor } from "../../../src/shared/persistence/RepositoryHealthMonitor.js";

describe("RepositoryHealthMonitor", () => {
  let monitor: RepositoryHealthMonitor;
  let onHealthChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onHealthChange = vi.fn();
  });

  afterEach(() => {
    if (monitor) {
      monitor.close();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("初始化和基本状态", () => {
    it("初始状态应为健康", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });

      expect(monitor.isHealthy()).toBe(true);
      expect(monitor.getStatus()).toMatchObject({
        healthy: true,
        consecutiveFailures: 0,
        totalOperations: 0,
        totalFailures: 0
      });
    });

    it("应使用默认配置", () => {
      monitor = new RepositoryHealthMonitor({});

      const status = monitor.getStatus();
      expect(status.maxFailures).toBe(3);
      expect(monitor.isHealthy()).toBe(true);
    });

    it("应使用自定义配置", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 5,
        recoveryTestInterval: 30000
      });

      const status = monitor.getStatus();
      expect(status.maxFailures).toBe(5);
    });
  });

  describe("成功操作记录", () => {
    beforeEach(() => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });
    });

    it("记录成功应增加总操作数", () => {
      monitor.recordSuccess();

      const status = monitor.getStatus();
      expect(status.totalOperations).toBe(1);
      expect(status.totalFailures).toBe(0);
      expect(status.consecutiveFailures).toBe(0);
    });

    it("多次成功应累计总操作数", () => {
      monitor.recordSuccess();
      monitor.recordSuccess();
      monitor.recordSuccess();

      const status = monitor.getStatus();
      expect(status.totalOperations).toBe(3);
    });

    it("健康状态下记录成功不应触发回调", () => {
      monitor.recordSuccess();

      expect(onHealthChange).not.toHaveBeenCalled();
    });
  });

  describe("失败操作记录", () => {
    beforeEach(() => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });
    });

    it("记录失败应增加计数", () => {
      const error = new Error("Test error");
      monitor.recordFailure(error);

      const status = monitor.getStatus();
      expect(status.totalOperations).toBe(1);
      expect(status.totalFailures).toBe(1);
      expect(status.consecutiveFailures).toBe(1);
      expect(status.lastError).toBe("Test error");
      expect(status.lastFailureAt).toBeDefined();
    });

    it("连续失败应累计", () => {
      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));

      const status = monitor.getStatus();
      expect(status.consecutiveFailures).toBe(2);
      expect(status.totalFailures).toBe(2);
    });

    it("失败后成功应重置连续失败计数", () => {
      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));
      monitor.recordSuccess();

      const status = monitor.getStatus();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.totalFailures).toBe(2);
      expect(status.totalOperations).toBe(3);
    });
  });

  describe("降级触发", () => {
    it("达到失败阈值应触发降级", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));
      expect(monitor.isHealthy()).toBe(true);
      expect(onHealthChange).not.toHaveBeenCalled();

      monitor.recordFailure(new Error("Error 3"));

      expect(monitor.isHealthy()).toBe(false);
      expect(onHealthChange).toHaveBeenCalledWith(false);
      expect(onHealthChange).toHaveBeenCalledTimes(1);
    });

    it("降级后应设置下次恢复测试时间", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));

      const status = monitor.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.nextRecoveryTestAt).toBeDefined();
    });

    it("降级后继续失败不应重复触发回调", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));
      monitor.recordFailure(new Error("Error 3"));

      expect(onHealthChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("恢复机制", () => {
    it("降级后成功应触发恢复", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        onHealthChange
      });

      // 触发降级
      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));
      expect(monitor.isHealthy()).toBe(false);
      expect(onHealthChange).toHaveBeenCalledWith(false);

      // 恢复
      onHealthChange.mockClear();
      monitor.recordSuccess();

      expect(monitor.isHealthy()).toBe(true);
      expect(onHealthChange).toHaveBeenCalledWith(true);

      const status = monitor.getStatus();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.nextRecoveryTestAt).toBeUndefined();
    });

    it("testRecovery成功应触发恢复", async () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        onHealthChange
      });

      // 触发降级
      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));
      onHealthChange.mockClear();

      // 恢复测试成功
      const testFn = vi.fn().mockResolvedValue(undefined);
      const recovered = await monitor.testRecovery(testFn);

      expect(recovered).toBe(true);
      expect(monitor.isHealthy()).toBe(true);
      expect(onHealthChange).toHaveBeenCalledWith(true);
    });

    it("testRecovery失败应保持降级", async () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));
      onHealthChange.mockClear();

      const testFn = vi.fn().mockRejectedValue(new Error("Still failing"));
      const recovered = await monitor.testRecovery(testFn);

      expect(recovered).toBe(false);
      expect(monitor.isHealthy()).toBe(false);
      expect(onHealthChange).not.toHaveBeenCalled();
    });
  });

  describe("恢复定时器", () => {
    it("降级后应安排恢复测试", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      const beforeTime = Date.now();
      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));

      const status = monitor.getStatus();
      const expectedTime = beforeTime + 60000;

      expect(status.nextRecoveryTestAt).toBeDefined();
      const nextTestTime = new Date(status.nextRecoveryTestAt!).getTime();
      expect(nextTestTime).toBeGreaterThanOrEqual(expectedTime);
    });

    it("恢复后应取消定时器", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));
      expect(monitor.getStatus().nextRecoveryTestAt).toBeDefined();

      monitor.recordSuccess();
      expect(monitor.getStatus().nextRecoveryTestAt).toBeUndefined();
    });

    it("定时器到期应清除nextRecoveryTestAt", async () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));
      expect(monitor.getStatus().nextRecoveryTestAt).toBeDefined();

      // 等待定时器到期
      await vi.advanceTimersByTimeAsync(60000);

      expect(monitor.getStatus().nextRecoveryTestAt).toBeUndefined();
    });
  });

  describe("reset方法", () => {
    it("reset应重置所有状态", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error 1"));
      monitor.recordFailure(new Error("Error 2"));
      monitor.recordSuccess();

      monitor.reset();

      const status = monitor.getStatus();
      expect(status.healthy).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.totalOperations).toBe(0);
      expect(status.totalFailures).toBe(0);
      expect(status.lastError).toBeUndefined();
      expect(status.lastFailureAt).toBeUndefined();
    });

    it("reset应取消恢复定时器", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));

      monitor.reset();

      expect(monitor.getStatus().nextRecoveryTestAt).toBeUndefined();
    });
  });

  describe("close方法", () => {
    it("close应清理定时器资源", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 60000,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));

      monitor.close();

      // close后状态仍然可读
      const status = monitor.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe("边界条件", () => {
    it("maxFailures=1 应在第一次失败时降级", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 1,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));

      expect(monitor.isHealthy()).toBe(false);
      expect(onHealthChange).toHaveBeenCalledWith(false);
    });

    it("maxFailures=0 应视为1", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 0,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));

      expect(monitor.isHealthy()).toBe(false);
    });

    it("recoveryTestInterval=0 应立即清除", async () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 2,
        recoveryTestInterval: 0,
        onHealthChange
      });

      monitor.recordFailure(new Error("Error"));
      monitor.recordFailure(new Error("Error"));

      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getStatus().nextRecoveryTestAt).toBeUndefined();
    });
  });

  describe("并发安全", () => {
    it("多线程同时记录应正确累计", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 10,
        onHealthChange
      });

      // 模拟并发操作
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(monitor.recordSuccess());
      }
      for (let i = 0; i < 3; i++) {
        operations.push(monitor.recordFailure(new Error(`Error ${i}`)));
      }

      const status = monitor.getStatus();
      expect(status.totalOperations).toBe(8);
      expect(status.totalFailures).toBe(3);
      expect(status.consecutiveFailures).toBe(3);
    });
  });

  describe("错误信息记录", () => {
    it("应记录最后一次错误信息", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });

      monitor.recordFailure(new Error("First error"));
      monitor.recordFailure(new Error("Second error"));

      const status = monitor.getStatus();
      expect(status.lastError).toBe("Second error");
    });

    it("应记录最后失败时间", () => {
      monitor = new RepositoryHealthMonitor({
        maxFailures: 3,
        onHealthChange
      });

      const beforeTime = Date.now();
      monitor.recordFailure(new Error("Error"));

      const status = monitor.getStatus();
      expect(status.lastFailureAt).toBeDefined();

      const failureTime = new Date(status.lastFailureAt!).getTime();
      expect(failureTime).toBeGreaterThanOrEqual(beforeTime);
    });
  });
});
