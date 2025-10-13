# 混合编排完整需求说明
## 1. 背景与目标
- 利用 `openai-agents-js` 构建可扩展的混合编排平台，统一调度普通程序任务与 AI 智能体。
- 支持“规划（Designer）—执行（Executor）”分离，Plan 可重放、可重规划。
- 与 MCP（Model Context Protocol）深度集成，桥接服务与 GUI 只有在成功连线 MCP 服务器后才允许操作。
- 提供精简 Web GUI 作为主要可视化入口，默认开放业务相关插件，运维功能转向 CLI/后续 Ops Portal。
- 内置 Meta Agent 负责生成其他智能体配置，所有配置以本地 JSON 管理，可运行时动态加载。
- 默认自动连续执行 Plan；除人工审批节点外无需人工干预。

## 2. 范围界定
- **涵盖内容**：Plan Schema 管理、LangGraph 编排、MCP 工具管理、Meta Agent 配置生成、本地 JSON 持久化、Web GUI、CLI、审批日志钩子、部署与测试文档。
- **不包含**：自研认证/授权/加密、防护逻辑；外部数据库（SQLite、PostgreSQL 等）；容器/K8s；第三方监控管线。

## 3. 功能需求
### 3.1 规划器（Designer）
1. 接收业务目标并生成结构化 Plan Schema。
2. Plan 支持节点类型：`sequence`、`parallel`、`conditional`、`loop`、`human_approval`、`local_task`、`agent_invocation`、`mcp_tool`、`external_service`。
3. 节点参数由 Zod Schema 校验，支持版本号与回滚；Dry Run 验证节点连通性。
4. 节点可标记 `requiresApproval`、`riskLevel` 等元数据。

### 3.2 执行器（Executor）
1. 基于 LangGraph.js 运行 Plan，结合 JSON 检查点保持状态，可选择内存模式用于快速调试。
2. 适配器负责普通任务（脚本/HTTP/文件/定时等）、智能体 (`openai-agents-js`)、MCP 工具；所有调用通过统一接口注入。
3. 支持条件、循环、人工审批、中断与恢复；审批事件写入 `state/approvals/pending.json` 与 `state/approvals/completed.json`，CLI 与服务端共同驱动流程。
4. 自动连续执行：无审批阻塞时按节点顺序执行，出错时依据检查点恢复；三次失败触发人工标记。

### 3.3 MCP 共享服务与客户端
1. MCP Bridge 共享会话，CLI/Executor/GUI 共用 `config/mcp.servers.json` 中的别名配置。
2. 断线时触发指数退避重连（默认 5s 起始，乘 2，封顶 60s），成功后重新拉取工具清单并广播 `bridge.state-change`。
3. 所有工具调用走 `onToolInvoke` 钩子，输出统一日志事件，供 GUI 或 CLI 订阅。

### 3.4 Web GUI
1. 基于 React + TailwindCSS + daisyUI + React Flow 显示流程拓扑、执行状态摘要、审批待办、业务插件。
2. 状态机覆盖 `connecting`、`connected`、`disconnected`、`reconnecting`，提供手动“重试”按钮。
3. 插件机制模块化加载，业务插件默认启用，诊断类插件在 Ops Portal/CLI 承载。
4. 断线时隐藏所有交互并提示维护信息；重连后自动刷新 Plan 状态与审批结果。

### 3.5 CLI
1. 基于 oclif，保留 `plan:dry-run`、`run:auto`、`approvals:*`、`agents:config:*` 等命令，逐步下线运维专用命令（含 `executions:tool-streams`）。
2. CLI 通过 REST/WebSocket/IPC 连接 Orchestrator 与 Bridge，断线时提示检查 MCP 服务器。
3. 默认持久化目录为 `state/`，所有命令仅读写 JSON 文件，禁止创建 SQLite 数据库。

### 3.6 Meta Agent 与配置管理
1. Meta Agent 使用 OpenAI 官方 SDK 生成配置，输出 JSON 经过 Schema 校验后写入 `agents-config/`。
2. 运行时加载：启动时扫描目录或由 CLI 动态注册，支持热更新与卸载。
3. 所有智能体通过 `src/agents/registry.ts` 暴露统一注册表，供 Plan 节点与插件引用。

### 3.7 状态持久化
1. LangGraph 检查点使用 `state/checkpoints/*.json`；Approval Store、Bridge Session、工具流历史分别使用 `state/approvals/*.json`、`state/mcp-sessions.json`、`state/tool-streams.json`。
2. 日志统一写入 `logs/app.jsonl`（Pino 单通道 JSONL），包含类别、级别、上下文；禁止再生成 `logs/execution.jsonl`、`logs/security.jsonl`、`logs/audit.jsonl`。
3. 所有 JSON 写入追加换行符，便于增量备份；提供示例脚本或文档指导每日打包。

### 3.8 文档与运维
1. `docs/deployment-local.md`：提供无需 SQLite/Temporal 的部署步骤、目录结构、端口说明、备份策略。
2. `docs/system-tools.md`：记录系统工具风险等级、审批建议、单通道日志示例。
3. README 与 `docs/index.md`：保持入口一致，注明运维功能已收口至 CLI/后续 Ops Portal。

### 3.9 模块化与生态
1. `orchestrator/*` 负责 Plan 解析、执行、审批与状态广播，通过接口注入日志、存储、Bridge 会话。
2. `mcp/bridge/*` 封装 MCP SDK，暴露 `connect/listTools/invokeTool` 与事件；客户端仅依赖 Facade。
3. `agents/*` 维护插件注册表与 Meta Agent 生成逻辑，提供 `register/list/ensure` API。
4. 共享契约（Plan Schema、Agent Schema、日志结构）集中在 `src/shared/schemas`，使用 Zod 校验。

## 4. 非功能需求
- **性能**：并行执行 ≤10 个节点，GUI 在 3 秒内加载 100+ 节点计划；断线后 ≤60 秒重连。
- **可靠性**：检查点保留最近 20 个版本；失败节点写入日志并在 `.codex/operations-log.md` 记录补救策略。
- **可维护性**：所有接口 Schema 化；日志包含操作人、时间、工具、参数；部署步骤清晰。
- **安全**：遵循安全清零，不内置认证；通过风险标签和审批记录辅助宿主审计。

## 5. 部署建议
- **开发环境**：Node.js 18+、PowerShell 7+/Bash、MCP Server、Bridge、Web UI、Orchestrator；提供 `npm install && npm run dev` 快速启动指南。
- **生产环境（裸机/虚拟机）**：使用 systemd/PM2 管理 Bridge 与 Orchestrator；JSON 状态目录挂载至持久磁盘；日志轮换通过 `logrotate` 或自定义脚本压缩 `logs/app.jsonl`。
- **备份策略**：每日打包 `state/*.json`，保留最近 7 日；每周归档日志；遇到写入错误时阻塞执行并提示人工处理。

## 6. 测试要求
- **单元测试**：Plan Schema 校验、节点适配器、MCP 工具调用、Meta Agent JSON 校验、断线状态机。
- **集成测试**：Designer→Executor 全链路、CLI/GUI 与 MCP 连接/断线/重连、审批流程、工具流 JSON 存储。
- **验收测试**：串行/并行/条件/循环场景，覆盖普通任务、智能体、MCP 工具混合；模拟断线重启确保检查点恢复；验证 GUI 在连接前禁用交互、连接后恢复。

## 7. 待确认事项
- 首批普通任务类型及对应适配器范围。
- Business GUI 中审批与运维边界的最终呈现方式。
- 宿主运行环境的 CPU/内存/磁盘配额与备份频率。
- 宿主审计系统的对接方式（API、审批流程、日志订阅）。
- MCP GUI 自动恢复流程是否需纳入首版测试脚本。
- Meta Agent 配置 JSON 的版本策略与热加载边界。

## 8. 里程碑建议
1. **M0**：完成 Plan/Executor 核心、MCP 共享会话、Meta Agent 配置、CLI 基础命令、断线重连骨架。
2. **M1**：交付精简 Web GUI（Plan 画布、审批管理、执行摘要）与 JSON 持久化落地。
3. **M2**：完善插件生态、文档、Ops Portal 规划、外部服务适配、循环/事件节点优化。
