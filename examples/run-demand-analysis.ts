import { readFile } from "node:fs/promises";
import process from "node:process";

import { configureDefaultOpenAIClient } from "../src/utils/openaiClient.js";
import { registerConfiguredAgents } from "../src/agents/config/index.js";
import { ensureDemandAnalysisPlugin } from "../src/agents/plugins/demandAnalysis.js";
import { getAgentPlugin } from "../src/agents/registry.js";
import type { DemandAnalysisContext, DemandAnalysisRunOptions } from "../src/agents/plugins/demandAnalysis.js";

interface CliInput {
  mode: "file" | "text" | "sample";
  payload?: string;
}

/**
 * 如果未提供文件，则使用内建示例文档。
 */
function buildSampleDocument(): string {
  return `项目背景：
- 公司计划发布新版企业需求管理平台，提高需求梳理效率，减少需求遗漏。
- 目标用户为产品经理、项目经理与业务分析师。

核心诉求：
1. 允许团队上传需求文档并自动拆分结构化条目；
2. 能够标记优先级与风险，并导出到项目管理工具；
3. 支持生成后续沟通问题清单，确保需求确认。

约束：
- 需与现有的 OKR 系统对接；
- 首个版本希望在三个月内上线内测。`;
}

function parseCliInput(): CliInput {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return { mode: "sample" };
  }

  const [first, ...rest] = args;
  if (first === "--text" || first === "-t") {
    const text = rest.join(" ").trim();
    if (!text) {
      console.error("使用 --text 需要提供需求内容，例如: npm run dev -- --text \"项目目标...\"");
      process.exitCode = 1;
      process.exit();
    }
    return { mode: "text", payload: text };
  }

  if (first === "--file" || first === "-f") {
    const filePath = rest[0];
    if (!filePath) {
      console.error("使用 --file 需要提供文件路径，例如: npm run dev -- --file ./samples/demo.md");
      process.exitCode = 1;
      process.exit();
    }
    return { mode: "file", payload: filePath };
  }

  return { mode: "file", payload: first };
}

async function loadDocument(input: CliInput): Promise<string> {
  if (input.mode === "text" && input.payload) {
    return input.payload;
  }

  if (input.mode === "file" && input.payload) {
    try {
      const content = await readFile(input.payload, "utf-8");
      return content;
    } catch (error) {
      console.error(`读取文件失败：${input.payload}`);
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      process.exit();
    }
  }

  return buildSampleDocument();
}

async function main() {
  const cliInput = parseCliInput();
  try {
    configureDefaultOpenAIClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "初始化 OpenAI 客户端时发生未知错误";
    console.error(message);
    process.exitCode = 1;
    return;
  }

  if (cliInput.mode === "file" && cliInput.payload) {
    console.log(
      `已启动需求分析示例，当前读取文件：${cliInput.payload}。如需切换，请重新运行并指定新的路径；按 Ctrl+C 可退出。`
    );
  } else if (cliInput.mode === "text") {
    console.log(
      "已启动需求分析示例，使用命令行传入的需求文本；如需改写内容请重新运行命令。按 Ctrl+C 可退出。"
    );
  } else {
    console.log(
      "已启动需求分析示例，默认使用内置 samples/demo.md。可通过 `npm run dev -- ./samples/demo.md` 或 `npm run dev -- --text \"项目目标...\"` 指定其他需求；按 Ctrl+C 可退出。"
    );
  }

  const document = await loadDocument(cliInput);
  const loadedConfigs = await registerConfiguredAgents({
    logger: {
      info: (msg) => console.log(msg)
    }
  });

  const demandConfig = loadedConfigs.find((item) => item.config.id === "demand-analysis");
  if (!demandConfig) {
    ensureDemandAnalysisPlugin();
  }

  const plugin = getAgentPlugin("demand-analysis");
  const defaultAgentOptions = demandConfig?.config.defaultAgentOptions as
    | Record<string, unknown>
    | undefined;
  const agent = plugin.createAgent(defaultAgentOptions);

  const defaultScriptContext: DemandAnalysisContext = {
    projectName: "需求分析专家演示",
    stakeholders: ["产品经理", "业务分析师"],
    targetWindow: "2025-Q1",
    strategicGoals: ["提高需求确认效率", "减少需求变更"]
  };

  const defaultRunOptions = (demandConfig?.config.defaultRunOptions ??
    {}) as DemandAnalysisRunOptions & Record<string, unknown>;
  const { context: configContext, agent: _configAgent, ...restRunOptions } = defaultRunOptions;
  void _configAgent;
  const mergedContext = {
    ...defaultScriptContext,
    ...(configContext as DemandAnalysisContext | undefined)
  };

  const runOptions: DemandAnalysisRunOptions = {
    ...(restRunOptions as DemandAnalysisRunOptions),
    agent,
    context: mergedContext
  };

  const analysis = await plugin.run(document, runOptions);

  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((error) => {
  console.error("执行需求分析时发生错误", error);
  process.exitCode = 1;
});
