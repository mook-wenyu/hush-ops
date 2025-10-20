import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Cron } from "croner";
import { execa } from "execa";
import got from "got";

import type { PlanNode } from "../../shared/schemas/plan.js";
import type { PlanNodeAdapter } from "./base.js";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

function resolveFilePath(baseCwd: string | undefined, target: string): string {
  if (target.startsWith("./") || target.startsWith("../")) {
    const cwd = baseCwd ? resolve(baseCwd) : process.cwd();
    return resolve(cwd, target);
  }
  return resolve(target);
}

async function runShellTask(node: Extract<PlanNode, { type: "local_task" }>, ctx: Parameters<PlanNodeAdapter["execute"]>[1]) {
  if (!node.command) {
    throw new Error(`local_task(shell) 节点 ${node.id} 缺少 command`);
  }
  const execaOptions: any = { shell: false };
  if (node.cwd) execaOptions.cwd = node.cwd;
  const subprocess = await execa(node.command, node.args ?? [], execaOptions);
  const output = {
    driver: node.driver,
    command: node.command,
    args: node.args ?? [],
    exitCode: subprocess.exitCode,
    stdout: subprocess.stdout,
    stderr: subprocess.stderr
  };
  ctx.sharedState.set(`${node.id}.output`, output);
  ctx.logger.info(`local_task(shell) 执行完成`, {
    nodeId: node.id,
    exitCode: subprocess.exitCode
  });
  return output;
}

async function runHttpTask(node: Extract<PlanNode, { type: "local_task" }>, ctx: Parameters<PlanNodeAdapter["execute"]>[1]) {
  const request = node.request;
  if (!request) {
    throw new Error(`local_task(http) 节点 ${node.id} 缺少 request 配置`);
  }
  const method = request.method ?? "GET";
  if (!HTTP_METHODS.has(method)) {
    throw new Error(`local_task(http) 不支持的 HTTP 方法: ${method}`);
  }
  const options: Record<string, unknown> = {
    method,
    headers: request.headers,
    timeout: {
      request: request.timeoutMs ?? 10000
    },
    throwHttpErrors: false
  };
  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null) {
      options.json = request.body as Record<string, unknown>;
    } else {
      options.body = request.body;
    }
  }
  const response = await got(request.url, options);
  const contentType = response.headers["content-type"];
  let parsedBody: unknown = response.body;
  if (typeof parsedBody === "string" && contentType?.includes("application/json")) {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch (error) {
      ctx.logger.warn(`local_task(http) 解析 JSON 失败`, {
        nodeId: node.id,
        error: (error as Error).message
      });
    }
  }
  const output = {
    driver: node.driver,
    request: {
      method,
      url: request.url,
      headers: request.headers
    },
    response: {
      statusCode: response.statusCode,
      headers: response.headers,
      body: parsedBody
    }
  };
  ctx.sharedState.set(`${node.id}.output`, output);
  ctx.logger.info(`local_task(http) 请求完成`, {
    nodeId: node.id,
    statusCode: response.statusCode
  });
  return output;
}

async function runFileTask(node: Extract<PlanNode, { type: "local_task" }>, ctx: Parameters<PlanNodeAdapter["execute"]>[1]) {
  const action = (node.metadata as Record<string, unknown> | undefined)?.action ?? "read";
  const filePath = node.args?.[0] ?? node.command;
  if (!filePath) {
    throw new Error(`local_task(file) 节点 ${node.id} 需要 args[0] 或 command 指定文件路径`);
  }
  const absolutePath = resolveFilePath(node.cwd, filePath);
  if (action === "write") {
    const content = (node.metadata as Record<string, unknown> | undefined)?.content;
    if (typeof content !== "string") {
      throw new Error(`local_task(file) 写入操作需要 metadata.content (string)`);
    }
    await writeFile(absolutePath, content, "utf-8");
    ctx.logger.info(`local_task(file) 写入完成`, { nodeId: node.id, path: absolutePath });
    const output = { driver: node.driver, action, path: absolutePath, bytesWritten: Buffer.byteLength(content, "utf-8") };
    ctx.sharedState.set(`${node.id}.output`, output);
    return output;
  }
  const data = await readFile(absolutePath, "utf-8");
  ctx.logger.info(`local_task(file) 读取完成`, { nodeId: node.id, path: absolutePath });
  const output = { driver: node.driver, action: "read", path: absolutePath, content: data };
  ctx.sharedState.set(`${node.id}.output`, output);
  return output;
}

function runScheduledTask(node: Extract<PlanNode, { type: "local_task" }>, ctx: Parameters<PlanNodeAdapter["execute"]>[1]) {
  const cronExpr = node.schedule?.cron;
  if (!cronExpr) {
    throw new Error(`local_task(scheduled) 节点 ${node.id} 需要 schedule.cron`);
  }
  const cronJob = new Cron(cronExpr, { maxRuns: 1, startAt: new Date() });
  const nextRun = cronJob.nextRun();
  cronJob.stop();
  const output = {
    driver: node.driver,
    cron: cronExpr,
    nextRun: nextRun?.toISOString() ?? null
  };
  ctx.sharedState.set(`${node.id}.output`, output);
  ctx.logger.info(`local_task(scheduled) 已登记`, { nodeId: node.id, nextRun: output.nextRun });
  return output;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type LocalTaskDriver = Extract<PlanNode, { type: "local_task" }>["driver"];

function classifyFailure(
  driver: LocalTaskDriver,
  error: unknown
): { classification: string; details?: Record<string, unknown> } {
  if (driver === "shell") {
    const shellError = error as { exitCode?: number; timedOut?: boolean } | undefined;
    if (shellError?.timedOut) {
      return { classification: "shell_timeout" };
    }
    if (typeof shellError?.exitCode === "number") {
      return { classification: "shell_exit_code", details: { exitCode: shellError.exitCode } };
    }
    return { classification: "shell_error" };
  }
  if (driver === "http") {
    const httpError = error as {
      response?: { statusCode?: number };
      code?: string;
    };
    if (httpError?.response?.statusCode) {
      return {
        classification: "http_status",
        details: { statusCode: httpError.response.statusCode }
      };
    }
    if (httpError?.code === "ETIMEDOUT" || httpError?.code === "ECONNABORTED") {
      return {
        classification: "http_timeout",
        details: { code: httpError.code }
      };
    }
    if (httpError?.code) {
      return { classification: "http_error", details: { code: httpError.code } };
    }
    return { classification: "http_error" };
  }
  if (driver === "file") {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError?.code) {
      return {
        classification: "fs_error",
        details: { code: fsError.code }
      };
    }
    return { classification: "fs_error" };
  }
  return { classification: "task_error" };
}

export function createLocalTaskAdapter(): PlanNodeAdapter<Extract<PlanNode, { type: "local_task" }>> {
  return {
    type: "local_task",
    async execute(node, ctx) {
      const maxAttempts = node.retryPolicy?.maxAttempts ?? 1;
      const backoffMs = Math.max(0, (node.retryPolicy?.backoffSeconds ?? 0) * 1000);
      let attempt = 0;
      let lastError: unknown;

      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          let output: unknown;
          switch (node.driver) {
            case "shell":
              output = await runShellTask(node, ctx);
              break;
            case "http":
              output = await runHttpTask(node, ctx);
              break;
            case "file":
              output = await runFileTask(node, ctx);
              break;
            case "scheduled":
              output = runScheduledTask(node, ctx);
              break;
            default:
              throw new Error(`未支持的 local_task driver: ${node.driver}`);
          }
          ctx.sharedState.set(`${node.id}.error`, null);
          return {
            nodeId: node.id,
            status: "success",
            output
          };
        } catch (error) {
          lastError = error;
          const message =
            error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
          const failureInfo = classifyFailure(node.driver, error);
          const errorContext: Record<string, unknown> = {
            nodeId: node.id,
            attempt,
            maxAttempts,
            classification: failureInfo.classification
          };
          if (failureInfo.details) {
            errorContext.details = failureInfo.details;
          }
          ctx.logger.error(`local_task 执行失败`, error, errorContext);
          ctx.sharedState.set(`${node.id}.error`, {
            message,
            attempt,
            maxAttempts,
            classification: failureInfo.classification,
            ...(failureInfo.details ? { details: failureInfo.details } : {})
          });
          if (attempt < maxAttempts) {
            ctx.logger.warn(`local_task 即将重试`, {
              nodeId: node.id,
              nextAttempt: attempt + 1,
              maxAttempts,
              backoffSeconds: backoffMs / 1000
            });
            await wait(backoffMs);
          }
        }
      }

      return {
        nodeId: node.id,
        status: "failed",
        error: lastError
      };
    }
  };
}
