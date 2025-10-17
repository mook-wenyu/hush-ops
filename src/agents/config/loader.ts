import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { AgentConfigSchema } from "./schema.js";
import type {
  AgentConfig,
  LoadedAgentConfig,
  RegisterConfiguredAgentsOptions
} from "./types.js";
import { getHushOpsConfigDirectory } from "../../shared/environment/pathResolver.js";

const DEFAULT_DIRECTORY = path.join(getHushOpsConfigDirectory(), "agents");
const LEGACY_DIRECTORY = path.resolve(process.cwd(), "agents-config");

interface InternalConfig extends LoadedAgentConfig {
  readonly moduleSpecifier: string;
}

function resolveDirectory(customDirectory?: string): string {
  if (customDirectory) {
    return path.resolve(customDirectory);
  }
  return DEFAULT_DIRECTORY;
}

async function listConfigFiles(directory: string): Promise<string[]> {
  try {
    const stats = await stat(directory);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(directory, entry.name));
}

function buildError(filePath: string, message: string, cause?: unknown): Error {
  const error = new Error(`${message} (配置文件: ${filePath})`);
  if (cause) {
    (error as Error & { cause?: unknown }).cause = cause;
  }
  return error;
}

function deriveModuleUrl(moduleField: string, directory: string): string {
  if (path.isAbsolute(moduleField)) {
    return pathToFileURL(moduleField).href;
  }
  if (moduleField.startsWith(".") || moduleField.startsWith("/")) {
    const resolvedPath = path.resolve(directory, moduleField);
    return pathToFileURL(resolvedPath).href;
  }
  return moduleField;
}

async function parseConfigFile(filePath: string, directory: string): Promise<InternalConfig> {
  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (error) {
    throw buildError(filePath, "读取配置文件失败", error);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch (error) {
    throw buildError(filePath, "配置文件不是有效的 JSON", error);
  }

  let config: AgentConfig;
  try {
    config = AgentConfigSchema.parse(json);
  } catch (error) {
    throw buildError(filePath, "配置文件不符合 Schema", error);
  }

  const moduleUrl = deriveModuleUrl(config.module, directory);

  return {
    filePath,
    moduleUrl,
    moduleSpecifier: config.module,
    config
  };
}

export async function loadAgentConfigs(
  options: RegisterConfiguredAgentsOptions = {}
): Promise<LoadedAgentConfig[]> {
  let directory = resolveDirectory(options.directory);
  let files = await listConfigFiles(directory);
  if (files.length === 0 && !options.directory) {
    const legacyFiles = await listConfigFiles(LEGACY_DIRECTORY);
    if (legacyFiles.length > 0) {
      directory = LEGACY_DIRECTORY;
      files = legacyFiles;
    }
  }
  if (files.length === 0) {
    return [];
  }

  const configs = await Promise.all(files.map((file) => parseConfigFile(file, directory)));

  const filtered = options.filter
    ? configs.filter((item) => {
        try {
          return options.filter?.(item.config) ?? true;
        } catch (error) {
          options.logger?.warn?.(
            `过滤配置 ${path.basename(item.filePath)} 时发生错误: ${(error as Error).message}`
          );
          return false;
        }
      })
    : configs;

  return filtered.map(({ filePath, moduleUrl, config }) => ({ filePath, moduleUrl, config }));
}

async function importModule(moduleUrl: string) {
  return import(moduleUrl);
}

export async function registerConfiguredAgents(
  options: RegisterConfiguredAgentsOptions = {}
): Promise<LoadedAgentConfig[]> {
  const configs = await loadAgentConfigs(options);
  if (configs.length === 0) {
    options.logger?.info?.("未找到 agents-config 配置，跳过自动注册。");
    return [];
  }

  const results: LoadedAgentConfig[] = [];

  for (const item of configs) {
    const { filePath, moduleUrl, config } = item;

    let imported: Record<string, unknown>;
    try {
      imported = await importModule(moduleUrl);
    } catch (error) {
      throw buildError(filePath, `加载模块失败: ${config.module}`, error);
    }

    const registerBlock = config.register;
    const registerFn = imported[registerBlock.export];
    if (typeof registerFn !== "function") {
      throw buildError(
        filePath,
        `模块 ${config.module} 中不存在名为 ${registerBlock.export} 的导出函数`
      );
    }

    try {
      registerFn(registerBlock.options ?? {});
    } catch (error) {
      throw buildError(filePath, `调用 ${registerBlock.export} 时发生错误`, error);
    }

    if (config.ensure?.export) {
      const ensureFn = imported[config.ensure.export];
      if (typeof ensureFn !== "function") {
        throw buildError(
          filePath,
          `模块 ${config.module} 中不存在名为 ${config.ensure.export} 的导出函数`
        );
      }
      try {
        ensureFn();
      } catch (error) {
        throw buildError(filePath, `调用 ${config.ensure.export} 时发生错误`, error);
      }
    }

    options.logger?.info?.(
      `已根据配置注册插件 ${config.id}（来自 ${path.basename(filePath)}）`
    );
    results.push(item);
  }

  return results;
}
