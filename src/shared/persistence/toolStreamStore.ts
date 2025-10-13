import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

const DEFAULT_DIRECTORY = resolve("state");
const STORE_FILENAME = "tool-streams.json";

export class ToolStreamStore {
  private readonly storePath: string;

  private readonly memory: StoreDocument;

  constructor(options: ToolStreamStoreOptions = {}) {
    const directory = resolve(options.directory ?? DEFAULT_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    this.storePath = join(directory, STORE_FILENAME);
    this.memory = this.loadFromDisk();
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
    correlation.executionId = input.executionId ?? correlation.executionId;
    correlation.planId = input.planId ?? correlation.planId;
    correlation.nodeId = input.nodeId ?? correlation.nodeId;
    correlation.source = input.source ?? correlation.source;
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
    return Object.values(this.memory.correlations)
      .filter((entry) => entry.executionId === executionId)
      .map((entry) => ({
        correlationId: entry.correlationId,
        toolName: entry.toolName,
        executionId: entry.executionId,
        planId: entry.planId,
        nodeId: entry.nodeId,
        source: entry.source,
        chunkCount: entry.chunks.length,
        latestSequence: entry.chunks.length > 0 ? entry.chunks[entry.chunks.length - 1]?.sequence ?? 0 : 0,
        updatedAt: entry.updatedAt,
        completed: entry.chunks.some((chunk) => chunk.status === "success" || chunk.status === "error"),
        hasError: entry.chunks.some((chunk) => chunk.status === "error" || Boolean(chunk.error))
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
      executionId: input.executionId,
      planId: input.planId,
      nodeId: input.nodeId,
      source: input.source,
      updatedAt: input.timestamp,
      chunks: []
    };
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
  }

  private persistEmpty(): void {
    writeFileSync(this.storePath, `${JSON.stringify({ version: 1, correlations: {} })}\n`, "utf-8");
  }
}
