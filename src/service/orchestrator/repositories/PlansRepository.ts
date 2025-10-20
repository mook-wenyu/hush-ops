import { z } from "zod";

import { JsonFileStore } from "../../../shared/persistence/JsonFileStore.js";
import { PlanSchema } from "../../../shared/schemas/plan.js";
import { joinConfigPath } from "../../../shared/environment/pathResolver.js";

/**
 * Schedule 配置 schema
 */
const ScheduleSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(["cron", "interval"]),
  cron: z.string().optional(),
  interval: z.number().optional(),
  concurrency: z.enum(["allow", "forbid", "queue"]).optional()
});

/**
 * 扩展的 Plan schema，包含可选的 schedule 字段
 */
const PlanWithScheduleSchema = PlanSchema.extend({
  description: z.string().optional(),
  schedule: ScheduleSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

export type PlanWithSchedule = z.infer<typeof PlanWithScheduleSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;

/**
 * PlansRepository 选项
 */
export interface PlansRepositoryOptions {
  /**
   * 存储目录，默认为系统配置目录的 plans 子目录
   */
  directory?: string;
}

/**
 * Plans 数据仓库
 *
 * 提供计划数据的持久化和查询功能。
 *
 * 特性：
 * - 基于 JsonFileStore 的原子写入和并发安全
 * - 业务查询方法：按 schedule、cron 等筛选
 * - JSON 导入导出
 * - 类型安全的 CRUD 接口
 */
export class PlansRepository extends JsonFileStore<PlanWithSchedule> {
  constructor(options: PlansRepositoryOptions = {}) {
    const directory = options.directory ?? joinConfigPath("plans");

    super({
      directory,
      schema: PlanWithScheduleSchema,
      idField: "id",
      logCategory: "PlansRepository"
    });
  }

  /**
   * 查找所有启用调度的计划
   */
  async findScheduledPlans(): Promise<PlanWithSchedule[]> {
    const all = await this.list();
    return all.filter((plan) => plan.schedule?.enabled === true);
  }

  /**
   * 按调度启用状态查找计划
   */
  async findByScheduleEnabled(enabled: boolean): Promise<PlanWithSchedule[]> {
    const all = await this.list();
    return all.filter((plan) => plan.schedule?.enabled === enabled);
  }

  /**
   * 查找包含特定 cron 表达式的计划
   */
  async findByCron(cronExpression: string): Promise<PlanWithSchedule[]> {
    const all = await this.list();
    return all.filter(
      (plan) =>
        plan.schedule?.kind === "cron" &&
        plan.schedule.cron === cronExpression
    );
  }

  /**
   * 从 JSON 字符串导入计划
   *
   * @param content JSON 格式的计划内容
   * @param options 导入选项
   * @returns 导入的计划
   */
  async importFromJSON(
    content: string,
    options: { overwrite?: boolean } = {}
  ): Promise<PlanWithSchedule> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // 验证 schema
    const validated = this.validateEntity(parsed);

    // 检查是否已存在
    const id = this.extractId(validated);
    const exists = await this.exists(id);

    if (exists) {
      if (options.overwrite) {
        return this.update(id, validated);
      } else {
        throw new Error(`Plan with id '${id}' already exists`);
      }
    }

    return this.create(validated);
  }

  /**
   * 导出计划为 JSON 字符串
   */
  async exportToJSON(id: string): Promise<string> {
    const plan = await this.read(id);
    if (!plan) {
      throw new Error(`Plan with id '${id}' not found`);
    }
    return JSON.stringify(plan, null, 2);
  }

  /**
   * 批量导出所有计划
   */
  async exportAll(): Promise<PlanWithSchedule[]> {
    return this.list();
  }

  /**
   * 按版本查找计划
   */
  async findByVersion(version: string): Promise<PlanWithSchedule[]> {
    const all = await this.list();
    return all.filter((plan) => plan.version === version);
  }

  /**
   * 搜索计划（按 id、description 模糊匹配）
   */
  async search(query: string): Promise<PlanWithSchedule[]> {
    const all = await this.list();
    const lowerQuery = query.toLowerCase();

    return all.filter((plan) => {
      const idMatch = plan.id.toLowerCase().includes(lowerQuery);
      const descMatch =
        plan.description?.toLowerCase().includes(lowerQuery) ?? false;
      return idMatch || descMatch;
    });
  }

  /**
   * 统计计划数量
   */
  async count(): Promise<number> {
    const all = await this.list();
    return all.length;
  }

  /**
   * 统计启用调度的计划数量
   */
  async countScheduled(): Promise<number> {
    const scheduled = await this.findScheduledPlans();
    return scheduled.length;
  }

  /**
   * 分页查询计划
   */
  async paginate(options: {
    limit: number;
    offset: number;
  }): Promise<{ plans: PlanWithSchedule[]; total: number }> {
    const all = await this.list();
    const total = all.length;
    const plans = all.slice(options.offset, options.offset + options.limit);

    return { plans, total };
  }

  /**
   * 检查计划是否有调度配置
   */
  async hasSchedule(id: string): Promise<boolean> {
    const plan = await this.read(id);
    return plan?.schedule?.enabled === true;
  }
}
