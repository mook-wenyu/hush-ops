import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { joinConfigPath } from "../../shared/environment/pathResolver.js";

export interface McpServerRetryOptions {
  readonly initialDelayMs?: number;
  readonly multiplier?: number;
  readonly maxDelayMs?: number;
  readonly maxAttempts?: number;
}

export interface McpServerSessionOptions {
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface McpServerConfig {
  readonly name: string;
  readonly endpoint: string;
  readonly description?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly workingDirectory?: string;
  readonly autoStart?: boolean;
  readonly headers?: Record<string, string>;
  readonly capabilities?: Record<string, unknown>;
  readonly retry?: McpServerRetryOptions;
  readonly session?: McpServerSessionOptions;
}

interface LoadOptions {
  filePath?: string;
  reload?: boolean;
}

interface CachedEntry {
  path: string;
  configs: Map<string, McpServerConfig>;
}

const ENV_CONFIG_PATH = "MCP_SERVERS_CONFIG_PATH";
const USER_CONFIG_PATH = joinConfigPath("mcp.servers.json");
const REPO_CONFIG_PATH = path.resolve("config", "mcp.servers.json");

const RetrySchema = z
  .object({
    initialDelayMs: z.number().int().positive().optional(),
    multiplier: z.number().positive().optional(),
    maxDelayMs: z.number().int().positive().optional(),
    maxAttempts: z.number().int().positive().optional()
  })
  .partial()
  .optional();

const SessionSchema = z
  .object({
    userId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .optional();

const BaseServerSchema = z.object({
  endpoint: z.string().url({ message: "endpoint 必须为有效的 URL" }),
  description: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  workingDirectory: z.string().min(1).optional(),
  autoStart: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  retry: RetrySchema,
  session: SessionSchema
});

const NamedServerSchema = BaseServerSchema.extend({
  name: z
    .string({ required_error: "name 字段必填" })
    .min(1, { message: "name 字段不能为空白" })
});

const ConfigSchema = z.object({
  mcpServers: z.union([
    z.array(NamedServerSchema),
    z.record(BaseServerSchema)
  ])
});

let cache: CachedEntry | null = null;
let pendingLoad: Promise<CachedEntry> | null = null;

function resolveConfigPath(customPath?: string): string {
  const explicit = customPath ?? process.env[ENV_CONFIG_PATH];
  if (explicit && explicit.trim().length > 0) {
    return path.resolve(explicit.trim());
  }
  if (existsSync(USER_CONFIG_PATH)) {
    return USER_CONFIG_PATH;
  }
  if (existsSync(REPO_CONFIG_PATH)) {
    return REPO_CONFIG_PATH;
  }
  return USER_CONFIG_PATH;
}

async function readConfigFile(configPath: string): Promise<unknown> {
  const content = await readFile(configPath, "utf-8").catch((error: unknown) => {
    const cause = error as NodeJS.ErrnoException;
    if (cause && cause.code === "ENOENT") {
      throw new Error(`未找到 MCP 配置文件：${configPath}`);
    }
    throw new Error(`读取 MCP 配置失败：${cause?.message ?? String(error)}`);
  });
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`MCP 配置不是有效的 JSON：${(error as Error).message}`);
  }
}

function normaliseServers(payload: z.infer<typeof ConfigSchema>): Map<string, McpServerConfig> {
  const map = new Map<string, McpServerConfig>();
  if (Array.isArray(payload.mcpServers)) {
    for (const item of payload.mcpServers) {
      if (map.has(item.name)) {
        throw new Error(`检测到重复的 MCP server name：${item.name}`);
      }
      const base: McpServerConfig = {
        name: item.name,
        endpoint: item.endpoint
      } as McpServerConfig;
      if (item.description) (base as any).description = item.description;
      if (item.command) (base as any).command = item.command;
      if (item.args) (base as any).args = item.args;
      if (item.env) (base as any).env = item.env;
      if (item.workingDirectory) (base as any).workingDirectory = item.workingDirectory;
      if (typeof item.autoStart === "boolean") (base as any).autoStart = item.autoStart;
      if (item.headers) (base as any).headers = item.headers;
      if (item.capabilities) (base as any).capabilities = item.capabilities;
      if (item.retry) (base as any).retry = item.retry;
      if (item.session) (base as any).session = item.session;
      map.set(item.name, base);
    }
    return map;
  }

  for (const [name, item] of Object.entries(payload.mcpServers)) {
    if (map.has(name)) {
      throw new Error(`检测到重复的 MCP server name：${name}`);
    }
    const base: McpServerConfig = {
      name,
      endpoint: item.endpoint
    } as McpServerConfig;
    if (item.description) (base as any).description = item.description;
    if (item.command) (base as any).command = item.command;
    if (item.args) (base as any).args = item.args;
    if (item.env) (base as any).env = item.env;
    if (item.workingDirectory) (base as any).workingDirectory = item.workingDirectory;
    if (typeof item.autoStart === "boolean") (base as any).autoStart = item.autoStart;
    if (item.headers) (base as any).headers = item.headers;
    if (item.capabilities) (base as any).capabilities = item.capabilities;
    if (item.retry) (base as any).retry = item.retry;
    if (item.session) (base as any).session = item.session;
    map.set(name, base);
  }
  return map;
}

async function loadConfig(options: LoadOptions = {}): Promise<CachedEntry> {
  const configPath = resolveConfigPath(options.filePath);
  if (!options.reload) {
    if (cache && cache.path === configPath) {
      return cache;
    }
    if (pendingLoad) {
      return pendingLoad;
    }
  }

  const promise = (async (): Promise<CachedEntry> => {
    const raw = await readConfigFile(configPath);
    const parsed = ConfigSchema.parse(raw);
    const configs = normaliseServers(parsed);
    cache = { path: configPath, configs };
    pendingLoad = null;
    return cache;
  })();

  pendingLoad = promise;
  return promise;
}

export async function listMcpServers(options: LoadOptions = {}): Promise<McpServerConfig[]> {
  const { configs } = await loadConfig(options);
  return Array.from(configs.values());
}

export async function getMcpServerConfig(name: string, options: LoadOptions = {}): Promise<McpServerConfig> {
  if (!name || name.trim().length === 0) {
    throw new Error("mcp server 名称不能为空");
  }
  const { configs } = await loadConfig(options);
  const config = configs.get(name);
  if (!config) {
    throw new Error(`未找到名为 ${name} 的 MCP server，请检查 .hush-ops/config/mcp.servers.json`);
  }
  return config;
}

export function resetMcpServerConfigCache(): void {
  cache = null;
  pendingLoad = null;
}
