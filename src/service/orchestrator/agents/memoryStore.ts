import { mkdir, readFile, writeFile, appendFile, rm, rename, stat } from "node:fs/promises";
import { join as pathJoin } from "node:path";

export type ChatRole = "user" | "assistant" | "tool";

export interface MemoryMessage {
  role: ChatRole;
  content: unknown;
  ts: string; // ISO string
  meta?: Record<string, unknown>;
}

export interface MemoryThread {
  sessionKey: string;
  messages: MemoryMessage[];
}

function getHomeDir(): string {
  const home = process.env.HUSH_OPS_HOME || process.cwd();
  return home;
}

function getConversationsDir(): string {
  return pathJoin(getHomeDir(), ".hush-ops", "state", "conversations");
}

function getSessionDir(sessionKey: string): string {
  return pathJoin(getConversationsDir(), encodeURIComponent(sessionKey));
}

function getLogPath(sessionKey: string): string {
  return pathJoin(getSessionDir(sessionKey), "thread.jsonl");
}

function getSnapshotPath(sessionKey: string): string {
  return pathJoin(getSessionDir(sessionKey), "snapshot.json");
}

export async function ensureSession(sessionKey: string): Promise<void> {
  await mkdir(getSessionDir(sessionKey), { recursive: true });
}

export async function appendMessage(sessionKey: string, message: MemoryMessage): Promise<void> {
  await ensureSession(sessionKey);
  const line = JSON.stringify(message) + "\n";
  await appendFile(getLogPath(sessionKey), line, { encoding: "utf-8" });
}

export async function getThread(sessionKey: string, limit?: number): Promise<MemoryThread> {
  try {
    const raw = await readFile(getLogPath(sessionKey), "utf-8");
    const lines = raw.split(/\n+/).filter(Boolean);
    const selected = typeof limit === "number" && limit > 0 ? lines.slice(-limit) : lines;
    const messages = selected.map((l) => JSON.parse(l) as MemoryMessage);
    return { sessionKey, messages };
  } catch {
    return { sessionKey, messages: [] };
  }
}

export async function clearThread(sessionKey: string): Promise<{ cleared: number }>{
  const dir = getSessionDir(sessionKey);
  const log = getLogPath(sessionKey);
  let count = 0;
  try {
    const t = await getThread(sessionKey);
    count = t.messages.length;
  } catch {}
  // snapshot for safety
  try {
    await mkdir(dir, { recursive: true });
    const snapshotTmp = getSnapshotPath(sessionKey) + ".tmp";
    const content = JSON.stringify({ sessionKey, clearedAt: new Date().toISOString() }, null, 2);
    await writeFile(snapshotTmp, content, "utf-8");
    await rename(snapshotTmp, getSnapshotPath(sessionKey));
  } catch {}
  try { await rm(log, { force: true }); } catch {}
  return { cleared: count };
}

export async function exportThread(sessionKey: string): Promise<string> {
  try {
    const raw = await readFile(getLogPath(sessionKey), "utf-8");
    return raw;
  } catch { return ""; }
}

export async function importThread(sessionKey: string, jsonl: string, { replace = false } = {}): Promise<{ imported: number }>{
  await ensureSession(sessionKey);
  const log = getLogPath(sessionKey);
  if (replace) {
    try { await rm(log, { force: true }); } catch {}
  }
  const lines = jsonl.split(/\n+/).filter(Boolean);
  let n = 0;
  for (const line of lines) {
    try {
      JSON.parse(line); // validate
      await appendFile(log, line + "\n", { encoding: "utf-8" });
      n++;
    } catch {}
  }
  return { imported: n };
}

export async function hasThread(sessionKey: string): Promise<boolean> {
  try { const s = await stat(getLogPath(sessionKey)); return s.isFile(); } catch { return false; }
}
