import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMock: vi.fn(),
  enqueueOpenAITaskMock: vi.fn(async (_mode: string, task: () => Promise<unknown>) => task())
}));

vi.mock("@openai/agents", () => {
  return {
    Agent: class {
      public options: Record<string, unknown>;

      constructor(options: Record<string, unknown>) {
        this.options = options;
      }
    },
    run: mocks.runMock
  };
});

vi.mock("../../src/utils/openaiModeQueue.js", () => ({
  enqueueOpenAITask: mocks.enqueueOpenAITaskMock
}));

import {
  ensureDemandAnalysisPlugin,
  createDemandAnalysisAgent,
  runDemandAnalysis,
  demandAnalysisPlugin
} from "../../src/agents/plugins/demandAnalysis.js";
import { clearAgentPlugins, getAgentPlugin } from "../../src/agents/registry.js";

const { runMock, enqueueOpenAITaskMock } = mocks;

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
    enqueueOpenAITaskMock.mockReset();
    enqueueOpenAITaskMock.mockImplementation(async (_mode, task) => task());
  });

  it("ensure 后可通过注册表获取插件", () => {
    const plugin = getAgentPlugin("demand-analysis");
    expect(plugin.label).toBe("需求分析示例智能体");
  });

  it("空文档应抛出错误", async () => {
    await expect(runDemandAnalysis("", {})).rejects.toThrow("需求文档内容为空");
    expect(runMock).not.toHaveBeenCalled();
    expect(enqueueOpenAITaskMock).not.toHaveBeenCalled();
  });

  it("默认应使用 Chat Completions 并返回结构化结果", async () => {
    const result = await runDemandAnalysis("有效需求", {});

    expect(result).toEqual(SAMPLE_OUTPUT);
    expect(enqueueOpenAITaskMock).toHaveBeenCalledTimes(1);
    expect(enqueueOpenAITaskMock).toHaveBeenCalledWith(
      "chat_completions",
      expect.any(Function)
    );
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("禁用 Chat Completions 时应切换到 Responses 模式", async () => {
    const agent = createDemandAnalysisAgent({ useChatCompletions: false });
    await runDemandAnalysis("另一个需求", { agent });

    expect(enqueueOpenAITaskMock).toHaveBeenCalledWith(
      "responses",
      expect.any(Function)
    );
  });
});