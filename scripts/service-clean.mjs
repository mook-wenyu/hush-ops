#!/usr/bin/env node

/**
 * 清理 Orchestrator Service 残留进程和锁文件
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

const HUSH_OPS_HOME = process.env.HUSH_OPS_HOME;
const DIRECTORY_NAME = ".hush-ops";

function getStateDirectory() {
  if (HUSH_OPS_HOME && HUSH_OPS_HOME.trim().length > 0) {
    return join(HUSH_OPS_HOME.trim(), "state");
  }

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? process.env.LOCALAPPDATA ?? join(os.homedir(), "AppData", "Roaming");
    return join(appData, DIRECTORY_NAME, "state");
  }

  if (process.platform === "darwin") {
    return join(os.homedir(), "Library", "Application Support", DIRECTORY_NAME, "state");
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(os.homedir(), ".config");
  return join(xdgConfig, DIRECTORY_NAME, "state");
}

function killProcess(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /F /T`, { stdio: "inherit" });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: "inherit" });
    }
    return true;
  } catch (error) {
    console.error(`  ⚠️  无法终止进程 ${pid}:`, error.message);
    return false;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("🧹 开始清理 Orchestrator Service...\n");

  const stateDir = getStateDirectory();
  const lockFile = join(stateDir, "orchestrator.lock");

  if (!existsSync(lockFile)) {
    console.log("✓ 没有找到锁文件，无需清理");
    return;
  }

  try {
    const lockData = JSON.parse(readFileSync(lockFile, "utf-8"));
    const { pid, timestamp } = lockData;

    console.log(`📄 锁文件信息：`);
    console.log(`   PID: ${pid}`);
    console.log(`   启动时间: ${new Date(timestamp).toLocaleString()}`);
    console.log(`   锁文件路径: ${lockFile}\n`);

    // 检查进程是否还在运行
    if (isProcessRunning(pid)) {
      console.log(`🔍 检测到进程 ${pid} 仍在运行，正在终止...`);
      const killed = killProcess(pid);
      if (killed) {
        console.log(`✓ 进程 ${pid} 已终止\n`);
      } else {
        console.log(`⚠️  进程 ${pid} 终止失败，请手动处理\n`);
      }
    } else {
      console.log(`✓ 进程 ${pid} 已不存在\n`);
    }

    // 删除锁文件
    unlinkSync(lockFile);
    console.log(`✓ 锁文件已删除`);
    console.log(`\n✅ 清理完成！现在可以重新启动服务了。`);
  } catch (error) {
    console.error("❌ 清理过程出错：", error.message);
    console.log("\n尝试直接删除锁文件...");
    try {
      unlinkSync(lockFile);
      console.log("✓ 锁文件已删除");
    } catch (deleteError) {
      console.error("❌ 删除锁文件失败：", deleteError.message);
    }
  }
}

main().catch((error) => {
  console.error("清理脚本执行失败：", error);
  process.exit(1);
});
