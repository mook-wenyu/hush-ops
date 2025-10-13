import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, afterEach } from "vitest";

import { FileBridgeSessionRegistry, type BridgeSessionRecord } from "../../src/mcp/bridge/sessionRegistry.js";

function createRecord(overrides: Partial<BridgeSessionRecord> = {}): BridgeSessionRecord {
  return {
    serverName: overrides.serverName ?? "local-server",
    userId: overrides.userId ?? "default",
    sessionId: overrides.sessionId ?? "session-1",
    lastEventId: overrides.lastEventId,
    metadata: overrides.metadata,
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  };
}

const tempDirs: string[] = [];

function createRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "mcp-sessions-"));
  tempDirs.push(dir);
  return new FileBridgeSessionRegistry({ directory: dir });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("FileBridgeSessionRegistry", () => {
  it("saves and loads session records", () => {
    const registry = createRegistry();
    const record = createRecord();
    registry.save(record);

    const loaded = registry.load(record.serverName, record.userId);
    expect(loaded).toEqual(record);
    registry.close();
  });

  it("updates existing record on save", () => {
    const registry = createRegistry();
    const record = createRecord();
    registry.save(record);

    const updatedAt = new Date().toISOString();
    registry.save({
      ...record,
      lastEventId: "event-123",
      updatedAt
    });

    const loaded = registry.load(record.serverName, record.userId);
    expect(loaded).toEqual({
      ...record,
      lastEventId: "event-123",
      updatedAt
    });
    registry.close();
  });

  it("clears records for the given server and user", () => {
    const registry = createRegistry();
    const record = createRecord({ sessionId: "session-x" });
    registry.save(record);

    registry.clear(record.serverName, record.userId);
    const afterClear = registry.load(record.serverName, record.userId);
    expect(afterClear).toBeNull();
    registry.close();
  });
});
