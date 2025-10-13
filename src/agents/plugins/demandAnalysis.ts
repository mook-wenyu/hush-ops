import { Agent, run, type ModelSettings } from "@openai/agents";
import { z } from "zod";

import { ensureAgentPlugin, registerAgentPlugin } from "../registry.js";
import type { AgentPlugin, AgentRunOptions } from "./types.js";
import type { OpenAIAPIMode } from "../../utils/openaiApiMode.js";
import { enqueueOpenAITask } from "../../utils/openaiModeQueue.js";

/**
 * 需求条目结构，约束输出字段的语义与格式。
 */
export const RequirementItemSchema = z.object({
  id: z.string().min(1, "必须提供需求标识"),
  title: z.string().min(1, "必须提供需求名称"),
  description: z.string().min(1, "需要概述需求要点"),
  category: z.string().min(1, "需要标明分类"),
  priority: z
    .string()
    .min(1, "需要标识优先级，例如 must-have/should-have/could-have"),
  dependencies: z.array(z.string()).optional().default([]),
  risks: z.array(z.string()).optional().default([]),
  acceptanceCriteria: z.array(z.string()).optional().default([])
});

/**
 * 智能体最终产出的需求分析总结构。
 */
export const DemandAnalysisSchema = z.object({
  summary: z.string().min(1, "必须提供整体总结"),
  keyObjectives: z.array(z.string()).optional().default([]),
  requirements: z.array(RequirementItemSchema),
  unclearPoints: z.array(z.string()).optional().default([]),
  assumptions: z.array(z.string()).optional().default([]),
  nextActions: z.array(z.string()).optional().default([])
});

export type DemandAnalysis = z.infer<typeof DemandAnalysisSchema>;

export type DemandAnalysisAgent = Agent<DemandAnalysisContext, typeof DemandAnalysisSchema>;

type ReasoningEffortLevel = "minimal" | "low" | "medium" | "high" | null;

const PREFERRED_API_MODE = Symbol("preferredApiMode");

type AgentWithPreferredApi = DemandAnalysisAgent & {
  [PREFERRED_API_MODE]?: OpenAIAPIMode;
};

export interface DemandAnalysisContext {
  projectName?: string;
  stakeholders?: string[];
  targetWindow?: string;
  strategicGoals?: string[];
}

export interface DemandAnalysisAgentOptions {
  model?: string;
  temperature?: number;
  name?: string;
  reasoningEffort?: ReasoningEffortLevel;
  modelSettings?: ModelSettings;
  useChatCompletions?: boolean;
}

export type DemandAnalysisRunOptions = AgentRunOptions<
  DemandAnalysisAgent,
  { context?: DemandAnalysisContext }
>;

function mergeModelSettings(
  defaults: ModelSettings,
  overrides?: ModelSettings
): ModelSettings {
  if (!overrides) {
    return defaults;
  }

  return {
    ...defaults,
    ...overrides,
    reasoning: {
      ...defaults.reasoning,
      ...overrides.reasoning
    },
    text: {
      ...defaults.text,
      ...overrides.text
    }
  };
}

const BASE_INSTRUCTIONS = `你是一名经验丰富的需求分析专家，擅长从冗长的用户输入中提炼可执行的产品与技术需求。请严格遵循以下约束：
1. 首先用中文梳理用户提供材料中的项目目标、核心业务流程、关键用户或系统角色。
2. 针对每一条明确的需求，补全需求标识、需求名称、详细描述、所属分类、优先级、潜在风险与验收标准。分类可结合业务领域或系统模块，自定其名但需保持一致。
3. 如果材料中存在假设、前提、外部依赖，需在 "assumptions" 中列出，以便后续确认。
4. 对所有模糊、冲突、缺失的信息在 "unclearPoints" 中提出具体提问，确保后续可以直接与需求方沟通。
5. 请给出建议的下一步行动（如补充调研、原型验证），写入 "nextActions"。
6. 输出仅能包含 JSON 结构体，字段需与约定 schema 完全一致且使用中文内容。不得额外添加自然语言段落。
7. 若用户输入混合多语言，请优先用中文概括需求；如输入完全为英文，可在保留关键词的同时给出中文解释。
`;

export function createDemandAnalysisAgent(
  options: DemandAnalysisAgentOptions = {}
): DemandAnalysisAgent {
  const defaultModelSettings: ModelSettings = {
    reasoning: { effort: options.reasoningEffort ?? "high" }
  };

  if (options.temperature !== undefined) {
    defaultModelSettings.temperature = options.temperature;
  }

  const mergedModelSettings = mergeModelSettings(
    defaultModelSettings,
    options.modelSettings
  );

  const agent = new Agent<DemandAnalysisContext, typeof DemandAnalysisSchema>({
    name: options.name ?? "需求分析示例智能体",
    instructions: BASE_INSTRUCTIONS,
    model: options.model ?? "gpt-5",
    modelSettings: mergedModelSettings,
    outputType: DemandAnalysisSchema
  });

  const preferredApi: OpenAIAPIMode =
    options.useChatCompletions === false ? "responses" : "chat_completions";
  (agent as AgentWithPreferredApi)[PREFERRED_API_MODE] = preferredApi;

  return agent;
}

function buildPrompt(document: string, context?: DemandAnalysisContext) {
  const headerLines: string[] = [];

  if (context?.projectName) {
    headerLines.push(`项目名称：${context.projectName}`);
  }
  if (context?.stakeholders?.length) {
    headerLines.push(`核心干系人：${context.stakeholders.join("，")}`);
  }
  if (context?.targetWindow) {
    headerLines.push(`目标交付窗口：${context.targetWindow}`);
  }
  if (context?.strategicGoals?.length) {
    headerLines.push(`战略目标：${context.strategicGoals.join("，")}`);
  }

  const header = headerLines.length
    ? `${headerLines.join("\n")}\n\n—— 以下为原始需求文档 ——\n`
    : "—— 以下为原始需求文档 ——\n";

  return `${header}${document.trim()}`;
}

export async function runDemandAnalysis(
  document: string,
  options: DemandAnalysisRunOptions = {}
): Promise<DemandAnalysis> {
  if (!document || document.trim().length === 0) {
    throw new Error("需求文档内容为空，请提供有效的需求文本。");
  }

  const agent = options.agent ?? createDemandAnalysisAgent();
  const prompt = buildPrompt(document, options.context);

  const preferredApi =
    (agent as AgentWithPreferredApi)[PREFERRED_API_MODE] ?? "chat_completions";

  const result = await enqueueOpenAITask(preferredApi, () => run(agent, prompt));

  if (!result.finalOutput) {
    throw new Error("智能体未返回结构化结果，请检查输入或模型配置");
  }
  return result.finalOutput;
}

export const demandAnalysisPlugin: AgentPlugin<
  string,
  DemandAnalysisAgent,
  DemandAnalysis,
  DemandAnalysisAgentOptions,
  DemandAnalysisRunOptions
> = {
  id: "demand-analysis",
  label: "需求分析示例智能体",
  description: "默认示例，展示如何将 AI 智能体作为插件注册到混合编排平台。",
  createAgent: createDemandAnalysisAgent,
  run: runDemandAnalysis
};

export function registerDemandAnalysisPlugin(options?: { replace?: boolean }): void {
  registerAgentPlugin(demandAnalysisPlugin, options);
}

export function ensureDemandAnalysisPlugin() {
  return ensureAgentPlugin(demandAnalysisPlugin.id, () => demandAnalysisPlugin);
}
