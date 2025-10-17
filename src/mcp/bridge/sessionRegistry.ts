import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getHushOpsStateDirectory } from "../../shared/environment/pathResolver.js";

export interface BridgeSessionRecord {
  serverName: string;
  userId: string;
  sessionId: string;
  lastEventId?: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface BridgeSessionRegistry {
  load(serverName: string, userId?: string): BridgeSessionRecord | null;
  save(record: BridgeSessionRecord): void;
  clear(serverName: string, userId?: string): void;
  close(): void;
}

interface JsonBridgeSessionRegistryOptions {
  directory?: string;
  defaultUserId?: string;
}

const DEFAULT_DIRECTORY = getHushOpsStateDirectory();
const STORE_FILENAME = "mcp-sessions.json";

interface StoreDocument {
  version: number;
  records: Record<string, BridgeSessionRecord>;
}

export class FileBridgeSessionRegistry implements BridgeSessionRegistry {
  private readonly storePath: string;

  private readonly defaultUserId: string;

  private readonly state: StoreDocument;

  constructor(options: JsonBridgeSessionRegistryOptions = {}) {
    const directory = resolve(options.directory ?? DEFAULT_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    this.storePath = join(directory, STORE_FILENAME);
    this.defaultUserId = options.defaultUserId ?? "default";
    this.state = this.loadFromDisk();
  }

  load(serverName: string, userId?: string): BridgeSessionRecord | null {
    const key = this.makeKey(serverName, userId ?? this.defaultUserId);
    const record = this.state.records[key];
    if (!record) {
      return null;
    }
    return { ...record };
  }

  save(record: BridgeSessionRecord): void {
    const key = this.makeKey(record.serverName, record.userId ?? this.defaultUserId);
    this.state.records[key] = { ...record, userId: record.userId ?? this.defaultUserId };
    this.persist();
  }

  clear(serverName: string, userId?: string): void {
    const key = this.makeKey(serverName, userId ?? this.defaultUserId);
    if (this.state.records[key]) {
      delete this.state.records[key];
      this.persist();
    }
  }

  close(): void {
    // JSON 存储无需显式关闭
  }

  private makeKey(serverName: string, userId: string): string {
    return `${serverName}::${userId}`;
  }

  private loadFromDisk(): StoreDocument {
    try {
      const raw = readFileSync(this.storePath, "utf-8");
      const parsed = JSON.parse(raw) as StoreDocument;
      if (!parsed || typeof parsed !== "object" || !parsed.records) {
        return { version: 1, records: {} };
      }
      return {
        version: parsed.version ?? 1,
        records: parsed.records
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.persistEmpty();
      }
      return { version: 1, records: {} };
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, `${JSON.stringify({ ...this.state, version: 1 })}\n`, "utf-8");
  }

  private persistEmpty(): void {
    writeFileSync(this.storePath, `${JSON.stringify({ version: 1, records: {} })}\n`, "utf-8");
  }
}
