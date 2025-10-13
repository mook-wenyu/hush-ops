#!/usr/bin/env node
import { flush, run } from "@oclif/core";

import { createLoggerFacade } from "../shared/logging/logger.js";

const cliLogger = createLoggerFacade("cli", { command: process.argv.slice(2) });
cliLogger.info("cli invoked", {});
cliLogger.warn(
  "[迁移提示] CLI 将逐步弱化，请优先使用 Web UI 或 `npm run automation:sample` 等 SDK 脚本。详情见 docs/cli-migration.md。"
);

await run(undefined, import.meta.url);
await flush();
