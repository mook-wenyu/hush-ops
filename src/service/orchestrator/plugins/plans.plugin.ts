import type { FastifyPluginAsync } from "fastify/types/plugin.js";

import { PlansRepository } from "../repositories/PlansRepository.js";
import { joinConfigPath } from "../../../shared/environment/pathResolver.js";

interface PlansPluginOptions {
  repository?: PlansRepository;
}

interface IdParams {
  id: string;
}

interface QueryParams {
  limit?: string;
  offset?: string;
}

export const plansPlugin: FastifyPluginAsync<PlansPluginOptions> = async (
  app,
  options = {}
) => {
  const repository =
    options.repository ?? new PlansRepository({ directory: joinConfigPath("plans") });

  await repository.initialize();

  const plansRoute = "/api/v1/plans";

  // GET /api/v1/plans - 列出所有计划
  app.get<{ Querystring: QueryParams }>(
    plansRoute,
    async (request) => {
      const { limit: limitStr, offset: offsetStr } = request.query;
      const limit = Math.max(0, Math.min(1000, Number(limitStr ?? "0") || 0));
      const offset = Math.max(0, Number(offsetStr ?? "0") || 0);

      const plans = await repository.list();
      const total = plans.length;

      // 提取摘要信息
      const summaries = plans.map((plan) => ({
        id: plan.id,
        description: plan.description,
        version: plan.version
      }));

      const paginatedPlans =
        limit > 0 ? summaries.slice(offset, offset + limit) : summaries;

      return { total, plans: paginatedPlans };
    }
  );

  // GET /api/v1/plans/:id - 获取单个计划
  app.get<{ Params: IdParams }>(
    `${plansRoute}/:id`,
    async (request, reply) => {
      const { id } = request.params;
      const plan = await repository.read(id);

      if (!plan) {
        reply.code(404);
        return {
          error: { code: "plan_not_found", message: `未找到计划 ${id}` }
        };
      }

      return plan;
    }
  );

  // POST /api/v1/plans - 创建计划
  app.post<{ Body: { plan?: unknown } }>(
    plansRoute,
    async (request, reply) => {
      const { plan } = request.body;

      if (!plan) {
        reply.code(400);
        return {
          error: { code: "bad_request", message: "plan 字段必填" }
        };
      }

      try {
        const planData = plan as any;
        const id = planData.id ?? `plan-${Date.now()}`;
        planData.id = id;

        const created = await repository.create(planData);
        reply.code(201);
        return { id: created.id };
      } catch (error) {
        reply.code(422);
        return {
          error: {
            code: "plan_create_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  // POST /api/v1/plans/import - 导入计划（JSON文本）
  app.post<{
    Body: { filename?: string; content?: string };
  }>(
    `${plansRoute}/import`,
    async (request, reply) => {
      const { filename: _filename, content } = request.body;

      if (!content) {
        reply.code(400);
        return {
          error: {
            code: "bad_request",
            message: "content 必填（计划 JSON 文本）"
          }
        };
      }

      try {
        const imported = await repository.importFromJSON(content);
        reply.code(201);
        return { id: imported.id };
      } catch (error) {
        reply.code(422);
        return {
          error: {
            code: "plan_import_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  // POST /api/v1/plans/upload - 上传计划文件（multipart）
  app.post(`${plansRoute}/upload`, async (request: any, reply) => {
    try {
      const parts = request.parts();
      let imported = 0;
      const ids: string[] = [];

      for await (const part of parts) {
        if (part.type !== "file") continue;

        const _filename =
          typeof part.filename === "string"
            ? part.filename
            : `plan-${Date.now()}.json`;
        const content = await part.toBuffer();

        try {
          const json = content.toString("utf-8");
          const plan = await repository.importFromJSON(json, {
            overwrite: true
          });
          ids.push(plan.id);
          imported++;
        } catch {
          // 单个文件失败不影响其他
        }
      }

      if (imported === 0) {
        reply.code(422);
        return {
          error: {
            code: "upload_empty",
            message: "未解析到任何有效计划"
          }
        };
      }

      reply.code(201);
      return { imported, ids };
    } catch (error) {
      reply.code(422);
      return {
        error: {
          code: "upload_failed",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  });

  // PUT /api/v1/plans/:id - 更新计划
  app.put<{ Params: IdParams; Body: { plan?: unknown } }>(
    `${plansRoute}/:id`,
    async (request, reply) => {
      const { id } = request.params;
      const { plan } = request.body;

      if (!plan) {
        reply.code(400);
        return {
          error: { code: "bad_request", message: "plan 字段必填" }
        };
      }

      try {
        const planData = plan as any;
        planData.id = id;

        const updated = await repository.update(id, planData);
        return { id: updated.id };
      } catch (error) {
        reply.code(422);
        return {
          error: {
            code: "plan_update_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  // DELETE /api/v1/plans/:id - 删除计划
  app.delete<{ Params: IdParams }>(
    `${plansRoute}/:id`,
    async (request, reply) => {
      const { id } = request.params;

      try {
        const plan = await repository.read(id);

        if (!plan) {
          reply.code(404);
          return {
            error: { code: "plan_not_found", message: `未找到计划 ${id}` }
          };
        }

        await repository.delete(id);
        reply.code(204);
        return;
      } catch (error) {
        reply.code(422);
        return {
          error: {
            code: "plan_delete_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  // POST /api/v1/plans/:id/execute - 执行计划
  // 注意：这个路由实际上是Executions的功能，但定义在Plans路径下
  // 在实际集成时，这部分逻辑应该调用OrchestratorController
  // 这里暂时保留接口定义，实际逻辑由controller处理
  app.post<{
    Params: IdParams;
    Body: { mcpServer?: string };
  }>(
    `${plansRoute}/:id/execute`,
    async (request, reply) => {
      const { id } = request.params;

      try {
        const plan = await repository.read(id);

        if (!plan) {
          reply.code(404);
          return {
            error: { code: "plan_not_found", message: `未找到计划 ${id}` }
          };
        }

        // 这里需要调用OrchestratorController.execute()
        // 由于controller不在Repository层，这个路由实际应该由server.ts或executions.plugin处理
        // 暂时返回未实现错误
        reply.code(501);
        return {
          error: {
            code: "not_implemented",
            message:
              "执行功能需要OrchestratorController，请在server.ts中处理"
          }
        };
      } catch (error) {
        reply.code(422);
        return {
          error: {
            code: "execution_start_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );
};
