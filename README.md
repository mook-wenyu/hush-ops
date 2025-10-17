# hush-ops

## 存档验证结果（最简流程）

### Before Merge（本地自检）

> 精简基线：只保留 3 步（typecheck → build → smoke）。
- 一键烟囱：`npm run smoke`（类型检查 + 后端构建 + 前端构建 + 预览健康检查，不再依赖 Playwright）
- 冒烟：`npm run smoke` 会自动拉起预览并做 HTTP 健康检查（200）后退出。
- 可选：性能 `npm run ui:perf`
- 请逐条完成 `.codex/pr-checklist.md`，并将截图/摘要写入 `.codex/testing.md`。
- 原则：不引入 CI，不引入仪表盘；以最小用例+截图落盘为准。

hush-ops 是一款面向混合任务编排的可视化调度平台，帮助团队在同一界面下统筹普通脚本、智能体流程与 MCP 工具执行。系统提供审批闭环、执行状态追踪与工具流审计能力，便于业务团队以图形方式监管自动化任务。

## 核心能力
- **可视化调度台**：网页端实时展示计划节点、执行进度、审批待办与桥接状态。
- **计划调度**：支持 cron 调度、手动重载（`POST /api/v1/schedules/reload`），与目录热监听（`ORCHESTRATOR_SCHEDULE_WATCH=1`）。
- **并发门控**：`schedule.concurrency: 'forbid'` 自动复用同一计划运行中实例，避免并发风暴。
- **工具流审计**：提供工具流摘要/明细/重放接口，前端“执行详情”支持查看、仅错误与复制 JSON；新增“Tool Streams”页面汇总全局工具流（支持仅错误与分页），可导出 JSON/NDJSON。
- **多通道任务支持**：同一计划可同时调度手动任务、AI 智能体与 MCP 工具；默认提供模拟桥接，便于无外部服务时体验。
- **审批与审计闭环**：高风险节点会触发审批队列，结果写入 JSON 存档与统一日志 `.hush-ops/logs/app.jsonl`。
- **JSON 持久化**：检查点、工具流与审批历史默认保存在用户目录 `.hush-ops/state/`，支持跨版本迁移与备份。
- **灵活扩展**：通过 `.hush-ops/config/mcp.servers.json` 管理 MCP 服务器配置，CLI 保留作为灾备与批处理入口。
- **接口文档**：`GET /api/v1/openapi.json`（包含 paths 与示例 schemas）。
- **编辑器（已合并至 Dashboard）**：在首页切换“编辑模式”开启拖拽式计划编辑。左栏“计划/节点库”，中部画布支持一键布局（ELK）、连线成环检测与自动 dry‑run（默认 400ms 去抖，可在设置中关闭/调整）。编译端点：`POST /api/v1/designer/compile`，dry‑run 端点：`POST /api/v1/plans/dry-run`（仅模拟，无副作用）。支持 Plan v3 显式 `edges[]` 结构（若存在则优先使用），否则回退按 `children[]` 推断。
- **版本提示（Plan v3）**：后续将逐步切换后端编译/执行至 v3；示例 `plans/examples/demo-v3.json` 可直接在 Dashboard 载入。
- **列表分页**：`GET /api/v1/plans?limit&offset` 与 `GET /api/v1/executions?limit&offset` 返回 `{ total, items[] }`。

## 系统要求
- Node.js 20 或以上版本，npm 10+
- 一个有效的 OpenAI API Key（`OPENAI_API_KEY`）
- （无需浏览器驱动）如需手动检查，可运行 `npm run ui:preview` 后访问首页 `/`
- 可选：自建或第三方 MCP 服务器，按需填写 `.hush-ops/config/mcp.servers.json`

## 快速开始（本地体验）
1. 安装依赖：
   ```powershell
   npm install
   ```
2. （已移除 Playwright，无需安装浏览器）
3. 配置环境变量（PowerShell 示例）：
   ```powershell
   $Env:OPENAI_API_KEY = "sk-..."
   # 可选：$Env:MCP_BRIDGE_MOCK = "1"       # 无外部 MCP 时启用内置模拟
   ```
4. 启动一键开发环境（同时拉起服务与 Web UI）：
   ```powershell
   npm run dev
   ```
   命令会并行启动 Orchestrator Service（默认 `http://127.0.0.1:3000/api/v1`）与 Vite 前端；稍候访问 `http://127.0.0.1:5173` 即可查看执行列表、桥接状态和审批队列。
5. 演示计划：首次运行若 plans 目录为空，系统会自动创建 `plans.json`（空计划）。左侧仅保留“添加/删除”和列表；你也可以点击“导入示例”一键导入内置示例计划（来自 `plans/examples/`）。

## 部署指南
1. **构建产物**：
   ```bash
   npm run build           # 编译 Node 服务与 CLI
   npm run ui:build        # 生成前端静态文件（输出至 dist/ui）
   ```
2. **启动服务端**：在目标环境执行
   ```bash
   npm run service:prod
   ```
   通过环境变量 `ORCHESTRATOR_PORT`、`ORCHESTRATOR_HOST`、`ORCHESTRATOR_BASE_PATH` 可定制监听地址；设置 `MCP_BRIDGE_MOCK=1` 可继续使用模拟桥接。
3. **部署前端**：将 `dist/ui` 目录交由任意静态资源服务器（Nginx、Vercel 等）托管，并配置反向代理，使 `/api/v1` 指向上一步的服务端地址。
4. **持久化与日志**：确保持久化目录 `.hush-ops/state/` 与日志目录 `.hush-ops/logs/` 位于可持久化卷中，定期备份 JSON 文件即可恢复执行历史。

### 状态恢复指引
- JSON 存储损坏时（例如 `tool-streams.json`、`mcp-sessions.json` 无法解析），请先备份原文件，再删除或重命名，重新启动 hush-ops 会自动生成空白文档。
- 若需在不影响现有环境的情况下验证恢复，可将 `HUSH_OPS_HOME` 指向临时目录运行 `npm run verify`，确认新的 JSON 结构写入后再替换生产环境。
- 日志文件 `app.jsonl` 为 JSONL 格式，可借助 `jq`/`Get-Content` 从 `.hush-ops/logs/` 中筛选 `"msg": "事件被丢弃：背压阈值超出"` 等异常记录定位问题。

## 高级用法（可选）
- **命令行备用**：`npm run cli -- plan:dry-run --plan <file>`、`npm run cli -- run:auto --plan <file>` 等命令提供无人值守批处理能力，具体参数可通过 `npm run cli -- --help` 查看。
- **独立调试服务或前端**：如需单独调试，可运行 `npm run service:start`（仅 Orchestrator Service）或 `npm run ui:dev`（仅前端）。
- **MCP 服务器配置**：编辑 `.hush-ops/config/mcp.servers.json` 为不同后端命令或 HTTP Endpoint 设置别名，Web UI 与 CLI 会自动展示可用服务器列表。
- **审批兜底**：需要手动介入时，可使用 `npm run approvals -- pending/approve/reject` 查看或处理待审批事项（默认读取 `.hush-ops/state/approvals/`）。

## 快速校验（三步）
- `npm run verify:fast`：类型 + 服务端契约用例 + UI jsdom 用例（约 1–2 分钟，适合本地变更自检）
- 可调环境门控：`PERF_SKIP=1` 跳过大图性能用例；或设置 `PERF_N`、`PERF_BUDGET_MS` 调整阈值
- 完整校验：`npm run verify`（包含所有检查与 smoke）

## 本地手动验证与调试
- **首页验证**：`npm run ui:preview` 后访问 `/`，检查任务列表/计划编排/画布/审批/节点详情是否正常。
- **网络与日志**：通过浏览器开发者工具（Network/Console）与后端服务日志定位问题；必要时在页面注入额外的 `console.debug` 标记时序。
- **统一脚本**：`npm run smoke` 仅做构建与预览健康检查；其余验证按需手动执行或补充轻量的组件/集成测试。
- **数据隔离**：调试或负向验证时可将 `HUSH_OPS_HOME` 指向临时目录，复制必要计划以避免污染共享数据。
- **ToolStreams 提示**：时间范围筛选的 URL 同步采用 `queueMicrotask` 触发；在 jsdom 测试中建议使用真实计时器 + `waitFor` 断言，并在用例末尾 `cleanup()` 避免多实例残留。

## 本地回归与回顾流程
1. **执行聚合脚本**：以 `npm run verify` 作为完整回归入口；针对单个缺陷，可运行 `npm run ui:e2e`。
2. **记录结果**：将命令、成功与否、调试备注写入 `.codex/testing.md`，必要时在 `verification.md` 补充结论。
3. **调试实践**：遇到失败用例时先运行 `npm run ui:e2e:debug` 或 `npx playwright show-trace`，根据 trace 快照定位 DOM、网络差异。
4. **清理工件**：调试结束后删除 `~/.hush-ops/playwright-artifacts/`（或临时 `HUSH_OPS_HOME` 目录），确保下次回归环境干净。
5. **月度回顾**：每月整理 Playwright 执行次数、平均耗时与失败原因，在 `PLAN.md`、`RISKS.md` 追加回顾摘要，并形成后续改进 backlog。

> 更详细的 Web 操作指南与调试流程，请参考 `docs/gui-handbook.md`。

### UI 规范（简版）
- 图标：使用 `@tabler/icons-react`，按钮内靠左放置，`size=16`，与文字间距 `mr-1`，颜色随 `currentColor`。
- 主题：DaisyUI 主题为 `light/dark`，默认“跟随系统”；设置中心可在“跟随/浅色/深色”三态切换（立即生效）。
- 布局：外层三列默认 22/56/22，内层三段默认 20/60/20；可拖拽，句柄命中扩大；小屏建议优先中列。
- 文案：统一称谓“计划”，避免“任务/工作流任务控制中心”等占位文案。

### 已覆盖的操作路径（手动验证）
- 成功路径：计划 dry-run、审批通过。
- 负向路径：dry-run 422 错误、审批提交失败（500）、插件命令抛错并记录日志。
- 验证方式：启用预览后访问首页 `/`，按“Before Merge（本地）”指引完成手动检查。

## 故障排查与回滚
- 端口占用：修改 `ORCHESTRATOR_PORT` 或 `VITE_*` 代理端口，或释放 `3000/5173` 后重试
- 依赖安装失败：确认 Node≥20 / npm@10；删除 `node_modules && package-lock.json` 后 `npm ci`
- 接口代理错误：检查 `vite.config.ts` 中代理地址是否与服务端 `127.0.0.1:3000` 一致
- 回滚：若近期改动导致异常，可恢复至上一个通过 `npm run verify` 的提交，或还原 `plans/` 与 `.hush-ops/state/` 的最近快照

## 常用脚本速查
- `npm run check`：按顺序执行 `lint` 与 `typecheck`，确保代码风格与类型安全。
- `npm run verify`：在 `check` 基础上继续跑 `test`、`ui:ga`（若存在）与 `smoke`，作为本地完整验证入口。
-（已移除）`ui:e2e`/`ui:e2e:debug`/`ui:trace`；请改用浏览器内自检页与文档化手操验证。
- `npm run build:all`：一次性产出后端与前端构建产物（等价于 `build` + `ui:build`）。

## 支持与反馈
- 验证与测试记录详见 `verification.md` 与 `.codex/testing.md`。
- 若需了解更细粒度的架构与运维规划，可参考 `PLAN.md`、`TASKS.md` 与 `RISKS.md`。
- 欢迎通过 Issues 分享使用反馈或改进建议。

### 实验功能：Agent 对话与 Chat（本地/内部）
- 开关：服务端通过环境变量 `AGENTS_ENABLED=1`（可选 `CHATKIT_ENABLED=1`）启用路由；前端在导航出现“Chat (实验)”。
- 路由：
  - `POST /api/v1/agents/session/messages`：发送消息并更新会话；
  - `GET /api/v1/agents/session/thread`：查询会话消息（JSON/JSONL 持久化）；
  - `POST /api/v1/agents/session/clear`：清空会话（会生成快照）；
  - `GET /api/v1/agents/session/export`、`POST /api/v1/agents/session/import`：导出/导入 JSONL；
  - 预留 ChatKit 自定义后端：`/api/v1/agents/chatkit/*`（后续将映射官方事件协议）。
- 现状：默认关闭、无鉴权；仅用于内部/本地验证。实际智能体执行将接入 `openai-agents-js` 与 MCP 工具，替换当前回声占位实现。

#### 本地开发：Agent 与 Chat/ChatKit（实验）
- 开关与变量（PowerShell）：
  - `setx AGENTS_ENABLED 1`（启用 `/api/v1/agents/session/*`）
  - `setx CHATKIT_ENABLED 1`（启用 `/api/v1/agents/chatkit/*` 占位）
  - 前端：`$Env:VITE_CHATKIT_ENABLED='1'` 时显示 `/chatkit`
  - 可选：`$Env:OPENAI_API_KEY='sk-...'` 启用 @openai/agents 真实执行（未配置则回退回声）
- 启动：`npm run dev` → `/chat` 或 `/chatkit`
- 关闭：清空上述变量或设为 0 即可
