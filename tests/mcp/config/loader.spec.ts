import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, beforeEach } from "vitest";

import {
  getMcpServerConfig,
  listMcpServers,
  resetMcpServerConfigCache
} from "../../../src/mcp/config/loader.js";

async function createTempConfigFile(content: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mcp-config-"));
  const file = path.join(dir, "mcp.servers.json");
  await writeFile(file, JSON.stringify(content, null, 2), "utf-8");
  return file;
}

describe("mcp config loader", () => {
  beforeEach(() => {
    resetMcpServerConfigCache();
  });

  it("loads servers defined as array", async () => {
    const filePath = await createTempConfigFile({
      mcpServers: [
        {
          name: "filesystem",
          endpoint: "http://127.0.0.1:9020/mcp",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
        }
      ]
    });

    const servers = await listMcpServers({ filePath });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: "filesystem",
      endpoint: "http://127.0.0.1:9020/mcp",
      command: "npx"
    });
  });

  it("loads servers defined as record", async () => {
    const filePath = await createTempConfigFile({
      mcpServers: {
        search: {
          endpoint: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" }
        }
      }
    });

    const config = await getMcpServerConfig("search", { filePath });
    expect(config).toMatchObject({
      name: "search",
      endpoint: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" }
    });
  });

  it("throws informative error when server missing", async () => {
    const filePath = await createTempConfigFile({
      mcpServers: []
    });

    await expect(getMcpServerConfig("missing", { filePath })).rejects.toThrow(
      /未找到名为 missing 的 MCP server/i
    );
  });

  it("reuses cache between calls unless reload requested", async () => {
    const filePath = await createTempConfigFile({
      mcpServers: [
        {
          name: "first",
          endpoint: "http://localhost:9000/mcp"
        }
      ]
    });

    const first = await getMcpServerConfig("first", { filePath });
    expect(first.endpoint).toBe("http://localhost:9000/mcp");

    // Overwrite config with new endpoint to ensure cache is used.
    await writeFile(
      filePath,
      JSON.stringify(
        {
          mcpServers: [
            {
              name: "first",
              endpoint: "http://localhost:9999/mcp"
            }
          ]
        },
        null,
        2
      ),
      "utf-8"
    );

    const cached = await getMcpServerConfig("first", { filePath });
    expect(cached.endpoint).toBe("http://localhost:9000/mcp");

    const refreshed = await getMcpServerConfig("first", { filePath, reload: true });
    expect(refreshed.endpoint).toBe("http://localhost:9999/mcp");
  });
});
