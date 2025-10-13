/*
 * 说明：注册表用于集中存储不同上下文的 Agent 插件。
 * 由于 Agent 泛型不可变，这里统一使用 any 进行类型擦除，
 * 并通过受控 API 暴露，限制 any 的影响范围。
 */
import type { Agent } from "@openai/agents";

import type { AgentPlugin } from "./plugins/types.js";

type StoredPlugin = AgentPlugin<unknown, Agent<any, any>, unknown, unknown>;

const registry = new Map<string, StoredPlugin>();

export function registerAgentPlugin(
  plugin: StoredPlugin,
  options: { replace?: boolean } = {}
): void {
  const { replace = false } = options;
  if (registry.has(plugin.id) && !replace) {
    throw new Error(`Agent plugin "${plugin.id}" 已存在，如需覆盖请传入 { replace: true }`);
  }
  registry.set(plugin.id, plugin);
}

export function getAgentPlugin(id: string): StoredPlugin {
  const plugin = registry.get(id);
  if (!plugin) {
    throw new Error(`Agent plugin "${id}" 未注册，请先调用 ensure 或 register 方法`);
  }
  return plugin;
}

export function ensureAgentPlugin(
  id: string,
  factory: () => StoredPlugin
): StoredPlugin {
  let plugin = registry.get(id);
  if (!plugin) {
    const created = factory();
    if (created.id !== id) {
      throw new Error(
        `ensureAgentPlugin 收到的 plugin id (${created.id}) 与预期 (${id}) 不一致`
      );
    }
    registry.set(id, created);
    plugin = created;
  }
  return plugin;
}

export function listAgentPlugins(): StoredPlugin[] {
  return Array.from(registry.values());
}

export function clearAgentPlugins(): void {
  registry.clear();
}
