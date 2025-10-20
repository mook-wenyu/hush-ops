import type { FastifyPluginAsync } from "fastify/types/plugin.js";
import { readdir, readFile, writeFile, mkdir, stat, unlink, rm } from "node:fs/promises";
import { join as pathJoin, dirname, basename as pathBasename } from "node:path";
import { joinConfigPath } from "../../../shared/environment/pathResolver.js";

type FSScope = "plansRepo" | "plansConfig" | "state" | "archives" | "logs";

interface ListQuery {
  scope?: FSScope;
  path?: string;
}

interface ReadQuery {
  scope?: FSScope;
  path?: string;
  download?: string;
}

interface WriteBody {
  scope?: FSScope;
  path?: string;
  content?: string;
  overwrite?: boolean;
}

interface MkdirBody {
  scope?: FSScope;
  path?: string;
}

interface MoveBody {
  scope?: FSScope;
  from?: string;
  to?: string;
}

interface DeleteBody {
  scope?: FSScope;
  path?: string;
  recursive?: boolean;
}

async function resolveScopeDir(scope: FSScope): Promise<string> {
  switch (scope) {
    case "plansRepo":
      return pathJoin(process.cwd(), "plans");
    case "plansConfig":
      return joinConfigPath("plans");
    case "state":
      return joinConfigPath("..", "state");
    case "archives":
      return pathJoin(joinConfigPath("..", "state"), "archives");
    case "logs":
      return joinConfigPath("..", "logs");
    default:
      return joinConfigPath("plans");
  }
}

async function resolvePathWithin(
  scope: FSScope,
  relPath: string
): Promise<{ abs: string; base: string }> {
  const base = await resolveScopeDir(scope);
  const abs = pathJoin(base, relPath || ".");
  const normBase = base.replace(/\\/g, "/");
  const normAbs = abs.replace(/\\/g, "/");
  if (!normAbs.startsWith(normBase)) {
    throw new Error("路径越界");
  }
  return { abs, base };
}

export const fsPlugin: FastifyPluginAsync = async (app) => {
  const basePath = "/api/v1";
  const fsRoute = `${basePath}/fs`;

  // GET /api/v1/fs/list - 列出目录
  app.get<{ Querystring: ListQuery }>(
    `${fsRoute}/list`,
    async (request, reply) => {
      const q = request.query;
      const scope = (q?.scope ?? "plansConfig") as FSScope;
      const { abs } = await resolvePathWithin(scope, q?.path ?? ".");
      let s: Awaited<ReturnType<typeof stat>>;
      try {
        s = await stat(abs);
      } catch {
        reply.code(404);
        return { error: { code: "not_found", message: "路径不存在" } };
      }
      if (!s.isDirectory()) {
        reply.code(400);
        return { error: { code: "not_directory", message: "路径不是目录" } };
      }
      const names = await readdir(abs);
      const entries = [] as Array<{
        name: string;
        type: "file" | "dir";
        size: number;
        modifiedAt: string;
      }>;
      for (const name of names) {
        try {
          const info = await stat(pathJoin(abs, name));
          entries.push({
            name,
            type: info.isDirectory() ? "dir" : "file",
            size: Number(info.size ?? 0),
            modifiedAt: new Date(info.mtimeMs).toISOString()
          });
        } catch {
          // 忽略单个文件错误
        }
      }
      return { entries };
    }
  );

  // GET /api/v1/fs/read - 读取文件
  app.get<{ Querystring: ReadQuery }>(
    `${fsRoute}/read`,
    async (request, reply) => {
      const q = request.query;
      const scope = (q?.scope ?? "plansConfig") as FSScope;
      const rel = q?.path ?? "";
      const { abs } = await resolvePathWithin(scope, rel);
      try {
        const s = await stat(abs);
        if (!s.isFile()) {
          reply.code(400);
          return { error: { code: "not_file", message: "目标不是文件" } };
        }
        const text = await readFile(abs, "utf-8");
        const downloading = (q?.download ?? "0") === "1";
        if (downloading) {
          reply.header("Content-Type", "application/json; charset=utf-8");
          reply.header(
            "Content-Disposition",
            `attachment; filename="${rel.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`
          );
          return reply.send(text);
        }
        return { path: rel, content: text };
      } catch (e) {
        reply.code(404);
        return {
          error: { code: "read_failed", message: (e as Error).message }
        };
      }
    }
  );

  // POST /api/v1/fs/write - 写入文件
  app.post<{ Body: WriteBody }>(
    `${fsRoute}/write`,
    async (request, reply) => {
      const body = request.body;
      const scope = (body?.scope ?? "plansConfig") as FSScope;
      const rel = body?.path ?? "";
      const { abs } = await resolvePathWithin(scope, rel);
      try {
        // Windows 设备名防护（同时适用于多数平台）：CON/PRN/AUX/NUL/COM1..9/LPT1..9（允许扩展名变体）
        const base = pathBasename(abs);
        if (
          /^(?:(?:CON|PRN|AUX|NUL)|(?:COM[1-9])|(?:LPT[1-9]))(?:\..*)?$/i.test(
            base
          )
        ) {
          reply.code(400);
          return {
            error: { code: "invalid_name", message: "保留设备名不可用" }
          };
        }
        const dir = dirname(abs);
        await mkdir(dir, { recursive: true });
        const exists = await stat(abs)
          .then((s) => s.isFile())
          .catch(() => false);
        if (exists && body?.overwrite === false) {
          reply.code(409);
          return { error: { code: "exists", message: "文件已存在" } };
        }
        await writeFile(abs, body?.content ?? "", "utf-8");
        return { saved: true };
      } catch (e) {
        reply.code(422);
        return {
          error: { code: "write_failed", message: (e as Error).message }
        };
      }
    }
  );

  // POST /api/v1/fs/mkdir - 创建目录
  app.post<{ Body: MkdirBody }>(
    `${fsRoute}/mkdir`,
    async (request, _reply) => {
      const body = request.body;
      const scope = (body?.scope ?? "plansConfig") as FSScope;
      const { abs } = await resolvePathWithin(scope, body?.path ?? "");
      await mkdir(abs, { recursive: true });
      return { created: true };
    }
  );

  // POST /api/v1/fs/move - 移动文件
  app.post<{ Body: MoveBody }>(
    `${fsRoute}/move`,
    async (request, reply) => {
      const body = request.body;
      const scope = (body?.scope ?? "plansConfig") as FSScope;
      const { abs: fromAbs } = await resolvePathWithin(scope, body?.from ?? "");
      const { abs: toAbs } = await resolvePathWithin(scope, body?.to ?? "");
      try {
        const dir = dirname(toAbs);
        await mkdir(dir, { recursive: true });
        await writeFile(toAbs, await readFile(fromAbs));
        await unlink(fromAbs).catch(() => {});
        return { moved: true };
      } catch (e) {
        reply.code(422);
        return {
          error: { code: "move_failed", message: (e as Error).message }
        };
      }
    }
  );

  // DELETE /api/v1/fs/delete - 删除文件或目录
  app.delete<{ Body: DeleteBody }>(
    `${fsRoute}/delete`,
    async (request, reply) => {
      const body = request.body;
      const scope = (body?.scope ?? "plansConfig") as FSScope;
      const { abs } = await resolvePathWithin(scope, body?.path ?? "");
      try {
        const s = await stat(abs);
        if (s.isDirectory()) {
          await rm(abs, { recursive: !!body?.recursive, force: true });
        } else {
          await unlink(abs);
        }
        return { deleted: true };
      } catch (e) {
        reply.code(422);
        return {
          error: { code: "delete_failed", message: (e as Error).message }
        };
      }
    }
  );
};
