import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { CompletedApprovalEntry, PendingApprovalEntry } from "./types.js";

const DEFAULT_DIR = resolve("state", "approvals");
const PENDING_FILE = "pending.json";
const COMPLETED_FILE = "completed.json";

interface StoreDocument<T> {
  version: number;
  items: T[];
}

interface ApprovalStoreOptions {
  directory?: string;
}

export class ApprovalStore {
  private readonly pendingPath: string;

  private readonly completedPath: string;

  constructor(options: ApprovalStoreOptions = {}) {
    const directory = resolve(options.directory ?? DEFAULT_DIR);
    mkdirSync(directory, { recursive: true });
    this.pendingPath = join(directory, PENDING_FILE);
    this.completedPath = join(directory, COMPLETED_FILE);
    this.ensureFile(this.pendingPath);
    this.ensureFile(this.completedPath);
  }

  async appendPending(entry: PendingApprovalEntry): Promise<void> {
    const document = this.readPending();
    const existingIndex = document.items.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      document.items[existingIndex] = entry;
    } else {
      document.items.push(entry);
    }
    this.writePending(document);
  }

  async appendCompleted(entry: CompletedApprovalEntry): Promise<void> {
    const pending = this.readPending();
    pending.items = pending.items.filter((item) => item.id !== entry.id);
    this.writePending(pending);

    const completed = this.readCompleted();
    const existingIndex = completed.items.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      completed.items[existingIndex] = entry;
    } else {
      completed.items.push(entry);
    }
    this.writeCompleted(completed);
  }

  async listPending(): Promise<PendingApprovalEntry[]> {
    const document = this.readPending();
    return [...document.items].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  async listCompleted(): Promise<CompletedApprovalEntry[]> {
    const document = this.readCompleted();
    return [...document.items].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  }

  async findDecision(id: string): Promise<CompletedApprovalEntry | undefined> {
    const document = this.readCompleted();
    return document.items.find((item) => item.id === id);
  }

  async findPending(id: string): Promise<PendingApprovalEntry | undefined> {
    const document = this.readPending();
    return document.items.find((item) => item.id === id);
  }

  close(): void {
    // JSON 存储无需显式关闭
  }

  private ensureFile(filePath: string): void {
    try {
      readFileSync(filePath, "utf-8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        mkdirSync(dirname(filePath), { recursive: true });
        const emptyDocument: StoreDocument<PendingApprovalEntry | CompletedApprovalEntry> = {
          version: 1,
          items: []
        };
        writeFileSync(filePath, `${JSON.stringify(emptyDocument)}\n`, "utf-8");
        return;
      }
      throw error;
    }
  }

  private readPending(): StoreDocument<PendingApprovalEntry> {
    return this.readDocument<PendingApprovalEntry>(this.pendingPath);
  }

  private readCompleted(): StoreDocument<CompletedApprovalEntry> {
    return this.readDocument<CompletedApprovalEntry>(this.completedPath);
  }

  private readDocument<T>(filePath: string): StoreDocument<T> {
    const raw = readFileSync(filePath, "utf-8");
    try {
      const parsed = JSON.parse(raw) as StoreDocument<T>;
      if (!parsed || !Array.isArray(parsed.items)) {
        return { version: 1, items: [] };
      }
      return { version: parsed.version ?? 1, items: parsed.items };
    } catch {
      return { version: 1, items: [] };
    }
  }

  private writePending(document: StoreDocument<PendingApprovalEntry>): void {
    this.writeDocument(this.pendingPath, document);
  }

  private writeCompleted(document: StoreDocument<CompletedApprovalEntry>): void {
    this.writeDocument(this.completedPath, document);
  }

  private writeDocument<T>(filePath: string, document: StoreDocument<T>): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify({ ...document, version: 1 })}\n`, "utf-8");
  }
}
