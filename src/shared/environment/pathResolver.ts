import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const HUSH_OPS_HOME = "HUSH_OPS_HOME";
const DIRECTORY_NAME = ".hush-ops";

interface ResolvedPaths {
  readonly root: string;
  readonly config: string;
  readonly state: string;
  readonly logs: string;
  readonly exports: string;
  readonly playwrightArtifacts: string;
}

let cachedPaths: ResolvedPaths | null = null;

function determineRoot(): string {
  const overrideHome = process.env[HUSH_OPS_HOME];
  if (overrideHome && overrideHome.trim().length > 0) {
    return path.resolve(overrideHome.trim());
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.resolve(appData, DIRECTORY_NAME);
  }

  if (process.platform === "darwin") {
    return path.resolve(os.homedir(), "Library", "Application Support", DIRECTORY_NAME);
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.resolve(xdgConfig, DIRECTORY_NAME);
}

function ensureDirectory(target: string): string {
  mkdirSync(target, { recursive: true });
  return target;
}

function resolvePaths(): ResolvedPaths {
  if (cachedPaths) {
    return cachedPaths;
  }

  const root = ensureDirectory(determineRoot());
  const config = ensureDirectory(path.join(root, "config"));
  const state = ensureDirectory(path.join(root, "state"));
  const logs = ensureDirectory(path.join(root, "logs"));
  const exportsDir = ensureDirectory(path.join(root, "exports"));
  const playwrightArtifacts = ensureDirectory(path.join(root, "playwright-artifacts"));

  cachedPaths = {
    root,
    config,
    state,
    logs,
    exports: exportsDir,
    playwrightArtifacts
  };
  return cachedPaths;
}

export function getHushOpsRootDirectory(): string {
  return resolvePaths().root;
}

export function getHushOpsConfigDirectory(): string {
  return resolvePaths().config;
}

export function getHushOpsStateDirectory(): string {
  return resolvePaths().state;
}

export function getHushOpsLogsDirectory(): string {
  return resolvePaths().logs;
}

export function getHushOpsExportsDirectory(): string {
  return resolvePaths().exports;
}

export function getHushOpsPlaywrightArtifactsDirectory(): string {
  return resolvePaths().playwrightArtifacts;
}

export function joinConfigPath(...segments: readonly string[]): string {
  return path.join(getHushOpsConfigDirectory(), ...segments);
}

export function joinStatePath(...segments: readonly string[]): string {
  return path.join(getHushOpsStateDirectory(), ...segments);
}

export function joinLogsPath(...segments: readonly string[]): string {
  return path.join(getHushOpsLogsDirectory(), ...segments);
}

export function resetHushOpsPathCache(): void {
  cachedPaths = null;
}
