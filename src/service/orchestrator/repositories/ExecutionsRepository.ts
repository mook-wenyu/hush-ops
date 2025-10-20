import { z } from "zod";

import { JsonFileStore } from "../../../shared/persistence/JsonFileStore.js";
import { joinStatePath } from "../../../shared/environment/pathResolver.js";
import type { ExecutionRecord } from "../../../ui/types/orchestrator.js";

/**
 * ExecutionRecord schema for validation
 */
const PendingApprovalEntrySchema = z.object({
  id: z.string(),
  planId: z.string(),
  planVersion: z.string().optional(),
  nodeId: z.string(),
  nodeType: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  requiresApproval: z.boolean(),
  requestedAt: z.string(),
  requestedBy: z.string(),
  payload: z.record(z.unknown()).optional(),
  comment: z.string().nullable().optional()
});

const BridgeStateSchema = z.enum([
  "connecting",
  "connected",
  "disconnected",
  "reconnecting"
]);

const ExecutionRecordSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  createdAt: z.string(),
  executorType: z.enum(["mock", "mcp"]),
  status: z.enum(["pending", "running", "success", "failed", "cancelled"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  bridgeStates: z.array(BridgeStateSchema),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
  pendingApprovals: z.array(PendingApprovalEntrySchema),
  executionStatus: z.string().optional(),
  running: z.boolean().optional(),
  currentNodeId: z.string().nullable().optional(),
  lastCompletedNodeId: z.string().nullable().optional(),
  bridgeState: BridgeStateSchema.optional(),
  bridgeMeta: z.record(z.unknown()).optional()
});

export type ExecutionStatus = ExecutionRecord["status"];

/**
 * ExecutionsRepository 选项
 */
export interface ExecutionsRepositoryOptions {
  /**
   * 存储目录，默认为系统配置目录的 executions 子目录
   */
  directory?: string;
}

/**
 * Executions 数据仓库
 *
 * 提供执行记录的持久化和查询功能。
 *
 * 特性：
 * - 基于 JsonFileStore 的原子写入和并发安全
 * - 业务查询方法：按状态、planId、时间范围筛选
 * - 分页查询支持
 * - 类型安全的 CRUD 接口
 */
export class ExecutionsRepository extends JsonFileStore<ExecutionRecord> {
  constructor(options: ExecutionsRepositoryOptions = {}) {
    // 默认使用运行态目录 .hush-ops/state/runs
    const directory = options.directory ?? joinStatePath("runs");

    super({
      directory,
      // 类型断言：Zod schema 的运行时验证已足够，编译时类型推断与 exactOptionalPropertyTypes 存在已知冲突
      schema: ExecutionRecordSchema as z.ZodType<ExecutionRecord, any, any>,
      idField: "id",
      logCategory: "ExecutionsRepository"
    });
  }

  /**
   * 按状态查找执行记录
   */
  async findByStatus(status: ExecutionStatus): Promise<ExecutionRecord[]> {
    const all = await this.list();
    return all.filter((exec) => exec.status === status);
  }

  /**
   * 按 planId 查找执行记录
   */
  async findByPlanId(planId: string): Promise<ExecutionRecord[]> {
    const all = await this.list();
    return all.filter((exec) => exec.planId === planId);
  }

  /**
   * 查找正在运行的执行记录
   */
  async findRunning(): Promise<ExecutionRecord[]> {
    return this.findByStatus("running");
  }

  /**
   * 按时间范围查找执行记录
   */
  async findByTimeRange(
    startTime: string,
    endTime: string
  ): Promise<ExecutionRecord[]> {
    const all = await this.list();
    return all.filter((exec) => {
      const createdAt = exec.createdAt;
      return createdAt >= startTime && createdAt <= endTime;
    });
  }

  /**
   * 查找最近的执行记录
   */
  async findRecent(limit: number = 10): Promise<ExecutionRecord[]> {
    const all = await this.list();
    return all
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /**
   * 统计执行记录数量
   */
  async count(): Promise<number> {
    const all = await this.list();
    return all.length;
  }

  /**
   * 按状态统计执行记录数量
   */
  async countByStatus(status: ExecutionStatus): Promise<number> {
    const records = await this.findByStatus(status);
    return records.length;
  }

  /**
   * 分页查询执行记录
   */
  async paginate(options: {
    limit: number;
    offset: number;
    status?: ExecutionStatus;
    planId?: string;
    sortBy?: "createdAt" | "startedAt" | "finishedAt";
    sortOrder?: "asc" | "desc";
  }): Promise<{ executions: ExecutionRecord[]; total: number }> {
    let all = await this.list();

    // 过滤
    if (options.status) {
      all = all.filter((exec) => exec.status === options.status);
    }
    if (options.planId) {
      all = all.filter((exec) => exec.planId === options.planId);
    }

    // 排序
    const sortBy = options.sortBy ?? "createdAt";
    const sortOrder = options.sortOrder ?? "desc";
    all.sort((a, b) => {
      const aVal = a[sortBy] ?? "";
      const bVal = b[sortBy] ?? "";
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortOrder === "asc" ? comparison : -comparison;
    });

    const total = all.length;
    const executions = all.slice(options.offset, options.offset + options.limit);

    return { executions, total };
  }

  /**
   * 清理旧的执行记录
   */
  async cleanupOld(daysToKeep: number = 30): Promise<number> {
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - daysToKeep);
    const cutoffISO = cutoffTime.toISOString();

    const all = await this.list();
    const toDelete = all.filter((exec) => {
      // 只清理已完成的记录（成功、失败、取消）
      const isFinished = ["success", "failed", "cancelled"].includes(
        exec.status
      );
      return isFinished && exec.createdAt < cutoffISO;
    });

    let deleted = 0;
    for (const exec of toDelete) {
      try {
        await this.delete(exec.id);
        deleted++;
      } catch (error) {
        this.logger.warn("Failed to delete old execution", {
          id: exec.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return deleted;
  }

  /**
   * 获取执行统计信息
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<ExecutionStatus, number>;
    avgDurationMs?: number;
  }> {
    const all = await this.list();
    const total = all.length;

    const byStatus: Record<ExecutionStatus, number> = {
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0
    };

    let totalDurationMs = 0;
    let completedCount = 0;

    for (const exec of all) {
      byStatus[exec.status]++;

      if (exec.startedAt && exec.finishedAt) {
        const duration =
          new Date(exec.finishedAt).getTime() -
          new Date(exec.startedAt).getTime();
        if (duration > 0) {
          totalDurationMs += duration;
          completedCount++;
        }
      }
    }

    const result: {
      total: number;
      byStatus: Record<ExecutionStatus, number>;
      avgDurationMs?: number;
    } = { total, byStatus };

    if (completedCount > 0) {
      result.avgDurationMs = totalDurationMs / completedCount;
    }

    return result;
  }

  /**
   * 查找指定 planId 的最新执行记录
   */
  async findLatestByPlanId(planId: string): Promise<ExecutionRecord | null> {
    const records = await this.findByPlanId(planId);
    if (records.length === 0) return null;

    return records.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )[0] ?? null;
  }
}
