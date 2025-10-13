import type { z } from "zod";

import type { AgentConfigSchema } from "./schema.js";

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface LoadedAgentConfig {
  readonly filePath: string;
  readonly moduleUrl: string;
  readonly config: AgentConfig;
}

export interface RegisterConfiguredAgentsOptions {
  /** 自定义配置目录，默认读取工作目录下的 agents-config */
  directory?: string;
  /** 当存在多个配置时可以通过过滤器控制加载 */
  filter?: (config: AgentConfig) => boolean;
  /** 自定义日志输出 */
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}
