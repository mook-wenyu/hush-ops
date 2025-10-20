import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";

import { getHushOpsStateDirectory } from "../environment/pathResolver.js";

export interface ToolStreamChunkInput {
  readonly correlationId: string;
  readonly toolName: string;
  readonly executionId?: string;
  readonly planId?: string;
  readonly nodeId?: string;
  readonly status: string;
  readonly message: string;
  readonly timestamp: string;
  readonly error?: string;
  readonly source?: string;
}

export interface ToolStreamChunk extends ToolStreamChunkInput {
  readonly id: string;
  readonly sequence: number;
  readonly storedAt: string;
}

export interface ToolStreamSummary {
  readonly correlationId: string;
  readonly toolName: string;
  readonly executionId?: string;
  readonly planId?: string;
  readonly nodeId?: string;
  readonly source?: string;
  readonly chunkCount: number;
  readonly latestSequence: number;
  readonly updatedAt: string;
  readonly completed: boolean;
  readonly hasError: boolean;
}

export interface ToolStreamStoreOptions {
  readonly directory?: string;
}

interface StoredCorrelation {
  correlationId: string;
  toolName: string;
  executionId?: string;
  planId?: string;
  nodeId?: string;
  source?: string;
  updatedAt: string;
  chunks: ToolStreamChunk[];
}

interface StoreDocument {
  version: number;
  correlations: Record<string, StoredCorrelation>;
}

const DEFAULT_DIRECTORY = getHushOpsStateDirectory();
const STORE_FILENAME = "tool-streams.json";

export class ToolStreamStore {
  private readonly storePath: string;

  private readonly memory: StoreDocument;

  constructor(options: ToolStreamStoreOptions = {}) {
    const directory = resolve(options.directory ?? DEFAULT_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    this.storePath = join(directory, STORE_FILENAME);
    this.memory = this.loadFromDisk();
    this.archiveOldData();
  }

  appendChunk(input: ToolStreamChunkInput): ToolStreamChunk {
    const correlation = this.ensureCorrelation(input);
    const sequence = correlation.chunks.length;
    const id = randomUUID();
    const chunk: ToolStreamChunk = {
      ...input,
      id,
      sequence,
      storedAt: input.timestamp
    };
    correlation.toolName = input.toolName;
    if (typeof input.executionId !== "undefined") correlation.executionId = input.executionId;
    if (typeof input.planId !== "undefined") correlation.planId = input.planId;
    if (typeof input.nodeId !== "undefined") correlation.nodeId = input.nodeId;
    if (typeof input.source !== "undefined") correlation.source = input.source;
    correlation.updatedAt = input.timestamp;
    correlation.chunks.push(chunk);
    this.persist();
    return chunk;
  }

  listChunks(correlationId: string): ToolStreamChunk[] {
    const record = this.memory.correlations[correlationId];
    if (!record) {
      return [];
    }
    return record.chunks.map((chunk) => ({ ...chunk }));
  }

  listSummariesByExecution(executionId: string): ToolStreamSummary[] {
    return this.listSummariesAll(executionId);
  }

  listSummariesAll(executionId?: string): ToolStreamSummary[] {
    const items = Object.values(this.memory.correlations)
      .filter((entry) => (executionId ? entry.executionId === executionId : true))
      .map((entry) => {
        const summary: any = {
          correlationId: entry.correlationId,
          toolName: entry.toolName,
          chunkCount: entry.chunks.length,
          latestSequence:
            entry.chunks.length > 0 ? entry.chunks[entry.chunks.length - 1]?.sequence ?? 0 : 0,
          updatedAt: entry.updatedAt,
          completed: entry.chunks.some((chunk) => chunk.status === "success" || chunk.status === "error"),
          hasError: entry.chunks.some((chunk) => chunk.status === "error" || Boolean(chunk.error))
        };
        if (entry.executionId) summary.executionId = entry.executionId;
        if (entry.planId) summary.planId = entry.planId;
        if (entry.nodeId) summary.nodeId = entry.nodeId;
        if (entry.source) summary.source = entry.source;
        return summary as ToolStreamSummary;
      });
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  clearByExecution(executionId: string): void {
    const keys = Object.keys(this.memory.correlations);
    let changed = false;
    for (const key of keys) {
      if (this.memory.correlations[key]?.executionId === executionId) {
        delete this.memory.correlations[key];
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
  }

  close(): void {
    // JSON 存储无需显式关闭
  }

  private ensureCorrelation(input: ToolStreamChunkInput): StoredCorrelation {
    const existing = this.memory.correlations[input.correlationId];
    if (existing) {
      return existing;
    }
    const created: StoredCorrelation = {
      correlationId: input.correlationId,
      toolName: input.toolName,
      updatedAt: input.timestamp,
      chunks: []
    };
    if (input.executionId) created.executionId = input.executionId;
    if (input.planId) created.planId = input.planId;
    if (input.nodeId) created.nodeId = input.nodeId;
    if (input.source) created.source = input.source;
    this.memory.correlations[input.correlationId] = created;
    return created;
  }

  private loadFromDisk(): StoreDocument {
    try {
      const raw = readFileSync(this.storePath, "utf-8");
      const parsed = JSON.parse(raw) as StoreDocument;
      if (!parsed || typeof parsed !== "object" || !parsed.correlations) {
        return { version: 1, correlations: {} };
      }
      return {
        version: parsed.version ?? 1,
        correlations: parsed.correlations
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.persistEmpty();
        return { version: 1, correlations: {} };
      }
      return { version: 1, correlations: {} };
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, `${JSON.stringify({ ...this.memory, version: 1 })}\n`, "utf-8");
    this.rotateIfNeeded();
  }

  private rotateIfNeeded(): void {
    // 通过环境变量配置：TOOL_STREAM_STORE_MAX_BYTES（默认 50MB）、TOOL_STREAM_STORE_COMPRESS（1/0）
    const maxBytes = Number(process.env.TOOL_STREAM_STORE_MAX_BYTES ?? 50 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;
    try {
      const size = statSync(this.storePath).size;
      if (size <= maxBytes) return;
      const baseDir = dirname(this.storePath);
      const archivesDir = join(baseDir, "archives");
      mkdirSync(archivesDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = `tool-streams-${ts}.json`;
      const compress = (process.env.TOOL_STREAM_STORE_COMPRESS ?? "1") === "1";
      const target = compress ? join(archivesDir, baseName + ".gz") : join(archivesDir, baseName);
      const payload = Buffer.from(JSON.stringify({ ...this.memory, version: 1 }));
      const data = compress ? gzipSync(payload) : payload;
      writeFileSync(target, data);
      // 归档后清空内存与主文件，避免持续膨胀
      (this.memory as StoreDocument).correlations = {};
      this.persistEmpty();
    } catch {
      // 忽略滚动失败，避免影响主流程
    }
  }

  private persistEmpty(): void {
    writeFileSync(
      this.storePath,
      `${JSON.stringify({ version: 1, correlations: {} })}\n`,
      "utf-8"
    );
  }

  private archiveOldData(): void {
    const ageThresholdDays = Number(process.env.TOOL_STREAM_ARCHIVE_DAYS ?? 30);
    if (!Number.isFinite(ageThresholdDays) || ageThresholdDays <= 0) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ageThresholdDays);
    const cutoffISO = cutoffDate.toISOString();

    const toArchive: StoredCorrelation[] = [];
    for (const [id, correlation] of Object.entries(this.memory.correlations)) {
      if (correlation.updatedAt < cutoffISO) {
        toArchive.push(correlation);
        delete this.memory.correlations[id];
      }
    }

    if (toArchive.length > 0) {
      const baseDir = dirname(this.storePath);
      const archivesDir = join(baseDir, "archives");
      mkdirSync(archivesDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const archivePath = join(archivesDir, `tool-streams-aged-${ts}.json.gz`);
      const compressed = gzipSync(JSON.stringify({ version: 1, correlations: toArchive }));
      writeFileSync(archivePath, compressed);
      this.persist();
    }
  }
}
