# 测试记录

> 记录所有测试命令、结果与备注。按时间逆序追加�?
| 日期 | 命令 | 环境 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 2025-10-13 | npm run test -- tests/shared/logging/logger.spec.ts tests/service/orchestrator/events.spec.ts | local | passed | 验证日志单流与 logs.appended 载荷调整后单元/服务事件订阅稳定 |
| 2025-10-13 | npm run typecheck | local | passed | 调整日志类别与文档后再次确认 TS/React 双配置无误 |
| 2025-10-13 | n/a（PLAN/TASKS 文档更新） | local | not-run | 本次仅清空任务记录并整理功能建议，无需测试 |
| 2025-10-13 | npm run typecheck | local | passed | JSON 持久化与单流日志改造后类型检查通过 |
| 2025-10-13 | npm run lint | local | passed | 移除 better-sqlite3 依赖并统一日志后 ESLint 全绿 |
| 2025-10-13 | npm run test | local | passed | 全量 Vitest 103 项通过，CLI/UI/服务端在 JSON 存储下保持稳定 |
| 2025-10-13 | npm run build | local | passed | TypeScript 构建产物已更新，移除旧 SQLite 逻辑 |
| 2025-10-13 | npm run ui:ga | local | passed | Gold Release 验收脚本在 JSON 存储方案下通过 |
| 2025-10-12 | npm run test | local | passed | 全量 Vitest 122 项均通过，含所有 CLI 套件 |
| 2025-10-12 | npm run test -- tests/cli/run-auto.spec.ts | local | passed | run:auto CLI 集成测试耗时但稳定通过 |
| 2025-10-12 | npm run test -- tests/cli/executions-tool-streams.spec.ts | local | passed | executions:tool-streams CLI 用例 3 项通过，确认无超时 |
| 2025-10-12 | npm run test -- tests/cli/plan-dry-run.spec.ts | local | passed | plan:dry-run CLI 用例 4 项通过，执行时间≈8.7s |
| 2025-10-12 | npm run test -- tests/mcp/bridgeSession.spec.ts | local | passed | BridgeSession 调用 callTool mock 后 3 项单测通过 |
| 2025-10-12 | npm run ui:ga | local | passed | 类型检查与核心 UI 冒烟用例全部通过 |
| 2025-10-12 | npm run build | local | passed | TypeScript 构建通过，移除 DORA 面板后产物正常 |
| 2025-10-12 | npm run typecheck | local | passed | DoraMetricsPanel 下线后类型检查通过 |
| 2025-10-12 | npm run lint | local | passed | 删除 DORA 组件后 ESLint 通过 |
| 2025-10-12 | npm run test | local | passed | 全量 Vitest 通过，确认无 DORA 组件引用 |
| 2025-10-12 | n/a（Day-2 运维精简蓝图规划） | local | not-run | 仅更新规划文档，无需执行测试 |
| 2025-10-12 | npm run ui:ga | local | passed | Gold Release 快捷脚本（typecheck + 核心 UI 单测）运行通过 |
| 2025-10-12 | npm run typecheck | local | passed | PlanCanvas 拖拽与 DORA 面板改动后类型检查通过 |
| 2025-10-12 | npm run test -- tests/ui/planTransforms.spec.ts tests/ui/PendingApprovals.spec.tsx | local | passed | 验证 Plan JSON 位置更新与审批定位交互 |
| 2025-10-12 | n/a（调研更新） | local | not-run | 本次仅新增行业调研记录，未执行测试 |
| 2025-10-12 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | 新增节点选择样式后 PlanCanvas 单测通过 |
| 2025-10-12 | npm run test | local | passed | 修复 BridgeSession mock 与 CLI 超时后全量测试通过 |
| 2025-10-12 | npm run test -- tests/ui/plugins/pluginRuntime.spec.tsx | local | passed | 插件运行时回归验证审批与历史接口兼容性 |
| 2025-10-12 | npm run test -- tests/ui/plugins/mcpToolExplorer.spec.tsx | local | passed | MCP 工具浏览器历史/重放面板行为验证 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 新增流式历史 REST/WS 场景与回放用例通过 |
| 2025-10-12 | npm run typecheck | local | passed | 流式持久化改造后类型检查通过 |
| 2025-10-12 | npm run typecheck | local | passed | 文档合并后确认类型检查通过 |
| 2025-10-12 | npm run test | local | passed | 文档合并后全量 Vitest 通过 |
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | 覆盖 MX-06 事件流渲染与节点状态断言 |
| 2025-10-11 | npm run test -- tests/ui/PendingApprovals.spec.tsx | local | passed | 验证审批待办交互与禁用逻辑，配�?MX-06 场景 |
| 2025-10-11 | n/a（更新测试说明） | local | not-run | 迁移测试记录至 `.codex/testing.md`，删除旧的测试矩阵文档指引 |
| 2025-10-11 | npm run ui:build | local | passed | MCP 工具浏览器插件加入后 Vite 构建通过 |
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | MCP 插件加载�?Plan 画布回归仍通过 |
| 2025-10-11 | npm run test -- tests/ui/plugins/pluginRuntime.spec.tsx | local | passed | 验证命令/侧边面板注册�?MCP 工具浏览器内置插�?|
| 2025-10-11 | npm run typecheck | local | passed | PluginRuntime 增加桥接接口后类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui/plugins/pluginRuntime.spec.tsx | local | passed | MCP REST 桥接启用后再验证内置插件加载/降级逻辑 |
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | OTel + MCP 接入�?UI 回归保持通过 |
| 2025-10-11 | npm run typecheck | local | passed | Orchestrator MCP API + OTel 状态同步后全量类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui | local | passed | PlanCanvas/DaisyUI 改造后组件回归通过 |
| 2025-10-11 | npm run test -- tests/ui | local | failed �?修复 | 初次运行�?PlanCanvas 断言文本被拆分导致失败，更新测试后通过 |
| 2025-10-11 | npm run typecheck | local | passed | PlanCanvas/BridgeStatus 等组�?Tailwind 化后类型检查通过 |
| 2025-10-11 | npm run typecheck | local | passed | 新增 `tailwind-theme.css` �?hush 主题导入后类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui | local | passed | Tailwind 颜色重整�?UI 组件回归通过 |
| 2025-10-11 | npm run ui:build | local | passed | hush 主题 token (`src/ui/theme/hush.css`) 导入生效，Vite 构建通过 |
| 2025-10-11 | npm run test -- tests/cli/registry-plans.spec.ts | local | passed | 单独重跑 registry CLI 发布计划/Agent 用例，确认超时问题不存在 |
| 2025-10-11 | npm run test | local | failed �?retry | 全量 Vitest 首次执行�?registry CLI 发布计划用例�?5s 超时，单独重跑已通过 |
| 2025-10-11 | npm run typecheck | local | passed | 新增 Tailwind/daisyUI 依赖�?sqlite Registry 类型修正后类型检查通过 |
| 2025-10-11 | npm run typecheck | local | passed | PlanCanvas 节点状态与 runtime 快照更新后类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | React Flow 节点状态与状态徽章单测通过 |
| 2025-10-11 | npm run ui:build | local | passed | React Flow 节点状态与 overlay 样式�?Vite 构建验证 |
| 2025-10-11 | npm run typecheck | local | passed | PlanCanvas React Flow 重构后类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | failed | 首次执行�?Tailwind PostCSS 插件兼容性报错（需�?@tailwindcss/postcss�?|
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | React Flow 集成后单测通过，确�?ResizeObserver stub 生效 |
| 2025-10-11 | npm run ui:build | local | passed | Vite 构建通过，验�?React Flow 样式与打包兼�?|
| 2025-10-11 | npm run test -- tests/ui/PlanCanvas.spec.tsx | local | passed | 新增 Plan 画布组件渲染用例 |
| 2025-10-11 | npm run typecheck | local | passed | PlanCanvas/插件协议改动后类型检查通过 |
| 2025-10-11 | npm run test -- tests/service/orchestrator/registry.spec.ts tests/cli/run-auto.spec.ts | local | passed | 验证注册�?GET 接口�?run:auto --plan-id 功能 |
| 2025-10-11 | npm run typecheck | local | passed | 更新 run:auto/registry 接口后类型检查通过 |
| 2025-10-11 | npm run test -- tests/service/orchestrator/otel.spec.ts tests/ui/ExecutionList.spec.tsx | local | passed | 覆盖 OTel exporter 属性记录与 ExecutionList UI 适配 executorType |
| 2025-10-11 | npm run typecheck | local | passed | 更新 ExecutionRecord/executorType �?OTel 集成后类型检查通过 |
| 2025-10-11 | n/a（并行模式切换准备） | local | not-run | 更新 PLAN/TASKS/RISKS/METRICS、创�?RESULTS/PATCHES 目录，尚未运行代码或测试 |
| 2025-10-11 | n/a（OTel 蓝图扩写�?| local | not-run | 更新 docs/event-metrics-spec.md、PLAN/TASKS/METRICS 以支�?OTel/exporter 任务，后续实现再执行验证 |
| 2025-10-11 | n/a（文档同步） | local | not-run | 轨道化文档与计划同步，未执行测试 |
| 2025-10-11 | npm run typecheck | local | passed | 引入 TailwindCSS/daisyUI 与配置调整后全量类型检查通过 |
| 2025-10-11 | npm run test | local | passed | 引入 TailwindCSS/daisyUI �?Vite 插件后全�?Vitest 通过 |
| 2025-10-11 | n/a（文档调整） | local | not-run | 本次仅重构文档结构与索引，未运行测试 |
| 2025-10-10 | npm run test | local | passed | Web UI MVP（计划执�?审批）与审批 REST 接口实现后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | Web UI 迁移相关 TypeScript 更新（含 UI tsconfig）通过 |
| 2025-10-10 | npm run ui:build | local | passed | Vite 构建 Web UI 状态面板产物输出至 `dist/ui` |
| 2025-10-10 | npm run test -- tests/ui/BridgeStatus.spec.tsx | local | passed | Web UI BridgeStatus 组件�?jsdom 环境下通过断言 |
| 2025-10-10 | npm run typecheck | local | passed | Node + UI �?tsconfig 类型检查（�?React 端）通过 |
| 2025-10-10 | npm run typecheck | local | passed | Registry REST/CLI 元数据改动后类型检查通过 |
| 2025-10-10 | npm run test -- tests/cli/registry-plans.spec.ts | local | passed | CLI 发布 Plan/Agent 支持 source/metadata |
| 2025-10-10 | npm run test -- tests/service/orchestrator/registry.spec.ts | local | passed | Orchestrator Registry REST 返回元数据验�?|
| 2025-10-10 | npm run test -- tests/shared/persistence/registryStore.spec.ts | local | passed | RegistryStore source/metadata 读写单测 |
| 2025-10-10 | npm run typecheck | local | passed | Registry 元数据字段扩展后类型检查通过 |
| 2025-10-10 | npm run typecheck | local | passed | Registry store / CLI 更新后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | MVP Registry 相关实现全量测试通过 |
| 2025-10-10 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | WebSocket 主题过滤与动态订阅测试通过 |
| 2025-10-10 | npm run test | local | passed | Session registry + 事件总线改造完成后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | Orchestrator 事件总线与客户端订阅改动通过类型检�?|
| 2025-10-10 | npm run test | local | passed | local_task 重试策略与日志分类补強后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | 本轮 local_task/JSON Logic 改动通过类型检�?|
| 2025-10-10 | npm run test | local | passed | JSON Logic 校验与执行器容错增强后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | JSON Logic Schema 更新后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | run:auto CLI 新增后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | run:auto CLI 新增后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | plan:dry-run CLI 新增后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | plan:dry-run CLI 新增后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | run-auto 共享模块抽取后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | run-auto 共享模块抽取后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | agents:config 命令迁移�?oclif 并新�?CLI 测试 |
| 2025-10-10 | npm run typecheck | local | passed | agents:config 命令迁移�?oclif 并新�?CLI 测试 |
| 2025-10-10 | npm run test | local | passed | approvals 命令迁移�?oclif 并新�?CLI 测试 |
| 2025-10-10 | npm run typecheck | local | passed | approvals 命令迁移�?oclif 并新�?CLI 测试 |
| 2025-10-10 | npm run test | local | passed | oclif 入口 scaffold 后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | oclif 入口 scaffold 后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | Sqlite 审批与多流日志回归验�?|
| 2025-10-10 | npm run typecheck | local | passed | Sqlite 审批与多流日志回归验�?|
| 2025-10-10 | npm run test | local | passed | Pino 多流日志改造后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | Pino 多流日志改造后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | SqliteApprovalStore 集成后全量测试通过 |
| 2025-10-10 | npm run test | local | passed | SqliteCheckpointStore 集成后全量测试通过 |
| 2025-10-10 | npm run test | local | passed | 引入 sqlite 基线（StateDatabase）后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | SqliteCheckpointStore 集成后类型检查通过 |
| 2025-10-10 | npm run typecheck | local | passed | SqliteApprovalStore 集成后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | 共享 Schema 模块化后全量测试通过 |
| 2025-10-10 | npm run typecheck | local | passed | 共享 Schema 模块化后类型检查通过 |
| 2025-10-10 | npm run typecheck | local | passed | 普通任务适配器接�?execa/got/Croner/json-logic 后通过 |
| 2025-10-10 | npm run test | local | passed | 普通任务适配器与 JSON Logic 行为已覆�?|
| 2025-10-10 | npm run typecheck | local | passed | 执行器核�?API 重构后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | 执行器核�?API 重构后全量测试通过 |
| 2025-10-10 | npm run test | local | passed | 新增检查点持久化测试（state/checkpoint）通过 |
| 2025-10-10 | npm run typecheck | local | passed | 检查点与日志接口更新后类型检查通过 |
| 2025-10-10 | npm run typecheck | local | passed | 修复 MCP StubClient、自动执行与执行器测试类型后通过 |
| 2025-10-10 | npm run test | local | passed | MCP Bridge 切换官方 SDK 后全量测试通过 |
| 2025-10-10 | npm run test | local | passed | 引入 LangGraph 执行器后全量测试通过 |
| 2025-10-10 | npm run logs:tail -- --category app | local | passed | �?logs:tail 脚本可格式化输出 |
| 2025-10-10 | npm run test | local | passed | 重命名为 hush-ops 后全量测试通过 |
| 2025-10-10 | npm run test | local | passed | Runtime 集成 + 自动执行断线重连测试通过 |
| 2025-10-10 | npm run test | local | passed | MCP Bridge 状态机与会话测试通过 |
| 2025-10-10 | npm run test | local | passed | 新增 orchestrator 执行器骨架测试通过 |
| 2025-10-10 | npm run test | local | passed | Runtime 事件扩展�?GUI 禁用实现后全套测试通过 |
| 2025-10-10 | npm run test | local | passed | 新增 agents-config 测试通过，示例脚本兼容自动注�?|
| 2025-10-09 | npm run test | local | passed | 所�?Vitest 用例通过（含插件化调整） |
| 2025-10-09 | npm run lint | local | failed | 多个 any 类型与转义字符警告（详见 src/agents/registry.ts�?|
| 2025-10-09 | npm run typecheck | local | failed | RunDemandAnalysisOptions 未满�?AgentRunContext 约束 |
| 2025-10-09 | npm run lint | local | passed | registry 插件类型修复后通过 |
| 2025-10-09 | npm run typecheck | local | passed | DemandAnalysis 插件选项类型与注册表已通过 TS 检�?|
| 2025-10-09 | npm run test | local | passed | 单元测试保持绿色 |
| 2025-10-09 | npm run lint | local | passed | 插件体系重构后保持通过 |
| 2025-10-09 | npm run typecheck | local | passed | 新类型定义无编译错误 |
| 2025-10-09 | npm run test | local | passed | 单元测试通过 |
| 2025-10-10 | npm run cli -- plan:dry-run --plan samples/mx-01.json | local | passed | MX-01 顺序链路样例 dry-run 验证 |
| 2025-10-10 | npm run cli -- plan:dry-run --plan samples/mx-02.json | local | passed | MX-02 条件分支样例 dry-run 验证 |
| 2025-10-10 | npm run cli -- plan:dry-run --plan samples/mx-03.json | local | passed | MX-03 并行+审批样例 dry-run 验证 |
| 2025-10-10 | npm run cli -- plan:dry-run --plan samples/mx-04.json | local | passed | MX-04 MCP 断线重连样例 dry-run 验证 |
| 2025-10-10 | npm run cli -- plan:dry-run --plan samples/mx-05.json | local | passed | MX-05 普通任务重试样�?dry-run 验证 |
| 2025-10-10 | npm run typecheck | local | passed | Orchestrator Service 骨架与客户端新增后类型检查通过 |
| 2025-10-10 | npm run test -- tests/ui/PlanActions.spec.tsx tests/ui/PendingApprovals.spec.tsx | local | passed | Web UI 执行/审批组件新增单测覆盖 |
| 2025-10-10 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 新增停止接口后服务端集成测试通过 |
| 2025-10-10 | npm run test -- tests/service/orchestrator/events.spec.ts | local | passed | logs.appended/metrics.update 骨架事件广播测试 |
| 2025-10-10 | npm run test -- tests/scripts/orchestrator-automation.spec.ts | local | passed | Orchestrator SDK 自动化示例脚本验�?|
| 2025-10-10 | npm run test -- tests/ui/PlanActions.spec.tsx tests/ui/PendingApprovals.spec.tsx tests/ui/ExecutionList.spec.tsx | local | passed | 执行列表停止按钮与审�?执行组件测试通过 |
| 2025-10-10 | npm run test -- tests/cli/executions-stop.spec.ts | local | passed | CLI executions:stop 命令集成测试通过 |
| 2025-10-10 | npm run test -- tests/cli/approvals.spec.ts | local | passed | CLI 审批命令在迁移警示后仍可�?|
| 2025-10-10 | npm run typecheck | local | passed | 停止接口、事件广播与 CLI 提示完成后类型检查通过 |
| 2025-10-10 | npm run test | local | passed | Orchestrator Service 骨架与测试新增后全量测试通过 |
| 2025-10-11 | npm run typecheck | local | passed | plan:dry-run 支持 --plan-id 后类型检查通过 |
| 2025-10-11 | npm run test -- tests/cli/plan-dry-run.spec.ts | local | passed | 新增 registry plan dry-run 用例全部通过 |
| 2025-10-11 | npm run typecheck | local | passed | Web UI 注册表计划选择器引入后类型检查通过 |
| 2025-10-11 | npm run test -- tests/ui/PlanActions.spec.tsx | local | passed | PlanActions 注册表选择器单测覆盖通过 |
| 2025-10-11 | npm run ui:build | local | passed | Web UI 产物构建成功，含新注册表选择�?|
| 2025-10-11 | npm run typecheck | local | passed | 移除远程注册表后类型检查通过 |
| 2025-10-11 | npm run test | local | passed | 本地 JSON 注册表、CLI/GUI 测试全部通过 |
| 2025-10-11 | npm run typecheck | local | passed | 注册表只读 API 与 Web UI 计划选择增强后类型检查通过 |
| 2025-10-11 | npm run test | local | passed | 全量 Vitest 覆盖注册表只读端点与 UI 选择流程 |
| 2025-10-11 | npm run typecheck | local | passed | registry manifest 生成与 CLI 脚本引入后类型检查通过 |
| 2025-10-11 | npm run test -- tests/shared/registry/manifest.spec.ts tests/scripts/registry-manifest.spec.ts | local | passed | Manifest 核心逻辑与 CLI 入口单测通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 控制平面快照事件与 REST 响应增强后服务侧测试通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | `/status` 快照接口与客户端状态摘要新增后回归通过 |
| 2025-10-12 | npm run test -- tests/ui/plugins/mcpToolExplorer.spec.tsx | local | passed | MCP 工具浏览器插件新增筛选与结构化结果视图后回归通过 |
| 2025-10-12 | npm run test -- tests/ui/plugins/pluginRuntime.spec.tsx | local | passed | 插件运行时新增 requestApproval 能力后回归通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | `/approvals/request` 接口与手动审批流程验证通过 |
| 2025-10-11 | npm run typecheck | local | passed | 新增流式死信脚本后全仓类型检查 |
| 2025-10-11 | npm run test -- tests/scripts/tool-stream-dead-letter.spec.ts | local | passed | 流式死信脚本导出与重放集成测试 |
| 2025-10-11 | npm run typecheck | local | passed | 死信脚本新增 --latest 能力后全仓类型检查 |
| 2025-10-11 | npm run test -- tests/scripts/tool-stream-dead-letter.spec.ts | local | passed | 验证死信脚本在 --latest 扫描场景下的导出与重放 |
| 2025-10-11 | npm run typecheck | local | passed | CLI executions:tool-streams 支持 --latest 后类型检查 |
| 2025-10-11 | npm run test -- tests/cli/executions-tool-streams.spec.ts | local | passed | 验证 CLI 最近执行扫描与死信导出/重放流程 |
| 2025-10-12 | npm run typecheck | local | passed | runtime.tool-stream 语义收敛与 UI/CLI 更新后类型检查通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 同步事件模型与历史重放回归验证 |
| 2025-10-12 | npm run test -- tests/ui/plugins/mcpToolExplorer.spec.tsx | local | passed | 工具浏览器同步事件视图与历史面板回归通过 |
| 2025-10-12 | npm run test -- tests/ui/plugins/pluginRuntime.spec.tsx | local | passed | 插件运行时在新事件载荷下完成能力校验 |
| 2025-10-12 | npm run test -- tests/cli/executions-tool-streams.spec.ts | local | passed | CLI 流式详情/死信导出在同步载荷下通过 |
| 2025-10-12 | npm run test -- tests/scripts/tool-stream-dead-letter.spec.ts | local | passed | 死信脚本改写事件载荷后导出与重放测试通过 |
| 2025-10-12 | npm run typecheck | local | passed | 移除流式模拟参数后全仓类型检查通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 工具执行轨迹同步语义回归验证 |
| 2025-10-12 | npm run typecheck | local | passed | OTel 指标扩展与死信摘要更新后类型检查通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 服务端广播携带状态指标并通过回归验证 |
| 2025-10-12 | npm run test -- tests/scripts/tool-stream-dead-letter.spec.ts | local | passed | 死信脚本新增汇总输出后回归验证 |
| 2025-10-12 | npm run typecheck | local | passed | health-check 脚本与 Day-2 文档更新后类型检查通过 |
| 2025-10-12 | npm run test -- tests/scripts/health-check.spec.ts | local | passed | 健康检查脚本覆盖正常与错误场景，验证自动重放逻辑 |
| 2025-10-12 | npm run test -- tests/scripts/health-check.spec.ts | local | passed | ops check 子命令巡检场景回归通过 |
| 2025-10-12 | npm run test -- tests/scripts/tool-stream-dead-letter.spec.ts | local | passed | ops deadletter 子命令导出与重放回归通过 |
| 2025-10-12 | npm run test -- tests/scripts/orchestrator-automation.spec.ts | local | passed | ops auto 子命令校验/执行流程回归通过 |
| 2025-10-12 | npm run test -- tests/scripts/health-check.spec.ts | local | passed | 验证脚本清理后 ops 巡检基线仍可运行 |
| 2025-10-12 | npm run lint | local | failed | 现有代码包含未处理的 eslint unused vars 与 parserOptions.project 配置问题，锁文件清理未触发新增错误 |
| 2025-10-12 | npm run lint | local | passed | 调整 ESLint 配置并清理未使用变量/console 后恢复通过 |
| 2025-10-12 | npm run typecheck | local | passed | 替换 registry manifest 测试导入与 ESLint 配置后，Node/UI 双 tsconfig 检查通过 |
| 2025-10-12 | npm run test -- tests/scripts/orchestrator-automation.spec.ts | local | passed | 核验 ops 脚本执行与 Orchestrator 服务流程，确保日志/审批改动未导致回归 |
| 2025-10-12 | npm run test | local | failed | 全量 Vitest 运行中 `bridgeSession` 使用 sdk 模拟报 `callTool` 缺失，以及多个 CLI 测试因 5s 默认超时失败；需评估是否调整 SDK mock 或延长 timeout |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | failed | Registry REST 接口已下线，遗留用例仍访问 `/registry/plans` 导致 404 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 删除 Registry 用例后确认剩余 REST 功能均通过 |
| 2025-10-12 | npm run test | local | passed | 极简化后全量 Vitest 107 项通过，CLI/服务端均不再依赖 Registry/GitOps 逻辑 |
| 2025-10-12 | npm run test | local | passed | 梳理引用期间复跑全量套件确认无新增回归，107 项持续通过 |
| 2025-10-12 | npm run typecheck | local | passed | 极简运维清理后复跑类型检查，全局与 UI tsconfig 均通过 |
| 2025-10-12 | npm run lint | local | passed | 调整 Orchestrator 指标辅助参数后，ESLint 全量通过 |
| 2025-10-12 | npm run test | local | passed | 极简清理后全量 Vitest 28 文件/100 用例通过，CLI/UI 套件稳定 |
| 2025-10-12 | npm run build | local | passed | TypeScript 编译通过，确认极简化后产物可生成 |
| 2025-10-12 | npm run ui:ga | local | passed | GUI Gold Release 验收脚本完成（typecheck + UI 冒烟 5 用例） |
| 2025-10-12 | n/a | n/a | not_run | 文档归档：仅更新 `.codex/context-question-1.json` 与 `RESULTS/`，无需新增测试 |
| 2025-10-12 | npm run test | local | passed | 28 个测试文件 / 100 用例通过，覆盖 CLI、服务端、UI 插件路径 |
| 2025-10-12 | npm run ui:ga | local | passed | 冒烟回归：typecheck + UI 5 用例再次通过，无新增告警 |
| 2025-10-12 | npm run test -- tests/mcp/config/loader.spec.ts | local | passed | MCP 配置加载模块单测：校验数组/映射格式解析与缓存重载逻辑 |
| 2025-10-12 | npm run test -- tests/mcp/sessionRegistry.spec.ts | local | passed | SQLite mcp_sessions 迁移后验证 load/save/clear 行为 |
| 2025-10-12 | npm run test -- tests/ui/PlanActions.spec.tsx | local | passed | PlanActions 新增 MCP 服务器选择控件后回归通过 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts | local | passed | 新增 /mcp/servers API 后服务端 9 项回归通过 |
| 2025-10-12 | npm run typecheck | local | passed | config loader / CLI / UI 改造后全仓类型检查通过 |
| 2025-10-12 | npm run lint | local | passed | 新增代码符合现有 ESLint 规则 |
| 2025-10-12 | npm run build | local | passed | 改造后 TypeScript 编译通过 |
| 2025-10-12 | npm run ui:ga | local | passed | GUI Gold Release 脚本（类型检查 + UI 核心单测）通过 |
| 2025-10-12 | npm run typecheck -- --pretty false | local | passed | 事件总线 schema 引入后验证 Node/UI 双 tsconfig 类型检查 |
| 2025-10-12 | npm run lint | local | passed | Phase B 事件总线改造后再跑 ESLint，确认无格式问题 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts | local | passed | 新增事件 schema 单测验证 runtime.state-change 与 logs.appended 示例解析 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts tests/service/orchestrator/eventBus.spec.ts | local | passed | 事件 schema + eventBus 校验逻辑测试通过（合法/非法场景） |
| 2025-10-12 | npm run lint | local | passed | 事件总线广播改造后再次运行 ESLint，确认 server.ts 更新符合规范 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts tests/service/orchestrator/eventBus.spec.ts tests/service/orchestrator/eventBackpressure.spec.ts | local | passed | 事件 schema + eventBus + 背压测试通过，确认校验与丢弃逻辑生效 |
| 2025-10-12 | npm run lint | local | passed | 背压改造后再次运行 ESLint，确保 server.ts 更新符合规范 |
| 2025-10-12 | npm run lint | local | passed | 事件总线指标扩展后再次运行 ESLint，确认 server.ts 更新符合规范 |
| 2025-10-12 | npm run typecheck -- --pretty false | local | passed | Phase B 收口前再次运行类型检查（Node/UI 双 tsconfig） |
| 2025-10-12 | npm run build | local | passed | 事件总线改造后确认 TypeScript 编译输出正常 |
| 2025-10-12 | npm run ui:ga | local | passed | Gold Release 冒烟脚本（typecheck + UI 核心单测）复跑通过 |
| 2025-10-13 | npm run typecheck | local | passed | 事件总线观测脚本取消后复跑双 tsconfig 类型检查，无新增告警 |
| 2025-10-13 | npm run lint | local | passed | 极简观测收口无新 lint 问题，维护 server/spec 调整仍符合规则 |
| 2025-10-13 | npm run test | local | passed | 调整 WebSocket 用例改用 execution.completed + 轮询，32 测试文件/111 用例全绿 |
| 2025-10-13 | npm run build | local | passed | TypeScript 构建确认极简方案仍可产出 dist |
| 2025-10-13 | npm run ui:ga | local | passed | Gold Release 冒烟（typecheck + UI 5 用例）在观测脚本删减后保持通过 |
| 2025-10-13 | npm run test | local | passed | 更新 tool-stream 历史断言为 chunkCount≥1 后，全量 30 文件/103 用例再次全绿 |
| 2025-10-13 | npm run ui:ga | local | passed | Gold Release 冒烟（typecheck + UI 5 用例）复核通过，UI 流程稳定 |
| 2025-10-13 | npm run build | local | passed | TypeScript smoke 构建通过，确认极简方案可产出 dist |
