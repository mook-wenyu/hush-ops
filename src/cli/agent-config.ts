import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { AgentConfigSchema } from "../agents/config/schema.js";
import { loadAgentConfigs } from "../agents/config/loader.js";
import type { AgentConfig } from "../agents/config/types.js";

export interface GenerateConfigOptions {
  id: string;
  modulePath: string;
  registerExport?: string;
  ensureExport?: string;
  registerOptions?: Record<string, unknown>;
  defaultAgentOptions?: Record<string, unknown>;
  defaultRunOptions?: Record<string, unknown>;
  metadata?: {
    label?: string;
    description?: string;
    tags?: string[];
  };
  configVersion?: string;
  directory?: string;
  output?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface ListConfigOptions {
  directory?: string;
}

export async function generateConfig(options: GenerateConfigOptions): Promise<string> {
  const {
    id,
    modulePath,
    registerExport,
    ensureExport,
    registerOptions,
    defaultAgentOptions,
    defaultRunOptions,
    metadata,
    configVersion = "v1",
    directory = "agents-config",
    output,
    dryRun,
    force
  } = options;

  const registerBlock = {
    export: registerExport ?? "registerAgentPlugin",
    options: registerOptions
  };

  const ensureBlock = ensureExport ? { export: ensureExport } : undefined;

  const config: AgentConfig = {
    id,
    module: modulePath,
    register: registerBlock,
    ensure: ensureBlock,
    defaultAgentOptions,
    defaultRunOptions,
    metadata,
    configVersion
  };

  const parsed = AgentConfigSchema.parse(config);
  const serialized = JSON.stringify(parsed, null, 2);

  if (dryRun) {
    return `${serialized}\n`;
  }

  const absoluteDir = path.resolve(directory);
  await ensureDirectory(absoluteDir);

  const outputPath = output ? path.resolve(output) : path.join(absoluteDir, `${id}.json`);
  if (!force && (await fileExists(outputPath))) {
    throw new Error(`配置文件已存在：${outputPath}，使用 --force 可覆盖。`);
  }

  await writeFile(outputPath, `${serialized}\n`, "utf-8");
  return outputPath;
}

export async function listConfigs(options: ListConfigOptions = {}): Promise<string[]> {
  const configs = await loadAgentConfigs({ directory: options.directory });
  if (configs.length === 0) {
    return [];
  }

  return configs.map((item) => {
    const { id, module: moduleField, metadata } = item.config;
    const parts: string[] = [];
    if (metadata?.label) {
      parts.push(`label=${metadata.label}`);
    }
    if (metadata?.description) {
      parts.push(`desc=${metadata.description}`);
    }
    const summary = parts.length ? ` (${parts.join(", ")})` : "";
    return `- ${id}: ${moduleField}${summary}`;
  });
}

export function parseJsonOption(value: string | boolean | undefined, flagName: string) {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`无法解析 --${flagName} 提供的 JSON：${(error as Error).message}`);
  }
}

export function parseTags(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureDirectory(directory: string) {
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw new Error(`创建目录失败：${directory}`, { cause: error });
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
