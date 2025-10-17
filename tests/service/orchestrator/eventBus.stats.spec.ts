import { describe, it, expect } from "vitest";
import { createOrchestratorService, getEventBusStats } from "../../../src/service/orchestrator/server.js";

// 轻量断言：server 暴露统计函数并返回包含 dropped 与 bufferBytesLimit

describe("event bus stats", () => {
  it("exposes dropped counter", async () => {
    const svc = await createOrchestratorService();
    expect(typeof getEventBusStats().dropped).toBe("number");
    expect(getEventBusStats().bufferBytesLimit).toBeGreaterThan(0);
    // 关闭服务以清理
    (svc.app as any).close?.();
  });
});
