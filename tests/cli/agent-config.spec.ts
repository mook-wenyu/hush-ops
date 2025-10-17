import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const CLI_ENTRY = resolve("src/cli/index.ts");
const NODE = process.execPath;
const SAMPLE_MODULE = "./src/agents/plugins/demandAnalysis.ts";

async function runCli(args: string[]) {
  return execa(NODE, ["--import", "tsx", CLI_ENTRY, ...args]);
}

describe("agents:config CLI", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hush-ops-agents-config-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("list prints fallback when directory empty", async () => {
    const { stdout } = await runCli(["agents:config:list", "--directory", tempDir]);
    expect(stdout.trim()).toBe("未找到任何智能体配置。");
  }, 30000);

  test("generate dry-run outputs JSON", async () => {
    const { stdout } = await runCli([
      "agents:config:generate",
      "--id",
      "demo-agent",
      "--module",
      SAMPLE_MODULE,
      "--dry-run"
    ]);
    expect(stdout).toContain("\"id\": \"demo-agent\"");
    expect(stdout).toContain(SAMPLE_MODULE);
  }, 30000);

  test("generate writes file and list displays entry", async () => {
    const id = "demo-write";
    await runCli([
      "agents:config:generate",
      "--id",
      id,
      "--module",
      SAMPLE_MODULE,
      "--directory",
      tempDir
    ]);

    const written = await readFile(join(tempDir, `${id}.json`), "utf-8");
    expect(written).toContain(id);

    const { stdout } = await runCli(["agents:config:list", "--directory", tempDir]);
    expect(stdout).toContain(id);
  }, 30000);
});
