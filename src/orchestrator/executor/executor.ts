import { performance } from "node:perf_hooks";

import { Annotation, END, START, StateGraph, type StateDefinition } from "@langchain/langgraph";
import jsonLogic from "json-logic-js";

const applyJsonLogic = jsonLogic.apply.bind(jsonLogic);

type JsonLogicExpression = string | Record<string, unknown>;

const jsonLogicStringCache = new Map<string, unknown>();

import type { PlanContext, PlanNode } from "../plan/index.js";
import type { ExecuteResult, PlanNodeAdapter } from "../adapters/base.js";
import type {
  DryRunSummary,
  ExecutionContext,
  ExecutionResult,
  ExecutionStatus
} from "./types.js";
import { JsonSharedStateStore } from "../state/sharedState.js";
import { createLoggerFacade } from "../../shared/logging/logger.js";

type DispatchTarget = PlanNode["type"] | "end" | "failed";

const ExecutionState = Annotation.Root({
  queue: Annotation<string[]>({
    reducer: (_left, right) => right ?? [],
    default: () => []
  }),
  currentNodeId: Annotation<string | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null
  }),
  dispatchTarget: Annotation<DispatchTarget | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null
  }),
  status: Annotation<ExecutionStatus>({
    reducer: (_left, right) => right ?? "success",
    default: () => "success"
  }),
  lastNodeId: Annotation<string | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null
  }),
  outputs: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...(right ?? {}) }),
    default: () => ({})
  }),
  error: Annotation<unknown>({
    reducer: (_left, right) => right,
    default: () => undefined
  })
});

function mergeOutputs(
  current: Record<string, unknown> | undefined,
  nodeId: string,
  output: unknown
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    [nodeId]: output
  };
}

function looksLikeJsonExpression(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function resolveJsonLogicRule(
  expression: JsonLogicExpression,
  ctx: ExecutionContext,
  label: string
): unknown | null {
  if (typeof expression === "string") {
    const trimmed = expression.trim();
    if (!looksLikeJsonExpression(trimmed)) {
      return null;
    }
    if (jsonLogicStringCache.has(trimmed)) {
      return jsonLogicStringCache.get(trimmed)!;
    }
    try {
      const parsed = JSON.parse(trimmed);
      jsonLogicStringCache.set(trimmed, parsed);
      return parsed;
    } catch (error) {
      ctx.logger.warn(`${label} JSON Logic 解析失败`, {
        expression,
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }
  return expression;
}

function safeApplyJsonLogic(
  rule: unknown,
  snapshot: Record<string, unknown>,
  ctx: ExecutionContext,
  label: string
): { ok: true; value: unknown } | { ok: false } {
  if (rule === null || rule === undefined) {
    return { ok: false };
  }
  try {
    const result = applyJsonLogic(rule, snapshot);
    return { ok: true, value: result };
  } catch (error) {
    ctx.logger.warn(`${label} JSON Logic 执行失败`, {
      error: error instanceof Error ? error.message : error
    });
    return { ok: false };
  }
}

async function ensureNodeApproval(node: PlanNode, ctx: ExecutionContext): Promise<void> {
  const requiresApproval =
    Boolean(node.requiresApproval) ||
    node.riskLevel === "high" ||
    node.type === "human_approval";
  const controller = ctx.approvalController;
  if (!requiresApproval || !controller) {
    return;
  }
  const plan = ctx.planContext.plan;
  const planVersion = "version" in plan ? (plan as { version?: string }).version ?? "v1" : "v1";
  await controller.ensureApproval(plan.id, planVersion, node);
}

function ensureAdapter(
  adapter: PlanNodeAdapter | undefined,
  node: PlanNode
): PlanNodeAdapter {
  if (!adapter) {
    throw new Error(`未找到节点类型 ${node.type} 的适配器 (nodeId=${node.id})`);
  }
  return adapter;
}

async function notifyBeforeNode(node: PlanNode, ctx: ExecutionContext) {
  await ctx.langGraphRunner?.beforeNode?.(node, ctx);
}

async function notifyAfterNode(result: ExecuteResult, ctx: ExecutionContext) {
  await ctx.langGraphRunner?.afterNode?.(result, ctx);
}

function evaluateCondition(
  expression: JsonLogicExpression | undefined,
  ctx: ExecutionContext
): boolean {
  if (expression === undefined || expression === null) {
    return false;
  }
  const snapshot = ctx.sharedState.toJSON();
  if (typeof expression === "string") {
    const trimmed = expression.trim();
    const rule = resolveJsonLogicRule(trimmed, ctx, "条件表达式");
    if (rule) {
      const applied = safeApplyJsonLogic(rule, snapshot, ctx, "条件表达式");
      if (applied.ok) {
        const { value } = applied;
        if (typeof value === "boolean") {
          return value;
        }
        return Boolean(value);
      }
    }
    const fallbackValue = ctx.sharedState.get(trimmed);
    if (typeof fallbackValue === "boolean") {
      return fallbackValue;
    }
    return Boolean(fallbackValue);
  }
  const applied = safeApplyJsonLogic(expression, snapshot, ctx, "条件表达式");
  if (!applied.ok) {
    return false;
  }
  const { value } = applied;
  if (typeof value === "boolean") {
    return value;
  }
  return Boolean(value);
}

function readCollection(
  path: JsonLogicExpression | undefined,
  ctx: ExecutionContext
): unknown[] {
  if (path === undefined || path === null) {
    return [];
  }
  const snapshot = ctx.sharedState.toJSON();
  if (typeof path === "string") {
    const trimmed = path.trim();
    const rule = resolveJsonLogicRule(trimmed, ctx, "集合表达式");
    if (rule) {
      const applied = safeApplyJsonLogic(rule, snapshot, ctx, "集合表达式");
      if (applied.ok) {
        const { value } = applied;
        if (Array.isArray(value)) {
          return value;
        }
        if (value !== undefined && value !== null) {
          ctx.logger.warn(`集合表达式返回非数组结果，已忽略`, {
            resultType: typeof value
          });
        }
        return [];
      }
    }
    const value = ctx.sharedState.get(trimmed);
    return Array.isArray(value) ? value : [];
  }
  const applied = safeApplyJsonLogic(path, snapshot, ctx, "集合表达式");
  if (!applied.ok) {
    return [];
  }
  const { value } = applied;
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== undefined && value !== null) {
    ctx.logger.warn(`集合表达式返回非数组结果，已忽略`, {
      resultType: typeof value
    });
  }
  return [];
}

async function saveCheckpoint(nodeId: string, ctx: ExecutionContext): Promise<void> {
  if (!ctx.options?.checkpointOnEachNode) {
    return;
  }
  await ctx.checkpointStore.save(ctx.planContext.plan.id, {
    lastNodeId: nodeId,
    sharedState: ctx.sharedState.toJSON()
  });
}

function loopStateKey(loopId: string): string {
  return `${loopId}.__loopState`;
}

export async function dryRun(
  planContext: PlanContext,
  ctx: ExecutionContext
): Promise<DryRunSummary> {
  const warnings: string[] = [];
  const controlNodeTypes = new Set([
    "sequence",
    "parallel",
    "conditional",
    "loop",
    "human_approval"
  ]);

  for (const node of planContext.plan.nodes) {
    if (controlNodeTypes.has(node.type)) {
      continue;
    }
    const adapter = ctx.adapters.get(node.type);
    if (!adapter) {
      warnings.push(`节点 ${node.id} (${node.type}) 缺少适配器`);
      continue;
    }
    if (adapter.dryRun) {
      const result = await adapter.dryRun(node, ctx);
      if (result?.warnings?.length) {
        warnings.push(...result.warnings);
      }
    }
  }
  return {
    planId: planContext.plan.id,
    warnings
  };
}

export async function execute(
  planContext: PlanContext,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const startedAt = new Date();
  const hrStart = performance.now();
  const { plan, nodeMap } = planContext;
  const runner = ctx.langGraphRunner;
  await runner?.start(plan, ctx);
  ctx.logger.info(`Plan ${plan.id} execution started`);

  const dispatchMap: Record<DispatchTarget, string> = {
    sequence: "sequence",
    parallel: "parallel",
    conditional: "conditional",
    loop: "loop",
    human_approval: "leaf",
    local_task: "leaf",
    agent_invocation: "leaf",
    mcp_tool: "leaf",
    external_service: "leaf",
    end: END,
    failed: END
  };

  const graphBuilder: any = new StateGraph(ExecutionState as unknown as StateDefinition);

  const dispatcher = (
    state: typeof ExecutionState.State
  ): Partial<typeof ExecutionState.State> => {
    if (state.status === "failed") {
      return {
        dispatchTarget: "failed",
        currentNodeId: null
      };
    }
    const queue = [...(state.queue ?? [])];
    const nextNodeId = queue.pop();
    if (!nextNodeId) {
      return {
        queue,
        dispatchTarget: "end",
        currentNodeId: null
      };
    }
    const node = nodeMap.get(nextNodeId);
    if (!node) {
      const error = new Error(`执行计划中未找到节点 ${nextNodeId}`);
      return {
        queue,
        dispatchTarget: "failed",
        currentNodeId: null,
        status: "failed",
        error
      };
    }
    return {
      queue,
      currentNodeId: nextNodeId,
      dispatchTarget: node.type
    };
  };

  const handleSequence = (
    state: typeof ExecutionState.State
  ): Partial<typeof ExecutionState.State> => {
    const nodeId = state.currentNodeId;
    if (!nodeId) {
      return { dispatchTarget: null };
    }
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "sequence") {
      const error = new Error(`节点 ${nodeId} 类型不匹配 sequence`);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed"
      };
    }
    const nextQueue = [...(state.queue ?? [])];
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      nextQueue.push(node.children[i]!);
    }
    ctx.logger.info(`顺序节点 ${node.id} 入队 ${node.children.length} 个子节点`);
    return {
      queue: nextQueue,
      dispatchTarget: null,
      currentNodeId: null,
      lastNodeId: node.id
    };
  };

  const handleParallel = (
    state: typeof ExecutionState.State
  ): Partial<typeof ExecutionState.State> => {
    const nodeId = state.currentNodeId;
    if (!nodeId) {
      return { dispatchTarget: null };
    }
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "parallel") {
      const error = new Error(`节点 ${nodeId} 类型不匹配 parallel`);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed"
      };
    }
    const nextQueue = [...(state.queue ?? [])];
    for (const child of node.children) {
      nextQueue.push(child);
    }
    ctx.logger.info(`并行节点 ${node.id} 入队 ${node.children.length} 个子节点`);
    return {
      queue: nextQueue,
      dispatchTarget: null,
      currentNodeId: null,
      lastNodeId: node.id
    };
  };

  const handleConditional = (
    state: typeof ExecutionState.State
  ): Partial<typeof ExecutionState.State> => {
    const nodeId = state.currentNodeId;
    if (!nodeId) {
      return { dispatchTarget: null };
    }
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "conditional") {
      const error = new Error(`节点 ${nodeId} 类型不匹配 conditional`);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed"
      };
    }
    const shouldRunTrue = evaluateCondition(node.condition.expression, ctx);
    const branch = shouldRunTrue ? node.whenTrue : node.whenFalse ?? [];
    const nextQueue = [...(state.queue ?? [])];
    for (let i = branch.length - 1; i >= 0; i -= 1) {
      nextQueue.push(branch[i]!);
    }
    ctx.logger.info(
      `条件节点 ${node.id} 选择分支 ${shouldRunTrue ? "whenTrue" : "whenFalse"}`
    );
    return {
      queue: nextQueue,
      dispatchTarget: null,
      currentNodeId: null,
      lastNodeId: node.id
    };
  };

  const handleLoop = (
    state: typeof ExecutionState.State
  ): Partial<typeof ExecutionState.State> => {
    const nodeId = state.currentNodeId;
    if (!nodeId) {
      return { dispatchTarget: null };
    }
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== "loop") {
      const error = new Error(`节点 ${nodeId} 类型不匹配 loop`);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed"
      };
    }
    const loopKey = loopStateKey(node.id);
    const rawState = ctx.sharedState.get(loopKey) as
      | { iterations: number; index?: number }
      | undefined;
    const iterations = rawState?.iterations ?? 0;
    if (iterations >= node.maxIterations) {
      ctx.logger.warn(
        `循环节点 ${node.id} 已达到最大迭代次数 ${node.maxIterations}，提前退出`
      );
      ctx.sharedState.set(loopKey, { iterations: 0, index: 0 });
      return {
        dispatchTarget: null,
        currentNodeId: null,
        lastNodeId: node.id
      };
    }

    if (node.mode === "while") {
      const shouldContinue = evaluateCondition(node.condition, ctx);
      if (!shouldContinue) {
        ctx.sharedState.set(loopKey, { iterations: 0, index: 0 });
        return {
          dispatchTarget: null,
          currentNodeId: null,
          lastNodeId: node.id
        };
      }
      ctx.sharedState.set(loopKey, { iterations: iterations + 1 });
      const nextQueue = [...(state.queue ?? [])];
      nextQueue.push(node.id);
      for (let i = node.body.length - 1; i >= 0; i -= 1) {
        nextQueue.push(node.body[i]!);
      }
      return {
        queue: nextQueue,
        dispatchTarget: null,
        currentNodeId: null,
        lastNodeId: node.id
      };
    }

    const collection = readCollection(node.collectionPath, ctx);
    const index = rawState?.index ?? 0;
    if (index >= collection.length || index >= node.maxIterations) {
      ctx.sharedState.set(loopKey, { iterations: 0, index: 0 });
      return {
        dispatchTarget: null,
        currentNodeId: null,
        lastNodeId: node.id
      };
    }

    const item = collection[index];
    ctx.sharedState.set(`${node.id}.loopItem`, item);
    ctx.sharedState.set(loopKey, { iterations: iterations + 1, index: index + 1 });

    const nextQueue = [...(state.queue ?? [])];
    nextQueue.push(node.id);
    for (let i = node.body.length - 1; i >= 0; i -= 1) {
      nextQueue.push(node.body[i]!);
    }

    return {
      queue: nextQueue,
      dispatchTarget: null,
      currentNodeId: null,
      lastNodeId: node.id
    };
  };

  const handleLeaf = async (
    state: typeof ExecutionState.State
  ): Promise<Partial<typeof ExecutionState.State>> => {
    const nodeId = state.currentNodeId;
    if (!nodeId) {
      return { dispatchTarget: null };
    }
    const node = nodeMap.get(nodeId);
    if (!node) {
      const error = new Error(`执行计划中未找到节点 ${nodeId}`);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed",
        queue: []
      };
    }

    if (node.type === "human_approval") {
      try {
        await ensureNodeApproval(node, ctx);
      } catch (error) {
        ctx.logger.error(`节点 ${node.id} 审批失败`, error, {
          nodeId: node.id,
          nodeType: node.type
        });
        await saveCheckpoint(node.id, ctx);
        return {
          status: "failed",
          error,
          dispatchTarget: "failed",
          currentNodeId: null
        };
      }
      const approvalOutput = { status: "approved" as const };
      ctx.sharedState.set(`${node.id}.approval`, approvalOutput);
      const outputs = mergeOutputs(state.outputs, node.id, approvalOutput);
      await saveCheckpoint(node.id, ctx);
      ctx.logger.info(`人工审批节点 ${node.id} 已批准`);
      return {
        outputs,
        dispatchTarget: null,
        currentNodeId: null,
        lastNodeId: node.id
      };
    }

    let adapter: PlanNodeAdapter;
    try {
      adapter = ensureAdapter(ctx.adapters.get(node.type), node);
    } catch (error) {
      ctx.logger.error(`未找到节点 ${node.id} 的适配器`, error);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed",
        queue: [],
        lastNodeId: node.id
      };
    }

    try {
      await ensureNodeApproval(node, ctx);
    } catch (error) {
      ctx.logger.error(`节点 ${node.id} 审批失败`, error, {
        nodeId: node.id,
        nodeType: node.type
      });
      await saveCheckpoint(node.id, ctx);
      return {
        status: "failed",
        error,
        dispatchTarget: "failed",
        currentNodeId: null
      };
    }

    await notifyBeforeNode(node, ctx);
    let result: ExecuteResult;
    try {
      result = await adapter.execute(node as never, ctx);
    } catch (error) {
      ctx.logger.error(`节点 ${node.id} 执行出现异常`, error);
      await notifyAfterNode(
        {
          nodeId: node.id,
          status: "failed",
          error
        },
        ctx
      );
      return {
        status: "failed",
        error,
        dispatchTarget: "failed",
        queue: [],
        lastNodeId: node.id
      };
    }
    await notifyAfterNode(result, ctx);

    const outputs = mergeOutputs(state.outputs, result.nodeId, result.output ?? null);

    if (result.status === "failed") {
      ctx.logger.error(`节点 ${result.nodeId} 执行失败`, result.error);
      await notifyAfterNode(result, ctx);
      await saveCheckpoint(result.nodeId, ctx);
      return {
        status: "failed",
        error: result.error,
        dispatchTarget: "failed",
        queue: [],
        lastNodeId: result.nodeId
      };
    }

    await notifyAfterNode(result, ctx);
    await saveCheckpoint(result.nodeId, ctx);

    return {
      outputs,
      dispatchTarget: null,
      currentNodeId: null,
      lastNodeId: result.nodeId
    };
  };

  graphBuilder
    .addNode("dispatcher", dispatcher as any)
    .addNode("sequence", handleSequence as any)
    .addNode("parallel", handleParallel as any)
    .addNode("conditional", handleConditional as any)
    .addNode("loop", handleLoop as any)
    .addNode("leaf", handleLeaf as any);

  graphBuilder.addEdge(START, "dispatcher");
  graphBuilder.addConditionalEdges(
    "dispatcher",
    (state: typeof ExecutionState.State) => {
      if (state.status === "failed") {
        return "failed";
      }
      return state.dispatchTarget ?? "end";
    },
    dispatchMap
  );
  graphBuilder
    .addEdge("sequence", "dispatcher")
    .addEdge("parallel", "dispatcher")
    .addEdge("conditional", "dispatcher")
    .addEdge("loop", "dispatcher")
    .addEdge("leaf", "dispatcher");

  const executionGraph = graphBuilder.compile();

  const initialState: Partial<typeof ExecutionState.State> = {
    queue: [plan.entry],
    status: "success"
  };

  const finalState = (await executionGraph.invoke(initialState)) as typeof ExecutionState.State;

  const finishedAt = new Date();
  const duration = performance.now() - hrStart;
  ctx.logger.info(
    `Plan ${plan.id} 执行状态：${finalState.status}，耗时 ${duration.toFixed(0)}ms`
  );

  await runner?.finish(finalState.status ?? "success", ctx);

  const outputs = finalState.outputs ?? {};
  const status = finalState.status ?? "success";

  const result: any = {
    planId: plan.id,
    status,
    startedAt,
    finishedAt,
    outputs
  };
  if (finalState.lastNodeId) result.lastNodeId = finalState.lastNodeId;
  if (status === "failed" && finalState.error !== undefined) result.error = finalState.error;
  return result as ExecutionResult;
}

export function createDefaultExecutionContext(
  params: Omit<ExecutionContext, "sharedState" | "logger"> & {
    logger?: ExecutionContext["logger"];
    initialSharedState?: Record<string, unknown>;
    loggerCategory?: string;
  }
): ExecutionContext {
  const sharedState = new JsonSharedStateStore(params.initialSharedState);
  const logger =
    params.logger ??
    createLoggerFacade(params.loggerCategory ?? "executor", {
      planId: params.planContext.plan.id
    });
  return {
    ...params,
    logger,
    sharedState
  };
}
