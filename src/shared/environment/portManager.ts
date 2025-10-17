import { createServer } from "node:http";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

import { joinStatePath } from "./pathResolver.js";

/**
 * 端口管理工具，提供端口可用性检测、进程锁文件管理等功能
 */

export interface PortCheckResult {
  available: boolean;
  port: number;
  suggestion?: number;
}

/**
 * 检查端口是否可用
 * @param port 要检查的端口号
 * @returns 端口可用性检查结果
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * 查找下一个可用端口
 * @param startPort 起始端口号
 * @param maxAttempts 最大尝试次数
 * @returns 可用的端口号，如果找不到则抛出错误
 */
export async function findAvailablePort(
  startPort: number,
  maxAttempts = 10
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(
    `无法在 ${startPort}-${startPort + maxAttempts - 1} 范围内找到可用端口`
  );
}

/**
 * 检查端口并提供建议
 * @param preferredPort 首选端口号
 * @returns 端口检查结果，包含可用性和建议端口
 */
export async function checkPortWithSuggestion(
  preferredPort: number
): Promise<PortCheckResult> {
  const available = await isPortAvailable(preferredPort);

  if (available) {
    return { available: true, port: preferredPort };
  }

  // 如果首选端口不可用，尝试找到下一个可用端口
  try {
    const suggestedPort = await findAvailablePort(preferredPort + 1, 10);
    return {
      available: false,
      port: preferredPort,
      suggestion: suggestedPort
    };
  } catch {
    return { available: false, port: preferredPort };
  }
}

/**
 * 进程锁文件管理
 */
export class ProcessLock {
  private lockFilePath: string;
  private pid: number;

  constructor(serviceName: string) {
    this.lockFilePath = joinStatePath(`${serviceName}.lock`);
    this.pid = process.pid;
  }

  /**
   * 尝试获取锁
   * @param options 配置选项
   * @param options.force 是否强制获取锁（终止已运行的进程）
   * @returns 是否成功获取锁
   */
  async tryAcquire(options: { force?: boolean } = {}): Promise<boolean> {
    if (existsSync(this.lockFilePath)) {
      try {
        const content = await readFile(this.lockFilePath, "utf-8");
        const lockData = JSON.parse(content);

        // 检查锁文件中的进程是否仍在运行
        const isRunning = await this.isProcessRunning(lockData.pid);
        if (isRunning) {
          if (options.force) {
            console.log(
              `检测到服务已在运行（PID: ${lockData.pid}），正在终止...`
            );
            try {
              await this.killProcess(lockData.pid);
              console.log(`✓ 已终止进程 ${lockData.pid}`);
              await this.release();
            } catch (error) {
              console.error(`终止进程失败：${error}`);
              return false;
            }
          } else {
            console.warn(
              `服务已在运行（PID: ${lockData.pid}），启动于 ${new Date(lockData.timestamp).toLocaleString()}`
            );
            return false;
          }
        } else {
          // 清理过期的锁文件
          console.log(`清理过期的锁文件（PID: ${lockData.pid} 已不存在）`);
          await this.release();
        }
      } catch (error) {
        console.warn("读取锁文件失败，尝试删除：", error);
        await this.release();
      }
    }

    // 创建新的锁文件
    await writeFile(
      this.lockFilePath,
      JSON.stringify({
        pid: this.pid,
        timestamp: new Date().toISOString()
      }),
      "utf-8"
    );

    return true;
  }

  /**
   * 释放锁
   */
  async release(): Promise<void> {
    if (existsSync(this.lockFilePath)) {
      try {
        await unlink(this.lockFilePath);
      } catch (error) {
        console.warn("删除锁文件失败：", error);
      }
    }
  }

  /**
   * 检查进程是否在运行（跨平台）
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // 使用 process.kill(pid, 0) 检查进程是否存在
      // 0 信号不会实际发送信号，只是检查进程是否存在
      process.kill(pid, 0);
      return true;
    } catch {
      // ESRCH 表示进程不存在
      return false;
    }
  }

  /**
   * 终止进程（跨平台）
   */
  private async killProcess(pid: number): Promise<void> {
    try {
      if (process.platform === "win32") {
        // Windows: 使用 taskkill
        const { execa } = await import("execa");
        await execa("taskkill", ["/PID", String(pid), "/F", "/T"]);
        // Windows 需要额外等待端口释放
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Unix: 使用 SIGTERM，如果失败则使用 SIGKILL
        try {
          process.kill(pid, "SIGTERM");
          // 等待进程优雅退出
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // 检查进程是否还在运行
          const stillRunning = await this.isProcessRunning(pid);
          if (stillRunning) {
            process.kill(pid, "SIGKILL");
          }
        } catch {
          // 如果 SIGTERM 失败，直接使用 SIGKILL
          process.kill(pid, "SIGKILL");
        }
      }
    } catch (error) {
      throw new Error(`无法终止进程 ${pid}: ${error}`);
    }
  }

  /**
   * 获取锁文件路径
   */
  getLockFilePath(): string {
    return this.lockFilePath;
  }
}
