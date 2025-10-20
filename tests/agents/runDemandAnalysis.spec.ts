import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMock: vi.fn()
}));

vi.mock("@openai/agents", () => {
  return {
    Agent: {
      create: vi.fn((options: Record<string, unknown>) => options)
    },
    run: mocks.runMock
  };
});

import {
  ensureDemandAnalysisPlugin,
  createDemandAnalysisAgent,
  runDemandAnalysis,
  demandAnalysisPlugin
} from "../../src/agents/plugins/demandAnalysis.js";
import { clearAgentPlugins, getAgentPlugin } from "../../src/agents/registry.js";

const { runMock } = mocks;

const SAMPLE_OUTPUT = {
  summary: "示例总结",
  requirements: [
    {
      id: "REQ-1",
      title: "标题",
      description: "说明",
      category: "功能",
      priority: "must-have",
      dependencies: [],
      risks: [],
      acceptanceCriteria: []
    }
  ],
  unclearPoints: [],
  assumptions: [],
  nextActions: []
};

describe("runDemandAnalysis", () => {
  beforeEach(() => {
    clearAgentPlugins();
    ensureDemandAnalysisPlugin();
    runMock.mockReset();
    runMock.mockResolvedValue({ finalOutput: SAMPLE_OUTPUT });
  });

  it("ensure 后可通过注册表获取插件", () => {
    const plugin = getAgentPlugin("demand-analysis");
    expect(plugin.label).toBe("需求分析示例智能体");
  });

  it("空文档应抛出错误", async () => {
    await expect(runDemandAnalysis("", {})).rejects.toThrow("需求文档内容为空");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("默认应返回结构化结果", async () => {
    const result = await runDemandAnalysis("有效需求", {});

    expect(result).toEqual(SAMPLE_OUTPUT);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("可使用自定义 Agent", async () => {
    const agent = createDemandAnalysisAgent({ model: "gpt-4o" });
    await runDemandAnalysis("另一个需求", { agent });

    expect(runMock).toHaveBeenCalledTimes(1);
  });
});