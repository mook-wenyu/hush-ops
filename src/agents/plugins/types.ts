/*
 * 说明：插件注册表需要存储不同上下文/输出类型的 Agent，
 * TypeScript 对 `Agent<TContext, TOutput>` 的泛型是不可变的，
 * 因此在统一存储时必须通过 `any` 进行类型擦除。
 * 我们通过集中封装避免 `any` 在业务代码中扩散。
 */
import type { Agent } from "@openai/agents";

export type AgentRunOptions<
  TAgent extends Agent<any, any>,
  TExtra extends Record<string, unknown> = Record<string, unknown>
> = {
  agent?: TAgent;
} & TExtra;

export interface AgentPlugin<
  TInput,
  TAgent extends Agent<any, any>,
  TResult,
  TAgentOptions = Record<string, never>,
  TRunOptions extends AgentRunOptions<TAgent> = AgentRunOptions<TAgent>
> {
  id: string;
  label: string;
  description?: string;
  createAgent(options?: TAgentOptions): TAgent;
  run(input: TInput, options?: TRunOptions): Promise<TResult>;
}
