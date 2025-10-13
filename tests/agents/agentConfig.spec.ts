import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { registerConfiguredAgents, loadAgentConfigs } from "../../src/agents/config/loader.js";
import { clearAgentPlugins, getAgentPlugin } from "../../src/agents/registry.js";

const TEMP_PREFIX = path.join(tmpdir(), "agents-config-");

async function createTempConfig(content: Record<string, unknown>) {
  const directory = await mkdtemp(TEMP_PREFIX);
  const filePath = path.join(directory, `${content.id as string}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");
  return { directory, filePath };
}

afterEach(() => {
  clearAgentPlugins();
});

describe("agent config loader", () => {
  it("registers plugin defined in configuration", async () => {
    const modulePath = path.resolve("src/agents/plugins/demandAnalysis.ts");
    const config = {
      id: "demand-analysis",
      module: modulePath,
      register: {
        export: "registerDemandAnalysisPlugin",
        options: { replace: true }
      },
      ensure: { export: "ensureDemandAnalysisPlugin" },
      defaultAgentOptions: { name: "测试需求分析", useChatCompletions: true },
      defaultRunOptions: { context: { projectName: "测试项目" } },
      configVersion: "v1"
    } satisfies Record<string, unknown>;

    const { directory } = await createTempConfig(config);

    const results = await registerConfiguredAgents({ directory });
    expect(results).toHaveLength(1);

    const plugin = getAgentPlugin("demand-analysis");
    const agent = plugin.createAgent(config.defaultAgentOptions as Record<string, unknown>);
    expect(agent).toBeDefined();
  });

  it("throws error for invalid configuration", async () => {
    const badConfig = {
      id: "broken",
      module: 123,
      configVersion: "v1"
    } satisfies Record<string, unknown>;

    const { directory } = await createTempConfig(badConfig);

    await expect(registerConfiguredAgents({ directory })).rejects.toThrow(/配置文件不符合 Schema/);
  });

  it("returns empty array when directory missing", async () => {
    const configs = await loadAgentConfigs({ directory: path.join(TEMP_PREFIX, "missing") });
    expect(configs).toHaveLength(0);
  });
});
