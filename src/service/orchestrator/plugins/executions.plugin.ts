import type { FastifyPluginAsync } from "fastify/types/plugin.js";

import type { OrchestratorController } from "../controller.js";
import { ExecutionsRepository } from "../repositories/ExecutionsRepository.js";
import { joinConfigPath, joinStatePath } from "../../../shared/environment/pathResolver.js";
import { readdirSync } from "node:fs";

interface ExecutionsPluginOptions {
  repository?: ExecutionsRepository;
  controller: OrchestratorController;
}

interface IdParams {
  id: string;
}

interface QueryParams {
  limit?: string;
  offset?: string;
}

interface HistoryQueryParams extends QueryParams {
  status?: string;
  planId?: string;
  sortBy?: "createdAt" | "startedAt" | "finishedAt" | string;
  sortOrder?: "asc" | "desc" | string;
}

interface ToolStreamParams {
  id: string;
}

interface ToolStreamDetailParams {
  id: string;
  correlationId: string;
}

interface ExportQueryParams {
  format?: string;
  compress?: string;
}

export const executionsPlugin: FastifyPluginAsync<ExecutionsPluginOptions> = async (
  app,
  options
) => {
  const { controller } = options;
  const repository = (() => {
    if (options.repository) return options.repository;
    const primary = joinStatePath("runs");
    const legacy = joinConfigPath("executions");
    let chosen = primary;
    try {
      const primaryCount = readdirSync(primary).filter((f)=>f.endsWith('.json')).length;
      const legacyCount = readdirSync(legacy).filter((f)=>f.endsWith('.json')).length;
      if (legacyCount > 0 && primaryCount === 0) chosen = legacy;
    } catch { /* ignore */ }
    return new ExecutionsRepository({ directory: chosen });
  })();

  await repository.initialize();

  const executionsRoute = "/api/v1/executions";
  const historyRoute = `${executionsRoute}/history`;
  const exportRoute = `${executionsRoute}/export`;
  const stopRoute = `${executionsRoute}/:id/stop`;
  const toolStreamsRoute = `${executionsRoute}/:id/tool-streams`;

  // GET /api/v1/executions - 列出内存中的执行记录（运行中/近期加载）
  app.get<{ Querystring: QueryParams }>(
    executionsRoute,
    async (request) => {
      const q = request.query;
      const limit = Math.max(0, Math.min(1000, Number(q?.limit ?? "0") || 0));
      const offset = Math.max(0, Number(q?.offset ?? "0") || 0);
      const all = controller.listExecutions();
      const total = all.length;
      const executions = limit > 0 ? all.slice(offset, offset + limit) : all;
      return { total, executions };
    }
  );

  // GET /api/v1/executions/history - 持久化历史（从 repository 分页读取）
  app.get<{ Querystring: HistoryQueryParams }>(
    historyRoute,
    async (request) => {
      const q = request.query;
      const limit = Math.max(0, Math.min(1000, Number(q?.limit ?? "50") || 50));
      const offset = Math.max(0, Number(q?.offset ?? "0") || 0);
      const status = (q?.status as any) ?? undefined;
      const planId = q?.planId ?? undefined;
      const sortBy = (q?.sortBy === 'startedAt' || q?.sortBy === 'finishedAt') ? q?.sortBy : 'createdAt';
      const sortOrder = (q?.sortOrder === 'asc' || q?.sortOrder === 'desc') ? q?.sortOrder : 'desc';
      const opts: { limit: number; offset: number; status?: any; planId?: string; sortBy?: any; sortOrder?: any } = {
        limit,
        offset,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      };
      if (typeof status !== 'undefined' && status !== null && status !== '') {
        (opts as any).status = status as any;
      }
      if (typeof planId === 'string' && planId.length > 0) {
        opts.planId = planId;
      }
      const { executions, total } = await repository.paginate(opts);
      return { total, executions };
    }
  );

  // GET /api/v1/executions/export - 导出历史（json/ndjson，可选 gzip）
  app.get<{ Querystring: { format?: string; compress?: string; planId?: string } }>(
    exportRoute,
    async (request, reply) => {
      const fmt = (request.query?.format ?? 'json').toString();
      const compress = (request.query?.compress ?? '0').toString() === '1';
      const planId = request.query?.planId;
      const exportOpts: { limit: number; offset: number; planId?: string } = { limit: 10000, offset: 0 };
      if (typeof planId === 'string' && planId.length > 0) exportOpts.planId = planId;
      const { executions } = await repository.paginate(exportOpts);
      let payload = '';
      if (fmt === 'ndjson') {
        payload = executions.map((e)=> JSON.stringify(e)).join('\n') + '\n';
        reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="executions-${new Date().toISOString().replace(/[:.]/g,'-')}.ndjson${compress?'.gz':''}"`);
      } else {
        payload = JSON.stringify({ total: executions.length, executions }, null, 2) + '\n';
        reply.header('Content-Type', 'application/json; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="executions-${new Date().toISOString().replace(/[:.]/g,'-')}.json${compress?'.gz':''}"`);
      }
      if (compress) {
        const zlib = await import('node:zlib');
        const gz = zlib.gzipSync(Buffer.from(payload, 'utf-8'));
        reply.header('Content-Encoding', 'gzip');
        return reply.send(gz);
      }
      return reply.send(payload);
    }
  );

  // POST /api/v1/executions/:id/stop - 停止执行
  app.post<{ Params: IdParams }>(
    stopRoute,
    async (request, reply) => {
      const { id } = request.params;
      try {
        const record = await controller.stopExecution(id);
        return { execution: record };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("找不到执行")) {
          reply.code(404);
          return { error: { code: "execution_not_found", message } };
        }
        reply.code(422);
        return { error: { code: "execution_stop_failed", message } };
      }
    }
  );

  // GET /api/v1/executions/:id - 获取单个执行记录
  app.get<{ Params: IdParams }>(
    `${executionsRoute}/:id`,
    async (request, reply) => {
      const { id } = request.params;
      // 使用异步方法支持从repository加载历史记录
      const record = await controller.getExecutionAsync(id);
      if (!record) {
        reply.code(404);
        return {
          error: { code: "execution_not_found", message: `未找到执行 ${id}` }
        };
      }
      return record;
    }
  );

  // GET /api/v1/executions/:id/tool-streams - 获取工具流摘要列表
  app.get<{ Params: ToolStreamParams }>(
    toolStreamsRoute,
    async (request, reply) => {
      const { id } = request.params;
      const record = controller.getExecution(id);
      if (!record) {
        reply.code(404);
        return {
          error: { code: "execution_not_found", message: `未找到执行 ${id}` }
        };
      }
      const streams = controller.listToolStreamSummaries(id).map((stream) => ({
        correlationId: stream.correlationId,
        toolName: stream.toolName,
        executionId: stream.executionId ?? undefined,
        planId: stream.planId ?? undefined,
        nodeId: stream.nodeId ?? undefined,
        chunkCount: stream.chunkCount,
        latestSequence: stream.latestSequence,
        updatedAt: stream.updatedAt,
        completed: stream.completed,
        hasError: stream.hasError
      }));
      return { streams };
    }
  );

  // GET /api/v1/executions/:id/tool-streams/:correlationId - 获取工具流详细数据
  app.get<{ Params: ToolStreamDetailParams }>(
    `${toolStreamsRoute}/:correlationId`,
    async (request, reply) => {
      const { id, correlationId } = request.params;
      const record = controller.getExecution(id);
      if (!record) {
        reply.code(404);
        return {
          error: { code: "execution_not_found", message: `未找到执行 ${id}` }
        };
      }
      const chunks = controller
        .getToolStreamChunks(id, correlationId)
        .map((chunk) => ({
          toolName: chunk.toolName,
          message: chunk.message,
          timestamp: chunk.timestamp,
          status: chunk.status,
          correlationId: chunk.correlationId,
          executionId: chunk.executionId ?? undefined,
          planId: chunk.planId ?? undefined,
          nodeId: chunk.nodeId ?? undefined,
          error: chunk.error ?? undefined,
          sequence: chunk.sequence,
          storedAt: chunk.storedAt,
          source: chunk.source ?? undefined
        }));
      return { chunks };
    }
  );

  // GET /api/v1/executions/:id/tool-streams/:correlationId/export - 导出工具流
  app.get<{
    Params: ToolStreamDetailParams;
    Querystring: ExportQueryParams;
  }>(
    `${toolStreamsRoute}/:correlationId/export`,
    async (request, reply) => {
      const { id, correlationId } = request.params;
      const record = controller.getExecution(id);
      if (!record) {
        reply.code(404);
        return {
          error: { code: "execution_not_found", message: `未找到执行 ${id}` }
        };
      }

      const { format = "json", compress = "false" } = request.query;
      const shouldCompress = compress === "true";

      try {
        const chunks = controller.getToolStreamChunks(id, correlationId);
        if (chunks.length === 0) {
          reply.code(404);
          return {
            error: {
              code: "tool_stream_not_found",
              message: `未找到工具流 ${correlationId}`
            }
          };
        }

        let content: string;
        let filename: string;
        let contentType: string;

        if (format === "json") {
          content = JSON.stringify(chunks, null, 2);
          filename = `tool-stream-${correlationId}.json`;
          contentType = "application/json";
        } else if (format === "txt") {
          content = chunks
            .map(
              (c) =>
                `[${c.timestamp}] ${c.toolName} (${c.status})\n${c.message}\n${c.error ? `ERROR: ${c.error}\n` : ""}`
            )
            .join("\n---\n\n");
          filename = `tool-stream-${correlationId}.txt`;
          contentType = "text/plain";
        } else {
          reply.code(400);
          return {
            error: {
              code: "invalid_format",
              message: "仅支持 json 和 txt 格式"
            }
          };
        }

        if (shouldCompress) {
          const { gzip } = await import("node:zlib");
          const { promisify } = await import("node:util");
          const gzipAsync = promisify(gzip);
          const compressed = await gzipAsync(Buffer.from(content, "utf-8"));
          filename += ".gz";
          contentType = "application/gzip";
          reply.header("Content-Type", contentType);
          reply.header("Content-Disposition", `attachment; filename="${filename}"`);
          return reply.send(compressed);
        } else {
          reply.header("Content-Type", contentType);
          reply.header("Content-Disposition", `attachment; filename="${filename}"`);
          return reply.send(content);
        }
      } catch (error) {
        reply.code(500);
        return {
          error: {
            code: "export_failed",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  // POST /api/v1/executions/:id/tool-streams/:correlationId/replay - 重放工具流
  app.post<{ Params: ToolStreamDetailParams }>(
    `${toolStreamsRoute}/:correlationId/replay`,
    async (request, reply) => {
      const { id, correlationId } = request.params;
      const record = controller.getExecution(id);
      if (!record) {
        reply.code(404);
        return {
          error: { code: "execution_not_found", message: `未找到执行 ${id}` }
        };
      }

      const replayed = controller.replayToolStream(id, correlationId);
      if (replayed === 0) {
        reply.code(404);
        return {
          error: {
            code: "tool_stream_not_found",
            message: `未找到流式输出 ${correlationId}`
          }
        };
      }

      return { replayed };
    }
  );
};
