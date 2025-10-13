# hush-ops

混合编排平台原型，基于 `@openai/agents` 与 LangGraph 规划的双层架构：默认提供一个插件化 AI 智能体示例（可通过 Meta Agent 生成器替换），为普通任务 + AI 智能体 + MCP 工具的协同执行奠定基础。

## 快速开始
1. 安装依赖：`npm install`
2. 配置环境变量（示例为 PowerShell）：
   ```powershell
   $Env:OPENAI_API_KEY = "sk-..."
   # 可选：$Env:OPENAI_BASE_URL = "https://your-endpoint/v1"
   ```
3. 立即体验：`npm run dev -- ./samples/demo.md`
   - 若省略参数，脚本会读取示例内置文档。
   - 也可传入自定义内容：`npm run dev -- --text "项目背景：..."`，脚本会直接解析命令行文本。
   - `samples/demo.md` 为项目自带的示例需求文档，可用于验证输出结构。
4. 自动连续执行演示：`npm run auto:run -- --plan ./plans/sample.plan.json`（可设置 `MCP_BRIDGE_MOCK=1` 使用内置模拟服务）。脚本默认将检查点与审批状态写入 JSON 文件（`state/checkpoints/*.json`、`state/approvals/*.json`）。
5. 配置 MCP 服务器：编辑 `config/mcp.servers.json` 增加或调整服务器别名、命令与 HTTP endpoint（支持通过环境变量 `MCP_SERVERS_CONFIG_PATH` 指定其他路径）。CLI 与 Web UI 会基于该配置列出可用服务器。

## 主要目录
- `src/agents`：插件化 AI 智能体能力，含注册表、配置加载器与默认示例插件。
- `src/agents/plugins`：插件集合目录，可扩展其他智能体。
- `src/agents/config`：智能体配置 Schema、加载器与 CLI 支持。
- `src/utils`：OpenAI 客户端与 API 模式队列。
- `src/orchestrator`：执行器、计划节点适配器、状态管理与运行时。
- `src/mcp`：MCP Bridge 客户端与会话、共享事件定义。
- `src/shared/persistence`：JSON 持久化工具（检查点、工具流记录等）。
- `config/`：集中存放 MCP 服务器配置（`mcp.servers.json`）。
- `src/ui`：Vite + React UI 状态面板源码，展示执行列表、桥接状态与审批摘要。
- `examples/`：运行脚本 `run-demand-analysis.ts`。
- `samples/`：示例需求文档（`demo.md`）。
- `tests/`：Vitest 覆盖智能体与队列行为。
- `docs/`：混合编排文档（计划、部署、系统工具等）。

### 插件化智能体
- 插件配置存放在 `agents-config/` 目录。项目启动时可调用 `registerConfiguredAgents()` 自动扫描并注册；若目录为空，会回退到示例内置插件的 `ensure*` 函数。
- 使用 `npm run agents:config -- list`（等价于 `npm run cli -- agents:config:list`）查看已存在的配置；通过 `npm run agents:config -- generate --id <id> --module <path>`（或 `agents:config:generate`）生成新的 JSON 配置，支持 `--force` 覆盖与 `--dry-run` 预览。
- 对计划执行 dry-run：`npm run cli -- plan:dry-run --plan <plan.json>`；若设置 `--remote` 或 `ORCHESTRATOR_BASE_URL`，则通过 Orchestrator Service 调用 `/plans/validate`，可使用 `--local` 保留旧版本地模式。
- 自动连续执行计划：`npm run cli -- run:auto --plan <plan.json>`；可加 `--remote --base-url http://127.0.0.1:3000/api/v1 [--mock-mcp] [--mcp-server <name>]` 调用 Orchestrator Service，或使用 `--local` 与原先 auto-exec 行为一致。`--mcp-server` 别名来源于 `config/mcp.servers.json` 的 `name` 字段。
- CLI、测试与执行器均通过注册表获取插件，避免硬编码。复制 `src/agents/plugins/demandAnalysis.ts` 或使用 Meta Agent 生成器生成配置后，即可通过配置文件完成自动注册。

### MCP Bridge
- `src/mcp/bridge` 提供共享会话与重连能力：`BridgeClient` 基于 `@modelcontextprotocol/sdk` 的 Streamable HTTP 客户端封装 MCP 连接，默认指数退避重连并广播状态事件 `connecting/connected/disconnected/reconnecting`。桥接会话由 `config/mcp.servers.json` 管理，持久化键为服务器 `name`，可在 Web UI 顶部选择或在 CLI 通过 `--mcp-server` 指定。
- `BridgeSession` 在调用 MCP 工具前后触发安全钩子（写入安全日志、上报高风险工具）。执行器和 Web UI 可以复用同一 session，实现“连接 MCP 才开放操作”的策略。
- 本地或测试环境可通过 `transportFactory` / `clientFactory` 注入 mock 传输层，示例见 `tests/mcp/bridgeClient.spec.ts` 与 `tests/mcp/bridgeSession.spec.ts`。
- 运行时集成 `src/orchestrator/runtime`，在 Bridge 未连接时拒绝执行；可通过 `npm run cli -- run:auto --plan plans/demo-mixed.json --mock-mcp`（或设置 `MCP_BRIDGE_MOCK=1`）快速体验自动连续执行流程。

### 审批流程
- 当 Plan 节点 `requiresApproval` 为 true 或 `riskLevel`=high 时，执行器通过 `ApprovalStore` 将审批请求写入 `state/approvals/pending.json`，同时把摘要写入 `logs/app.jsonl` 并暂停执行。
- 使用 `npm run approvals -- pending` 查看待审批项；`npm run approvals -- approve <id> --comment "确认"`/`reject` 会调用 `ApprovalController.recordDecision`，把结果写入 `state/approvals/completed.json` 并触发执行器恢复。
- 审批相关日志输出在统一的 `logs/app.jsonl` 文件，可结合宿主 SIEM 或日志平台做持续审计。

### 结构化日志与可观察性
- 项目统一使用单一 Pino JSONL 输出：`logs/app.jsonl`。日志目录位于 `logs/`，可通过 `LOG_LEVEL` 环境变量调整级别。
- 极简版不再内置巡检或死信脚本，可通过 CLI/GUI 观察执行结果并结合宿主环境日志工具完成排障。

### UI 状态面板
- 使用 `npm run ui:dev` 启动 Vite 开发服务器（默认监听 `http://127.0.0.1:5173` 并自动代理到 `http://127.0.0.1:3000/api/v1`），实时查看执行列表、桥接状态与待审批事项。仅当桥接状态为 `connected` 时才会启用交互按钮。
- `npm run ui:build` 产出部署文件至 `dist/ui`，`npm run ui:preview` 可在本地预览打包结果。
- 面板通过 WebSocket 订阅 `runtime`/`bridge`/`execution`/`approvals` 事件，断线时自动进入只读模式并提供“手动重连”按钮；执行完成或新增审批时会自动刷新摘要列表。

## 常用命令

> 推荐优先使用 Web UI 与 Orchestrator Service API。CLI 将逐步弱化，完整迁移路线请参阅《[CLI 功能迁移蓝图](docs/cli-migration.md)》。

- `npm run dev`：监听示例脚本，适合调试提示词或上下文。
- `npm run lint` / `npm run format`：代码风格与格式化。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run test`（可追加 `-- --watch` 进入 watch 模式）：执行 Vitest 单元测试。
- `npm run ui:dev` / `npm run ui:build` / `npm run ui:preview`：运行 Web UI 状态面板开发与构建流程（默认启用 hush 主题 `data-theme="hush"`）。
- `npm run ui:ga`：运行 GUI Gold Release 验收脚本（类型检查 + 关键 UI 单测）。
- `npm run agents:config -- <command>`：管理插件配置（`generate`/`list`）。
- `npm run cli -- plan:dry-run --plan <file>`：对计划执行 dry-run，输出警告摘要。
- `npm run cli -- executions:stop <execId> [--base-url http://127.0.0.1:3000/api/v1]`：通过 Orchestrator Service 停止正在运行的执行。

> ⚠️ Husky 钩子与持续 watch 流程已改为手动执行，如需启用请手动运行 `npx husky install`，进入 watch 模式请使用 `npm run test -- --watch`。

## 延伸阅读
- [`.codex/requirements.md`](.codex/requirements.md)：混合编排完整需求说明。
- [`PLAN.md`](PLAN.md)：阶段计划与任务跟踪。
- [`docs/index.md`](docs/index.md)：文档索引（节点适配器、部署手册、系统工具白皮书）。
- [`docs/platform-overview.md`](docs/platform-overview.md)：平台分层、适配器与客户端总览。
- [`docs/service-api-guide.md`](docs/service-api-guide.md)：Orchestrator Service / API / 治理统一指南。
- [`docs/gui-handbook.md`](docs/gui-handbook.md)：Web UI + MCP UI 功能迁移路线与运行手册。
- [`docs/gui-gold-release.md`](docs/gui-gold-release.md)：GUI Gold Release 验收脚本与 fallback 指引。
- [AGENTS.md](AGENTS.md)：执行规范与提交流程。
- 若需需求分析范例，可参考 `samples/` 目录并运行上方命令。
