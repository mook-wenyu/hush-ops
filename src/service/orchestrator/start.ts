import process from "node:process";

import { createOrchestratorService } from "./server.js";
import {
  checkPortWithSuggestion,
  ProcessLock
} from "../../shared/environment/portManager.js";

async function main() {
  const port = Number(process.env.ORCHESTRATOR_PORT ?? process.env.PORT ?? "3000");
  const host = process.env.ORCHESTRATOR_HOST ?? process.env.HOST ?? "127.0.0.1";
  const basePath = process.env.ORCHESTRATOR_BASE_PATH ?? "/api/v1";
  const databasePath = process.env.ORCHESTRATOR_DB_PATH;
  const defaultUseMockBridge = process.env.MCP_BRIDGE_MOCK === "1";

  // 检查是否为开发模式或强制重启模式
  const isDev = process.env.NODE_ENV === "development" || process.env.ORCHESTRATOR_DEV === "1";
  const forceRestart = process.env.ORCHESTRATOR_FORCE === "1" || isDev;

  // 进程锁管理
  const processLock = new ProcessLock("orchestrator");
  const lockAcquired = await processLock.tryAcquire({ force: forceRestart });

  if (!lockAcquired) {
    console.error("\n❌ 启动失败：Orchestrator Service 已在运行");
    console.error("\n💡 解决方案：");
    console.error("  1. 使用强制重启模式：ORCHESTRATOR_FORCE=1 npm run service:start");
    console.error("  2. 或手动终止进程：");
    if (process.platform === "win32") {
      console.error("     netstat -ano | findstr :3000");
      console.error("     taskkill /PID <进程ID> /F");
    } else {
      console.error("     lsof -i :3000");
      console.error("     kill <进程ID>");
    }
    console.error("  3. 或运行清理脚本：npm run service:clean");
    process.exit(1);
  }

  // 端口可用性检查
  const portCheck = await checkPortWithSuggestion(port);
  if (!portCheck.available) {
    console.error(`\n❌ 端口 ${port} 已被占用`);
    if (portCheck.suggestion) {
      console.error(`💡 建议使用端口 ${portCheck.suggestion}，请设置环境变量：`);
      console.error(`   export ORCHESTRATOR_PORT=${portCheck.suggestion}`);
      console.error(`   或在 .env 文件中设置 ORCHESTRATOR_PORT=${portCheck.suggestion}`);
    }
    console.error("\n或者终止占用端口的进程：");
    if (process.platform === "win32") {
      console.error(`  netstat -ano | findstr :${port}`);
      console.error("  taskkill /PID <进程ID> /F");
    } else {
      console.error(`  lsof -i :${port}`);
      console.error("  kill <进程ID>");
    }
    await processLock.release();
    process.exit(1);
  }

  const controllerOptions: any = { defaultUseMockBridge };
  if (databasePath) controllerOptions.databasePath = databasePath;
  const { app, controller } = await createOrchestratorService({
    basePath,
    controllerOptions
  });

  const close = async () => {
    console.log("\n正在关闭服务...");
    try {
      await app.close();
      console.log("✓ Fastify 服务已关闭");
    } finally {
      controller.close();
      console.log("✓ 控制器已关闭");
      await processLock.release();
      console.log("✓ 进程锁已释放");
    }
  };

  process.on("SIGINT", () => {
    console.log("\n收到 SIGINT 信号");
    void close().finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    console.log("\n收到 SIGTERM 信号");
    void close().finally(() => process.exit(0));
  });

  // 处理未捕获的异常
  process.on("uncaughtException", async (error) => {
    console.error("未捕获的异常：", error);
    await close();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error("未处理的 Promise 拒绝：", reason);
    await close();
    process.exit(1);
  });

  const address = await app.listen({ port, host });
  // Fastify 在 Node 18+ 返回实际监听地址，例如 'http://127.0.0.1:3000'
  const origin = typeof address === "string" ? address : `http://${host}:${port}`;
  console.log(`\n✅ Orchestrator Service 已启动：${origin}${basePath}`);
  console.log(`   进程 PID: ${process.pid}`);
  console.log(`   锁文件: ${processLock.getLockFilePath()}`);
  if (defaultUseMockBridge) {
    console.log("   已启用 MCP_BRIDGE_MOCK=1，可在无外部 MCP Server 的情况下试用。");
  }
  console.log("\n按 Ctrl+C 停止服务\n");
}

void main().catch(async (error) => {
  console.error("Orchestrator Service 启动失败", error);
  // 确保清理锁文件
  const processLock = new ProcessLock("orchestrator");
  await processLock.release();
  process.exit(1);
});
