/**
 * 节点类型常量定义
 *
 * 用于 PlanCanvas 和 PlanNodeEditDrawer 的节点类型配置
 * 包含节点类型的标识、中文标签和图标
 */

export const NODE_TYPE_OPTIONS = [
  { value: 'local_task', label: '本地任务', icon: '⚙️' },
  { value: 'agent_invocation', label: '代理调用', icon: '🤖' },
  { value: 'mcp_tool', label: 'MCP工具', icon: '🔧' },
  { value: 'external_service', label: '外部服务', icon: '🌐' },
  { value: 'human_approval', label: '人工审批', icon: '✋' },
  { value: 'conditional', label: '条件分支', icon: '🔀' }
] as const;

/**
 * 根据节点类型值获取对应的中文标签
 *
 * @param type - 节点类型值（如 'local_task'）
 * @returns 节点类型的中文标签，如果找不到则返回原始类型值
 *
 * @example
 * ```ts
 * getNodeTypeLabel('local_task') // => '本地任务'
 * getNodeTypeLabel('unknown') // => 'unknown'
 * ```
 */
export function getNodeTypeLabel(type: string): string {
  const option = NODE_TYPE_OPTIONS.find(opt => opt.value === type);
  return option?.label ?? type;
}
