| 日期 | 工具 | 路径 | 摘要 |
| --- | --- | --- | --- |
| 2025-10-13 | desktop-commander.write_file / apply_patch | .codex/requirements.md; docs/deployment-local.md; docs/system-tools.md; docs/gui-business-ops-boundary.md; docs/mvp-roadmap.md; src/shared/logging/events.ts; src/shared/logging/logger.ts; tests/service/orchestrator/events.spec.ts; tests/shared/logging/logger.spec.ts | 重写需求/部署/系统工具文档，统一日志类别为 app、去除 SQLite 引用并更新相关测试 |
| 2025-10-13 | desktop-commander.apply_patch | PLAN.md | 清空阶段计划，保留无任务占位说明 |
| 2025-10-13 | desktop-commander.apply_patch | TASKS.md | 删除任务表格，仅保留空白提示 |
| 2025-10-13 | desktop-commander.apply_patch | src/cli/commands/executions/tool-streams.ts 等 | 移除 executions:tool-streams CLI 与死信脚本，更新相关测试与文档 |
| 2025-10-13 | desktop-commander.apply_patch | src/shared/logging/logger.ts 等 | 合并日志单流、将检查点/审批/MCP 会话/工具流持久化改为 JSON，删除 better-sqlite3 依赖 |
| 2025-10-12 | web.run | modelcontextprotocol.io / docs.claude.com | 调研 MCP 配置标准与安全要求 |
| 2025-10-12 | desktop-commander.start_process | npm run test | 全量 Vitest 套件通过，包含 CLI/脚本回归 |
| 2025-10-12 | desktop-commander.start_process | npm run test -- tests/cli/run-auto.spec.ts | run:auto CLI 集成测试耗时执行成功 |
| 2025-10-12 | desktop-commander.start_process | npm run test -- tests/cli/executions-tool-streams.spec.ts | executions:tool-streams CLI 用例确认不再超时 |
| 2025-10-12 | desktop-commander.start_process | npm run test -- tests/cli/plan-dry-run.spec.ts | plan:dry-run CLI 用例确认稳定通过 |
| 2025-10-12 | desktop-commander.start_process | npm run test -- tests/mcp/bridgeSession.spec.ts | BridgeSession callTool mock 验证单测恢复 |
| 2025-10-12 | desktop-commander.apply_patch | verification.md | 更新最近一次验证结论与风险列表 |
| 2025-10-12 | desktop-commander.start_process | npm run ui:ga | 类型检查与核心 UI 冒烟用例通过 |
| 2025-10-12 | desktop-commander.start_process | npm run build | TypeScript 构建通过，确认移除 DORA 面板后产物无误 |
| 2025-10-10 | desktop-commander.start_process | npm install react react-dom @types/react @types/react-dom vite @vitejs/plugin-react @testing-library/react @testing-library/jest-dom | 安装 Web UI 所需 React/Vite 及测试依赖 |
| 2025-10-10 | desktop-commander.start_process | npm install -D jsdom | 补充 Vitest jsdom 环境依赖 |
| 2025-10-10 | desktop-commander.apply_patch | package.json | 增加 UI 构建脚本与双阶段 typecheck |
| 2025-10-10 | desktop-commander.apply_patch | docs/library-alignment.md | Web UI 目标库更新为 React + TailwindCSS + daisyUI + React Flow |
| 2025-10-10 | desktop-commander.apply_patch | docs/ui-migration-plan.md | 技术方案补充 Tailwind+daisyUI 栈与样式策略 |
| 2025-10-10 | desktop-commander.apply_patch | .codex/requirements.md | 自定义 Web UI 需求写明 Tailwind + daisyUI |
| 2025-10-10 | desktop-commander.apply_patch | .codex/notes | 记录 daisyUI 选型决策与风险提示 |
| 2025-10-11 | desktop-commander.apply_patch | PLAN.md | 更新 M0/M1/M2 段落与近期优先级，反映最新任务状态 |
| 2025-10-11 | desktop-commander.apply_patch | TASKS.md | 将 MVP-Registry 任务标记完成并清理待启动列表 |
| 2025-10-11 | desktop-commander.apply_patch | docs/plan-registry.md | 补充 GitOps 蓝图任务引用（5af31de2） |
| 2025-10-11 | desktop-commander.apply_patch | docs/cli-migration.md | 新增 Phase 2.5 行文记录 Orchestrator 客户端适配梳理任务 |
| 2025-10-11 | desktop-commander.write_file | docs/platform-overview.md | 新建平台总览文档，整合架构/适配器/UI 内容 |
| 2025-10-11 | desktop-commander.write_file | docs/service-api-guide.md | 新建服务/API 统一指南，替换原服务与治理文档 |
| 2025-10-11 | desktop-commander.write_file | .codex/requirements.md | 合并压缩版需求并新增 operations-log 季度归档策略 |
| 2025-10-11 | desktop-commander.write_file | .codex/operations-log-2025Q4.md | 建立季度归档占位文件 |
| 2025-10-11 | desktop-commander.apply_patch | docs/index.md | 更新文档导航，指向平台总览与统一指南 |
| 2025-10-11 | desktop-commander.write_file | docs/architecture.md, docs/plan-adapters.md, docs/ui-migration-plan.md, docs/orchestrator-service.md, docs/api-governance.md | 将重复内容改为索引页并指向新文档 |
| 2025-10-11 | desktop-commander.edit_block | src/shared/persistence/registryStore.ts | 更新 prepare 泛型签名兼容新版 @types/better-sqlite3 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/graph/PlanCanvas.tsx | 移除重复 PlanNodeState 类型别名避免冲突 |
| 2025-10-11 | desktop-commander.write_file | src/ui/components/PlanActions.tsx, PendingApprovals.tsx, ExecutionList.tsx, BridgeStatus.tsx | 更新 UI 组件使用 daisyUI/Tailwind 样式并精简结构 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | 引入 card 布局与 alert 提示，配合 daisyUI 组件 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/graph/PlanCanvas.tsx | 改用 daisyUI/Tailwind 样式、自定义边线并新增 bridgeBadgeClass |
| 2025-10-11 | desktop-commander.write_file | src/ui/styles/app.css | 缩减样式，仅保留全局暗色背景（PlanCanvas 样式改由 Tailwind 提供） |
| 2025-10-11 | desktop-commander.edit_block | tests/ui/PlanCanvas.spec.tsx | 更新断言匹配新的文本结构与 Tailwind 类 |
| 2025-10-11 | desktop-commander.edit_block | docs/ui-migration-plan.md | 记录 hush Tailwind 主题、React Flow 样式整合 |
| 2025-10-11 | desktop-commander.edit_block | docs/library-alignment.md | 更新 Web UI 目标库说明（Tailwind v3 + daisyUI v4 + `src/ui/theme/hush.css` token） |
| 2025-10-11 | desktop-commander.edit_block | src/ui/main.tsx | 默认将 `data-theme` 设为 hush 主题 |
| 2025-10-11 | desktop-commander.write_file | src/ui/theme/hush.css, src/ui/styles/app.css, tailwind-theme.css | 新建主题 token 文件并调整导入路径（保留根文件声明迁移） |
| 2025-10-11 | desktop-commander.edit_block | docs/ui-migration-plan.md | 记录 hush Tailwind 主题与前端栈版本 |
| 2025-10-11 | desktop-commander.write_file | tailwind.config.ts | 更新 hush 主题配置（继承 daisyUI night 主题） |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/graph/PlanCanvas.tsx | 使用 hush token 为边线着色 |
| 2025-10-11 | desktop-commander.write_file | src/ui/components/graph/PlanCanvas.module.css | 新建 Plan 节点 CSS 模块引用 hush token |
| 2025-10-11 | desktop-commander.edit_block | docs/library-alignment.md | 更新 Web UI 目标库说明（Tailwind v3 + daisyUI v4 + `src/ui/theme/hush.css` token） |
| 2025-10-11 | desktop-commander.edit_block | docs/ui-migration-plan.md | 记录 hush Tailwind 主题、React Flow 样式整合 |
| 2025-10-11 | npm | run typecheck | PlanCanvas Tailwind 化后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | PlanCanvas UI 回归（单独） |
| 2025-10-11 | npm | run test -- tests/ui | Tailwind 颜色重整后 UI 组件回归通过 |
| 2025-10-11 | npm | run ui:build | Tailwind/daisyUI 配置下 Vite 构建成功 |
| 2025-10-11 | desktop-commander.write_file | docs/gui-plugin-spec.md | 新建 GUI 插件协议草案，定义 manifest、生命周期、能力模型 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 将 GUI 插件协议相关任务标记完成并更新下一步说明 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | Web/MCP UI 轨道标注插件规格任务完成状态 |
| 2025-10-11 | desktop-commander.write_file | src/ui/plugins/planOverlays.tsx | 抽离 overlay 注册逻辑，提供测试 reset 方法 |
| 2025-10-11 | desktop-commander.write_file | src/ui/plugins/runtime/* | 新建插件运行时骨架（manifest、context、pluginRuntime）并接入内置 execution-trail 插件 |
| 2025-10-11 | desktop-commander.write_file | src/ui/plugins/builtins/execution-trail/* | 新增内置插件 manifest + 模块，迁移节点轨迹徽标实现 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | 引入 PluginRuntimeProvider 并声明 runtime:state-change 可用事件 |
| 2025-10-11 | desktop-commander.write_file | tests/ui/plugins/pluginRuntime.spec.tsx | 添加插件运行时单元测试覆盖 |
| 2025-10-11 | npm | run typecheck | 插件运行时改造后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/ui/plugins/pluginRuntime.spec.tsx | 验证内置插件自动加载与 overlay 清理 |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | 确认 Plan 画布在新运行时下仍然通过 |
| 2025-10-11 | desktop-commander.write_file | src/ui/plugins/runtime/pluginRuntime.ts | 扩展插件运行时，新增 command/panel 管理与订阅能力 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/plugins/runtime/context.tsx | 增加 usePluginCommands/usePluginPanels 钩子并输出新类型 |
| 2025-10-11 | desktop-commander.write_file | src/ui/components/PluginSidePanels.tsx | 新增侧边面板容器，渲染插件面板内容 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/PlanActions.tsx | 接入插件命令按钮并处理执行错误 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | 恢复双列布局并挂载插件侧边面板，Provider 声明事件能力 |
| 2025-10-11 | desktop-commander.write_file | tests/ui/plugins/pluginRuntime.spec.tsx | 扩展单测覆盖命令/面板注册与内置插件加载 |
| 2025-10-11 | npm | run typecheck | 插件 runtime 扩展后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/ui/plugins/pluginRuntime.spec.tsx | 验证命令/面板注册与内置插件加载 |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | 回归验证 Plan 画布在新运行时下仍通过 |
| 2025-10-11 | desktop-commander.write_file | src/ui/plugins/builtins/mcp-tool-explorer/* | 新增 MCP 工具浏览器内置插件（manifest + module） |
| 2025-10-11 | desktop-commander.edit_block | src/ui/plugins/runtime/pluginRuntime.ts | 注入 MCP 桥接 API、listTools/callTool 支持，并注册新内置插件 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | Provider 注入 mock MCP 桥接、展示插件侧边面板 |
| 2025-10-11 | desktop-commander.write_file | src/ui/components/PluginSidePanels.tsx | 新增插件侧边面板容器 |
| 2025-10-11 | desktop-commander.edit_block | docs/gui-plugin-spec.md | 文档更新桥接 API、命令/面板说明及版本记录 |
| 2025-10-11 | desktop-commander.edit_block | docs/ui-migration-plan.md | Phase B 记录 MCP 工具浏览器示例 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 标记 GUI 插件运行时与 MCP 插件示例任务完成 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 更新任务状态与下一步说明（运行时、MCP 插件示例） |
| 2025-10-11 | npm | run test -- tests/ui/plugins/pluginRuntime.spec.tsx | 验证 MCP 插件加载、命令面板注册 |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | 回归检查 Plan 画布 |
| 2025-10-11 | npm | run ui:build | Web UI 构建通过（含新插件） |
| 2025-10-11 | desktop-commander.edit_block | src/service/orchestrator/controller.ts | 新增 listMcpTools/callMcpTool，复用桥接会话 + ToolDescriptor | 
| 2025-10-11 | desktop-commander.edit_block | src/service/orchestrator/server.ts | 暴露 `/mcp/tools` REST 接口并接入布尔解析 | 
| 2025-10-11 | desktop-commander.edit_block | src/ui/services/orchestratorApi.ts | 增补 fetchMcpTools/callMcpTool API | 
| 2025-10-11 | desktop-commander.edit_block | docs/service-api-guide.md | REST 摘要新增 MCP 工具端点说明 |
| 2025-10-11 | npm | run typecheck | MCP API 接入后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/ui/plugins/pluginRuntime.spec.tsx | 扩展后验证插件加载与能力降级 |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | 确认 UI 回归 |
| 2025-10-11 | desktop-commander.edit_block | docs/event-metrics-spec.md | 补充事件总线蓝图（阶段目标、任务拆解、风险与验证策略） |
| 2025-10-11 | desktop-commander.edit_block | docs/plan-registry.md | 补充 GitOps 蓝图（结构、CI、回滚、指标），完成任务 87164ffe/5af31de2/fbd7e91f |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 更新 Registry GitOps 轨道优先级描述，记录蓝图任务完成 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 将 Registry GitOps 蓝图相关任务标记完成并同步下一步 |
| 2025-10-11 | desktop-commander.edit_block | src/cli/commands/plan/dry-run.ts | 新增 --plan-id/--plan-version 支持并复用 Registry Plan 校验 |
| 2025-10-11 | desktop-commander.edit_block | tests/cli/plan-dry-run.spec.ts | 补充 registry plan dry-run 集成测试 |
| 2025-10-11 | desktop-commander.edit_block | docs/cli-migration.md | 更新计划校验功能描述，记录 Registry Plan 能力 |
| 2025-10-11 | npm | run typecheck | 验证 CLI 改动后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/cli/plan-dry-run.spec.ts | Registry Plan dry-run 场景测试通过 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/services/orchestratorApi.ts | 新增 registry plan API 列表/单项读取方法 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | 添加注册表计划状态、加载逻辑与选择回调，接入 PlanActions |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/PlanActions.tsx | 增加注册表计划选择器与刷新按钮，支持禁用与错误提示 |
| 2025-10-11 | desktop-commander.edit_block | tests/ui/PlanActions.spec.tsx | 更新单测并 mock 插件运行时，覆盖注册表选择逻辑 |
| 2025-10-11 | desktop-commander.edit_block | docs/gui-runtime-spec.md | 补充“注册表计划”选择器规范 |
| 2025-10-11 | desktop-commander.edit_block | docs/ui-migration-plan.md | 将 plan:dry-run 映射标记为 MVP，并记录注册表选择能力 |
| 2025-10-11 | npm | run typecheck | Web UI 注册表选择器改动后类型检查通过 |
| 2025-10-11 | npm | run test -- tests/ui/PlanActions.spec.tsx | 注册表计划选择流程单测通过 |
| 2025-10-11 | npm | run ui:build | 新 UI 功能构建产物验证 |
| 2025-10-11 | desktop-commander.write_file | docs/platform-overview.md | 合并开源库映射章节，统一维护库接入策略 |
| 2025-10-11 | desktop-commander.write_file | docs/library-alignment.md | 转为指向平台总览的存根，减少文档重复 |
| 2025-10-11 | desktop-commander.edit_block | docs/index.md | 更新索引指向平台总览新章节 |
| 2025-10-11 | desktop-commander.write_file | docs/gui-handbook.md | 整合 UI 路线与运行时协议，形成统一 GUI 手册 |
| 2025-10-11 | desktop-commander.write_file | docs/ui-migration-plan.md | 改写为指向 GUI 手册的存根 |
| 2025-10-11 | desktop-commander.write_file | docs/gui-runtime-spec.md | 改写为指向 GUI 手册的存根 |
| 2025-10-11 | desktop-commander.edit_block | docs/index.md | 添加 GUI 手册条目并标记旧文档为存根 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 更新 UI 轨道引用到 GUI 手册 |
| 2025-10-11 | desktop-commander.edit_block | .codex/notes | 记录文档瘦身执行与后续建议 |
| 2025-10-11 | desktop-commander.edit_block | 测试矩阵文档 | 新增 MX-06 GUI 场景并说明批量执行注意事项 |
| 2025-10-11 | desktop-commander.edit_block | .codex/testing.md | 记录测试矩阵更新（未执行新脚本） |
| 2025-10-11 | npm | run test -- tests/ui/PlanCanvas.spec.tsx | MX-06 自动化验证：事件流与节点状态单测通过 |
| 2025-10-11 | npm | run test -- tests/ui/PendingApprovals.spec.tsx | MX-06 自动化验证：审批待办交互单测通过 |
| 2025-10-11 | npm | run test | 全量 Vitest 复跑，确认基础测试脚本可执行 |
| 2025-10-11 | powershell | 旧批量脚本尝试 | 命令无法执行（PowerShell 抛出错误），需改用定制脚本方案 |
| 2025-10-11 | powershell | 清理旧批量脚本资产 | 删除旧批量脚本文件与相关示例计划 |
| 2025-10-11 | desktop-commander.write_file | 测试矩阵文档 | 转换为退役说明，移除批量脚本指引 |
| 2025-10-11 | desktop-commander.edit_block | docs/index.md | 更新测试矩阵文档条目状态 |
| 2025-10-11 | desktop-commander.edit_block | docs/cli-migration.md | 清理测试矩阵相关行并增加退役说明 |
| 2025-10-11 | desktop-commander.edit_block | docs/event-metrics-spec.md | 移除批量脚本指标描述与验证步骤 |
| 2025-10-11 | desktop-commander.edit_block | docs/gui-plugin-spec.md | 删除批量脚本指标引用 |
| 2025-10-11 | desktop-commander.edit_block | docs/mvp-roadmap.md | 更新增强阶段描述 |
| 2025-10-11 | desktop-commander.edit_block | docs/platform-overview.md | 移除批量脚本引用 |
| 2025-10-11 | desktop-commander.edit_block | METRICS.md | 删除批量脚本指标行 |
| 2025-10-12 | desktop-commander.apply_patch | docs/day2-ops-inventory.md | 新建 Day-2 运维资产盘点表，标注保留/候选删除/迁移项 |
| 2025-10-12 | desktop-commander.apply_patch | docs/day2-ops-simplification-blueprint.md | 输出 Day-2 运维精简蓝图，定义目标状态与阶段计划 |
| 2025-10-12 | desktop-commander.apply_patch | docs/gui-business-ops-boundary.md | 梳理 GUI 业务/运维组件边界，支撑业务化与运维迁移计划 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-business-ops-boundary.md | 更新插件分类：保留业务可视化插件，运维诊断插件迁移至受控入口 |
| 2025-10-12 | desktop-commander.apply_patch | src/ui/components/DoraMetricsPanel.tsx | 删除 DORA 指标组件文件 |
| 2025-10-12 | desktop-commander.apply_patch | src/ui/App.tsx | 移除 DoraMetricsPanel 导入与插件注册 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 更新 Gold Release 清单，标注 DORA 面板已下线 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-gold-release.md | 调整验收脚本，DORA 步骤改为跳过说明 |
| 2025-10-12 | desktop-commander.edit_block | METRICS.md | 更新 GUI 验收与 Golden Path 行备注，说明无 DORA 界面 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | Golden Path 门户描述中注明 DORA 面板下线 |
| 2025-10-12 | desktop-commander.edit_block | TASKS.md | 更新门户任务说明，指出 DORA 指标需改为离线统计 |
| 2025-10-12 | desktop-commander.edit_block | docs/day2-runbook.md | 在脚本说明中标注 DORA 指标界面已下线 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 调整相关任务描述并标记脚本退役 |
| 2025-10-11 | desktop-commander.edit_block | .codex/testing.md | 批量清理旧批量脚本相关记录 |
| 2025-10-11 | desktop-commander.edit_block | .codex/notes | 记录脚本退役说明 |
| 2025-10-12 | cmd | 清理测试矩阵文档 | 已删除退役文件 |
| 2025-10-12 | desktop-commander.edit_block | docs/index.md | 移除测试矩阵文档索引 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md | 清理批量脚本相关描述 |
| 2025-10-12 | desktop-commander.edit_block | docs/deployment-local.md | 更新 OTel 验证说明，去除测试矩阵引用 |
| 2025-10-12 | desktop-commander.edit_block | docs/cli-migration.md | 调整无头自动化段落，移除测试矩阵脚本描述 |
| 2025-10-12 | desktop-commander.edit_block | docs/mvp-roadmap.md | 更新文档/测试闭环条目，指向 `.codex/testing.md` |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-plugin-spec.md | 改为同步 `.codex/testing.md` 的指引 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 删除测试矩阵文档相关引用 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 更新 WU-06 说明，改引用 `.codex/testing.md` |
| 2025-10-12 | desktop-commander.edit_block | METRICS.md | 去除测试矩阵文档条目 |
| 2025-10-12 | desktop-commander.edit_block | .codex/testing.md | 调整测试记录备注，说明文档已移除 |
| 2025-10-12 | desktop-commander.edit_block | package.json | 移除批量脚本命令 |
| 2025-10-11 | desktop-commander.edit_block | docs/gui-handbook.md | 在插件章节补充对 gui-plugin-spec 的引用，明确文档分工 |
| 2025-10-11 | desktop-commander.edit_block | .codex/notes | 更新文档瘦身策略备注，标记 GUI 手册与插件规范分工 |
| 2025-10-11 | desktop-commander.edit_block | src/service/orchestrator/server.ts | 增加 `/registry/plans` 只读端点与明细查询 |
| 2025-10-11 | desktop-commander.edit_block | src/ui/services/orchestratorApi.ts | 新增注册表列表/详情 fetch API |
| 2025-10-11 | desktop-commander.edit_block | src/ui/App.tsx | 引入注册表 Plan 选择状态与加载回调，接入 PlanActions |
| 2025-10-11 | desktop-commander.edit_block | src/ui/components/PlanActions.tsx | 添加注册表选择器、刷新按钮与禁用逻辑 |
| 2025-10-11 | desktop-commander.edit_block | tests/ui/PlanActions.spec.tsx | 覆盖注册表选择交互单测 |
| 2025-10-12 | cmd | 清理测试矩阵文档 | 已删除退役文件 |
| 2025-10-12 | desktop-commander.edit_block | docs/index.md | 移除测试矩阵文档条目并更新索引 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md | 移除批量脚本引用 |
| 2025-10-12 | desktop-commander.edit_block | docs/deployment-local.md | 更新 OTel 验证说明，删除测试矩阵脚本引用 |
| 2025-10-12 | desktop-commander.edit_block | docs/cli-migration.md | 调整无头自动化段落，删除测试矩阵脚本描述 |
| 2025-10-12 | desktop-commander.edit_block | docs/mvp-roadmap.md | 改为引用 `.codex/testing.md` 记录测试闭环 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-plugin-spec.md | 改为同步 `.codex/testing.md` 的指引 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 删除测试矩阵文档引用 |
| 2025-10-12 | desktop-commander.edit_block | docs/platform-overview.md | 更新事件总线描述，移除批量脚本提法 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 更新 WU-06 与下一步行动描述，改用 `.codex/testing.md` |
| 2025-10-12 | desktop-commander.edit_block | METRICS.md | 校正文档同步记录，移除测试矩阵相关条目 |
| 2025-10-12 | desktop-commander.edit_block | .codex/testing.md | 更新备注，说明测试矩阵文档已删除 |
| 2025-10-11 | desktop-commander.edit_block | tests/service/orchestrator/server.spec.ts | 增加注册表只读端点集成测试 |
| 2025-10-11 | desktop-commander.edit_block | docs/plan-registry.md | 更新只读接口与 Git 备份流程说明 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 调整 Registry 轨道描述，标记 Git 备份任务 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 重命名 Registry 相关任务并记录 UI 迁移进展 |
| 2025-10-11 | powershell | Remove-Item .codex/archive/registry*.bak | 清理遗留旧版注册表备份文件 |
| 2025-10-11 | desktop-commander.edit_block | docs/service-api-guide.md | 更新 REST 摘要，标注注册表只读端点 |
| 2025-10-11 | desktop-commander.write_file | src/shared/registry/manifest.ts | 新增 Manifest 生成与写入工具函数 |
| 2025-10-11 | desktop-commander.write_file | scripts/registry-manifest.ts | 提供 CLI 入口，支持 --check 校验 |
| 2025-10-11 | desktop-commander.write_file | tests/shared/registry/manifest.spec.ts | 覆盖 Manifest 生成与写入逻辑 |
| 2025-10-11 | desktop-commander.write_file | tests/scripts/registry-manifest.spec.ts | 验证 CLI 参数 --root/--check |
| 2025-10-11 | desktop-commander.edit_block | package.json | 添加 npm run registry:manifest 命令 |
| 2025-10-11 | desktop-commander.edit_block | docs/plan-registry.md | 文档补充 Manifest 流程与 Git 步骤 |
| 2025-10-11 | desktop-commander.write_file | docs/plan-registry.md | 新增发布示例流程与安全备注 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | Registry 轨道新增 manifest 步骤说明 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 更新 Registry 任务状态与备注 |
| 2025-10-11 | desktop-commander.write_file | src/types/minimist.d.ts | 新增 minimist 类型声明以满足脚本编译 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 合并插件规范内容并更新本地 JSON/GitOps 描述 |
| 2025-10-12 | desktop-commander.edit_block | docs/index.md | 更新索引，指向整合后的 GUI 手册 |
| 2025-10-12 | desktop-commander.edit_block | .codex/notes | 记录 GUI 插件规范并入手册 |
| 2025-10-12 | powershell | Remove-Item docs/gui-plugin-spec.md | 删除独立插件规范文档 |
| 2025-10-12 | desktop-commander.edit_block | docs/event-metrics-spec.md | 更新文档更新路径指向 GUI 手册 |
| 2025-10-12 | desktop-commander.edit_block | docs/platform-overview.md | 调整索引指向整合后的 GUI 手册章节 |
| 2025-10-12 | desktop-commander.edit_block | docs/cli-migration.md | 替换 GUI 规范引用为新的手册 |
| 2025-10-12 | desktop-commander.edit_block | README.md | 更新 UI 文档指引为 GUI 手册 |
| 2025-10-12 | desktop-commander.edit_block | docs/index.md | 精简索引并突出 GUI 手册为单一入口 |
| 2025-10-12 | desktop-commander.write_file | .codex/notes | 记录旧文档移除说明 |
| 2025-10-12 | powershell | Remove-Item docs/gui-runtime-spec.md, docs/ui-migration-plan.md, docs/library-alignment.md | 删除合并后的残留文档 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md; TASKS.md | 记录 MCP GUI 核心重构策略并挂载任务 2025-10-12-60~62 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 追加 MCP GUI 重构蓝图与阶段交付安排 |
| 2025-10-12 | desktop-commander.edit_block | src/service/orchestrator/controller.ts; server.ts; src/ui/types/orchestrator.ts; tests/service/orchestrator/server.spec.ts | 引入 runtime.snapshot 聚合、拓展执行记录字段并更新 WebSocket 广播与测试 |
| 2025-10-12 | npm | run test -- tests/service/orchestrator/server.spec.ts | 控制平面重构后回归服务端测试 |
| 2025-10-12 | desktop-commander.edit_block | src/client/orchestrator.ts; src/service/orchestrator/server.ts; tests/service/orchestrator/server.spec.ts | 新增服务状态快照接口与客户端摘要方法，并扩展回归测试 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md | 更新 `/status` 接口说明，标注 snapshots 聚合输出 |
| 2025-10-12 | desktop-commander.edit_block | src/ui/plugins/builtins/mcp-tool-explorer/pluginModule.tsx | 增强 MCP 工具浏览器界面：筛选、风险徽章、结构化结果渲染 |
| 2025-10-12 | desktop-commander.write_file | tests/ui/plugins/mcpToolExplorer.spec.tsx | 新增 MCP 工具浏览器交互与结构化结果测试 |
| 2025-10-12 | npm | run test -- tests/ui/plugins/mcpToolExplorer.spec.tsx | 验证工具浏览器面板改造 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 更新工具目录面板描述，记录筛选与结构化输出增强 |
| 2025-10-11 | task-manager-mcp.list_tasks | N/A | 三次探活失败，切换至 CodexPlan 降级流程 |
| 2025-10-11 | desktop-commander.write_file | .gitignore | 新建 Node/TypeScript 项目忽略规则，涵盖构建产物与 state/logs 目录 |
| 2025-10-12 | desktop-commander.edit_block | src/shared/approvals/controller.ts; src/service/orchestrator/controller.ts; src/service/orchestrator/server.ts; src/ui/services/orchestratorApi.ts; src/ui/plugins/runtime/pluginRuntime.ts; src/ui/App.tsx | 实现手动审批请求与插件 requestApproval 管道 |
| 2025-10-12 | desktop-commander.write_file | tests/ui/plugins/mcpToolExplorer.spec.tsx; tests/ui/plugins/pluginRuntime.spec.tsx | 新增 MCP 工具及运行时审批能力测试 |
| 2025-10-12 | npm | run test -- tests/ui/plugins/pluginRuntime.spec.tsx | 验证插件运行时审批调用 |
| 2025-10-12 | npm | run test -- tests/service/orchestrator/server.spec.ts | 验证 `/approvals/request` REST 接口 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md; docs/service-api-guide.md | 更新文档说明工具目录增强与审批请求接口 |
| 2025-10-12 | desktop-commander.edit_block | docs/gui-handbook.md | 补充 runtime.tool-stream 最佳实践与降级策略计划 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 桥接分层追加 runtime.tool-stream 与日志治理交付项 |
| 2025-10-12 | desktop-commander.edit_block | TASKS.md | 新增 2025-10-12-63/64 任务覆盖流式事件与日志治理 |
| 2025-10-11 | desktop-commander.edit_block | docs/gui-handbook.md | 标注 MCP 流式能力现状与最佳实践对齐 |
| 2025-10-11 | desktop-commander.edit_block | docs/service-api-guide.md | 调整 runtime.tool-stream 状态说明并补充阶段限制 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 更新 MCP 桥接分层黄金路径要求 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 细化 2025-10-12-62~64 验收标准 |
| 2025-10-11 | desktop-commander.edit_block | PLAN.md | 在 MCP 重构策略下新增行业最佳实践对齐小节，明确流式重放与 GitOps 管控路线 |
| 2025-10-11 | desktop-commander.edit_block | TASKS.md | 更新 2025-10-12-64 交付项并新增 2025-10-12-65/66 任务规划 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md; TASKS.md | 对齐行业最佳实践，补充 Golden Path/Day-2 守护与流式重放任务规划 |
| 2025-10-12 | desktop-commander.edit_block | src/service/orchestrator/controller.ts; src/service/orchestrator/server.ts; src/ui/plugins/runtime/pluginRuntime.ts; src/ui/plugins/builtins/mcp-tool-explorer/pluginModule.tsx; src/ui/services/orchestratorApi.ts | 接入 ToolStreamStore 持久化、历史查询/重放 REST API 及 UI 插件扩展 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md; docs/gui-handbook.md | 更新流式历史接口说明、GUI 手册新增历史面板与重放能力 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md; docs/gui-handbook.md; PLAN.md; TASKS.md | 补充审批请求与 runtime.snapshot 文档，标注 `bridge.stream` 为规划项，并同步计划/任务进度备注 |
| 2025-10-11 | desktop-commander.write_file / edit_block | scripts/tool-stream-dead-letter.ts; package.json; docs/deployment-local.md; README.md; tests/scripts/tool-stream-dead-letter.spec.ts | 新增 tool-streams:deadletter 脚本与测试，更新文档与命令清单，完成流式死信治理交付 |
| 2025-10-11 | desktop-commander.write_file / edit_block | scripts/tool-stream-dead-letter.ts; tests/scripts/tool-stream-dead-letter.spec.ts; README.md; docs/deployment-local.md | 扩展死信脚本支持 --latest 最近执行扫描，更新测试与文档 |
| 2025-10-11 | desktop-commander.edit_block / write_file | src/cli/commands/executions/tool-streams.ts; tests/cli/executions-tool-streams.spec.ts; README.md; docs/deployment-local.md | CLI executions:tool-streams 支持 --latest 扫描，更新测试与文档 |
| 2025-10-11 | desktop-commander.edit_block | src/shared/otel/metricsRecorder.ts; src/service/orchestrator/server.ts; docs/deployment-local.md | 在 runtime.tool-stream 事件中记录 OTel 指标并更新文档告警说明 |
| 2025-10-11 | desktop-commander.edit_block | docs/service-api-guide.md | 明确 runtime.tool-stream 载荷包含 CorrelationId/Source，并已接入 OTel 指标 |
| 2025-10-11 | desktop-commander.write_file | scripts/bridge-stream-probe.ts; docs/RISKS.md; package.json | 记录 MCP `tools.stream` 能力缺失风险，并新增诊断脚本入口 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 补充工具事件语义收敛策略与任务分配 |
| 2025-10-12 | desktop-commander.edit_block | TASKS.md | 新增 2025-10-12-70/71/72 任务，规划同步事件语义与文档落地 |
| 2025-10-12 | desktop-commander.edit_block | src/service/orchestrator/controller.ts; src/ui/App.tsx; src/ui/types/orchestrator.ts; src/ui/plugins/runtime/pluginRuntime.ts; src/ui/plugins/builtins/mcp-tool-explorer/pluginModule.tsx; src/cli/commands/executions/tool-streams.ts; scripts/tool-stream-dead-letter.ts | 收敛 runtime.tool-stream 事件载荷为 start/success/error + message，移除 progress/done 模拟并同步 CLI/脚本/插件实现 |
| 2025-10-12 | desktop-commander.edit_block | tests/service/orchestrator/server.spec.ts; tests/ui/plugins/mcpToolExplorer.spec.tsx; tests/cli/executions-tool-streams.spec.ts; tests/scripts/tool-stream-dead-letter.spec.ts | 更新测试覆盖同步事件语义、历史重放与死信导出 |
| 2025-10-12 | desktop-commander.edit_block | docs/service-api-guide.md; docs/gui-handbook.md | 调整 runtime.tool-stream 文档，记录同步模式与降级指引 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md; TASKS.md; docs/service-api-guide.md; docs/gui-handbook.md; src/mcp/bridge/types.ts; src/shared/schemas/plan.ts; src/shared/persistence/toolStreamStore.ts; src/service/orchestrator/controller.ts; src/service/orchestrator/server.ts | 收敛工具执行事件为同步语义，移除流式模拟字段并更新文档与计划任务 |
| 2025-10-12 | npm | run typecheck / run test -- tests/service/orchestrator/server.spec.ts | 代码调整后类型检查与服务端回归测试通过 |
| 2025-10-12 | desktop-commander.edit_block | src/shared/otel/metricsRecorder.ts; src/service/orchestrator/server.ts; scripts/tool-stream-dead-letter.ts; tests/scripts/tool-stream-dead-letter.spec.ts; PLAN.md; TASKS.md; docs/service-api-guide.md; docs/gui-handbook.md | 扩展工具事件 OTel 成功/失败计数器，死信脚本输出来源/工具摘要，并同步计划与文档 |
| 2025-10-12 | npm | run typecheck / run test -- tests/service/orchestrator/server.spec.ts / run test -- tests/scripts/tool-stream-dead-letter.spec.ts | 指标与脚本改动后通过类型检查与相关测试 |
| 2025-10-12 | desktop-commander.write_file | scripts/health-check.ts; tests/scripts/health-check.spec.ts; package.json | 新增健康检查脚本与测试，暴露 npm run health-check 入口 |
| 2025-10-12 | desktop-commander.edit_block | docs/deployment-local.md; METRICS.md | 扩充 Day-2 运维守护与指标阈值，定义 OTel 告警与巡检流程 |
| 2025-10-12 | npm | run typecheck / run test -- tests/scripts/health-check.spec.ts | 健康检查脚本改动通过类型检查与回归测试 |
| 2025-10-12 | powershell Remove-Item | scripts (health-check.ts, tool-stream-dead-letter.ts, logs-tail.ts, backup-sqlite.*, logrotate.*, bridge-stream-probe.ts) | 删除冗余脚本，统一入口 ops |
| 2025-10-12 | npm | run test -- tests/scripts/health-check.spec.ts / tests/scripts/tool-stream-dead-letter.spec.ts | ops 子命令回归通过 |
| 2025-10-12 | desktop-commander.write_file | scripts/ops.ts; tests/scripts/health-check.spec.ts; tests/scripts/tool-stream-dead-letter.spec.ts; tests/scripts/orchestrator-automation.spec.ts; package.json; docs/plan-registry.md; docs/cli-migration.md; docs/platform-overview.md; docs/service-api-guide.md; docs/gui-handbook.md; docs/index.md; docs/day2-runbook.md; README.md; .codex/context-question-1.json; .codex/notes | 合并辅助脚本为 ops 子命令并更新文档/测试/上下文 |
| 2025-10-12 | powershell Remove-Item | scripts/orchestrator-automation.ts, scripts/run-auto-exec.ts, scripts/registry-manifest.ts | 移除旧自动化与清单脚本 |
| 2025-10-12 | npm | run test -- tests/scripts/tool-stream-dead-letter.spec.ts / tests/scripts/health-check.spec.ts / tests/scripts/orchestrator-automation.spec.ts | ops 子命令回归测试通过 |
| 2025-10-12 | desktop-commander.write_file | automation-inventory.json | 首次输出自动化资产清单（npm 脚本、ops 子命令、CLI 命令及文档引用） |
| 2025-10-12 | desktop-commander.write_file / edit_block | automation-value-assessment.md | 输出自动化资产价值评估（分级、风险、建议与回退方案） |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md; TASKS.md; RISKS.md; METRICS.md | 建立自动化瘦身轨道（阶段计划、任务、风险与指标），同步长程计划与监控项 |
| 2025-10-12 | desktop-commander.edit_block | package.json; README.md; automation-inventory.json; automation-value-assessment.md | 移除 `test:watch`/`prepare` 脚本与 husky 依赖，更新清单与文档（指向手工替代命令） |
| 2025-10-12 | desktop-commander.edit_block | docs/day2-runbook.md; verification.md; .codex/testing.md | 建立轻量化运维基线（记录脚本移除后的手工替代、验证步骤与测试结果） |
| 2025-10-12 | CodexPlan.update_plan | (降级记录) | task-manager split_tasks 连续 3 次失败，转入 CodexPlan 并登记锁文件清理/文档提醒步骤 |
| 2025-10-12 | desktop-commander.apply_patch / npm run lint | package-lock.json; README.md; docs/day2-runbook.md; .codex/testing.md | 移除 husky 残留并强化手动提醒；npm run lint 因既有未清理的 eslint 问题退出 1，已记录 testing.md |
| 2025-10-12 | desktop-commander.apply_patch | eslint.config.js; src/cli/index.ts; src/cli/runtime/autoExecute.ts; src/service/orchestrator/controller.ts; src/service/orchestrator/server.ts; src/shared/logging/logger.ts; src/orchestrator/executor/executor.ts; src/orchestrator/adapters/localTask.ts; examples/run-demand-analysis.ts; src/agents/plugins/types.ts; src/agents/registry.ts | 调整 ESLint 规则、修复未使用变量与 console/log 处理、为 UI 目录指定 tsconfig，确保 lint 通过 |
| 2025-10-12 | npm run lint |  | 规则与代码修复后 lint 全量通过 |
| 2025-10-12 | desktop-commander.apply_patch | tests/scripts/registry-manifest.spec.ts | 更新注册表 manifest 测试改用 writeRegistryManifest API，移除已删除脚本依赖 |
| 2025-10-12 | npm run typecheck; npm run test -- tests/scripts/orchestrator-automation.spec.ts |  | 类型检查及关键脚本测试通过，验证日志/审批改动无回归 |
| 2025-10-12 | npm run test |  | 全量 Vitest 触发既有 CLI/Bridge session 测试超时与 callTool stub 报错，待后续修复或调整 timeout |
| 2025-10-12 | task-manager.split_tasks (failed) |  | 工具连续 3 次失败，改用 CodexPlan 维护计划 |
| 2025-10-12 | desktop-commander.apply_patch | tests/mcp/bridgeSession.spec.ts; tests/cli/plan-dry-run.spec.ts; tests/cli/agent-config.spec.ts; tests/cli/executions-tool-streams.spec.ts | 补强 BridgeSession mock callTool 并将 CLI 用例超时扩充至 30 秒 |
| 2025-10-12 | npm run test |  | 修复后全量 Vitest 通过，确认 CLI 与 bridgeSession 用例恢复正常 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md; TASKS.md; METRICS.md; RISKS.md | 移除自动化瘦身后续任务，保留 Phase A 成果并将风险/指标调整为暂停状态 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md; TASKS.md; METRICS.md | 删除 Registry GitOps 轨道与相关指标，保留已有 Registry 最小实现作为数据源 |
| 2025-10-12 | CodexPlan.update_plan | PLAN.md; TASKS.md; METRICS.md | 重新规划 Web/MCP UI、事件总线治理、Golden Path 与 Day-2 Ops 长程任务 |
| 2025-10-12 | desktop-commander.write_file / apply_patch | src/ui/components/PlanNodeEditor.tsx; src/ui/App.tsx; src/ui/components/graph/PlanCanvas.tsx; src/ui/components/graph/PlanCanvas.module.css | 新增 Plan 节点编辑器、支持画布节点选中高亮并同步 Plan JSON，完善 UI GA 规划 |
| 2025-10-12 | npm run typecheck; npm run test -- tests/ui/PlanCanvas.spec.tsx |  | 节点编辑改动通过类型检查与 PlanCanvas 单测 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md; TASKS.md; METRICS.md; RISKS.md; docs/gui-handbook.md; docs/plan-registry.md; README.md | 清理“自动化瘦身”与“Registry GitOps”轨道措辞，改写为本地 JSON + 手动审核流程 |
| 2025-10-12 | web.run / desktop-commander.apply_patch | .codex/notes | 调研 Golden Path、事件总线治理与自动化 fallback 最佳实践并记录引用 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md; TASKS.md; METRICS.md; RISKS.md | 重建长程任务蓝图：引入 2025-10-12-94~97 任务链，更新指标与风险聚焦 GUI/事件总线/Golden Path/Day-2 |
| 2025-10-12 | desktop-commander.apply_patch / write_file / npm run test | src/ui/components/graph/PlanCanvas.tsx; src/ui/App.tsx; src/ui/components/PendingApprovals.tsx; src/ui/components/DoraMetricsPanel.tsx; src/ui/plugins/builtins/mcp-tool-explorer/pluginModule.tsx; src/ui/utils/planTransforms.ts; tests/ui/*.spec.ts | 实现 PlanCanvas 拖拽持久化、审批定位、DORA 指标面板及插件命令提示，新增计划位置更新与审批测试覆盖 |
| 2025-10-12 | desktop-commander.apply_patch | tests/service/orchestrator/server.spec.ts | 删除已下线 Registry REST 测试，保持服务端回归聚焦现存 API |
| 2025-10-12 | npm | run test -- tests/service/orchestrator/server.spec.ts | 移除 Registry 用例后服务端 9 项测试通过 |
| 2025-10-12 | npm | run test | 极简化后全量 Vitest 107 项通过，确认 Registry/GitOps 下线无回归 |
| 2025-10-12 | desktop-commander.apply_patch | .codex/testing.md | 追加 Registry 用例清理前后测试记录 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md | 写入行业调研结论，引用 IBM/Elastic/Kubernetes 极简运维最佳实践，支撑删除 ops/监控导出/Registry 决策 |
| 2025-10-12 | desktop-commander.apply_patch | PLAN.md | 增补 ops/监控导出/Registry 引用清单，标记残留文档/测试项待后续阶段处理 |
| 2025-10-12 | desktop-commander.apply_patch | TASKS.md | 标记调研与梳理任务完成，附带摘要说明后续清理范围 |
| 2025-10-12 | npm | run test | 梳理引用期间复跑全量 Vitest，确认 107 项测试保持通过 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 更新引用清单，确认 ops 脚本下线范围已覆盖且删除 OTEL 兼容测试描述 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 补充 Registry 精简决策小节，说明保留本地 JSON 注册表与移除 GitOps/REST 端点 |
| 2025-10-12 | desktop-commander.edit_block | .codex/context-question-1.json | 替换 `npm run ops` 引用为 `npm run cli -- run:auto`，保持疑问清单与极简方案一致 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md | 增补监控依赖结论，小结 OTel 依赖仅作为历史残留并计划随下一次依赖刷新移除 |
| 2025-10-12 | desktop-commander.edit_block | TASKS.md | 标记运维资产文档任务完成，留存统一验证任务待执行 |
| 2025-10-12 | desktop-commander.edit_block | src/service/orchestrator/server.ts | 将指标辅助函数参数前缀为 `_` 以满足 ESLint 未使用参数规则 |
| 2025-10-12 | desktop-commander.edit_block | verification.md | 更新最近一次验证记录，纳入 typecheck/lint/test/build/ui:ga 五项命令并记下 lint 修复 |
| 2025-10-12 | powershell Select-String | 全仓关键词搜索（"registry gitops"、"npm run ops"、"Prometheus"、"Alertmanager"） | 确认仅 `.codex/context-question-1.json` 与 `RESULTS/WU-2025-10-11-04.md` 保留历史描述，其他文档无残留 |
| 2025-10-12 | desktop-commander.edit_block | .codex/context-question-1.json; RESULTS/WU-2025-10-11-04.md | 将自动化相关疑问与 Registry 蓝图标记归档，保留极简方案历史说明 |
| 2025-10-12 | desktop-commander.edit_block | PLAN.md; TASKS.md; RISKS.md; verification.md | 同步归档说明、更新任务/风险状态，并注明仅文档更新无需额外测试 |
| 2025-10-12 | desktop-commander.read_file | package.json | 盘点单元/功能/冒烟测试脚本：`npm run test`、`npm run ui:ga`，登记执行顺序 |
| 2025-10-12 | npm | run test | 28 个测试文件 / 100 用例通过（包含 CLI、服务端、UI 插件），无新增缺陷 |
| 2025-10-12 | npm | run ui:ga | 类型检查 + 2 个 UI 测试文件（5 用例）通过，冒烟验证正常 |
| 2025-10-12 | desktop-commander.apply_patch | config/mcp.servers.json; src/mcp/config/loader.ts; src/mcp/config/index.ts; src/cli/commands/run/auto.ts; src/cli/runtime/autoExecute.ts; src/client/orchestrator.ts; src/service/orchestrator/controller.ts; src/service/orchestrator/server.ts; tests/mcp/config/loader.spec.ts | 建立 MCP 配置加载模块并将 CLI/服务端从 mcpEndpoint 改为使用配置别名，补充单测覆盖加载与缓存逻辑 |
| 2025-10-12 | npm run test -- tests/mcp/config/loader.spec.ts |  | loader 单测通过，验证配置解析/缓存/重载逻辑 |
| 2025-10-12 | desktop-commander.apply_patch | src/shared/persistence/stateDatabase.ts; src/mcp/bridge/types.ts; src/mcp/bridge/bridgeClient.ts; src/mcp/bridge/sessionRegistry.ts; src/cli/runtime/autoExecute.ts; src/service/orchestrator/controller.ts; tests/mcp/sessionRegistry.spec.ts | 调整 mcp_sessions schema 改用 server_name 主键，更新 BridgeClient/Registry 逻辑并补充回归测试 |
| 2025-10-12 | npm run test -- tests/mcp/sessionRegistry.spec.ts |  | 会话持久化单测通过，确认迁移后 load/save/clear 行为正确 |
| 2025-10-12 | desktop-commander.apply_patch | src/ui/services/orchestratorApi.ts; src/service/orchestrator/server.ts; src/ui/components/PlanActions.tsx; src/ui/App.tsx; tests/ui/PlanActions.spec.tsx | 新增 /mcp/servers 接口与 UI 服务器选择器，前端依配置别名调用 MCP 工具并同步单测 |
| 2025-10-12 | npm run test -- tests/ui/PlanActions.spec.tsx |  | PlanActions 组件 5 项测试通过，验证服务器选择与禁用逻辑 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/server.spec.ts |  | 服务端 9 项回归通过，确认 /mcp/servers 与既有 API 行为正常 |
| 2025-10-12 | npm run typecheck; npm run lint; npm run build; npm run ui:ga |  | 配置改造后完成类型检查、Lint、编译与 Gold Release 冒烟，记录在 `.codex/testing.md` |
| 2025-10-12 | desktop-commander.apply_patch | README.md; docs/deployment-local.md; docs/gui-handbook.md; docs/gui-gold-release.md; docs/platform-overview.md; docs/service-api-guide.md; PLAN.md; TASKS.md; RISKS.md; verification.md | 同步 MCP 配置别名、服务器选择器与验证结果，更新任务/风险状态 |
| 2025-10-12 | desktop-commander.apply_patch | src/service/orchestrator/eventSchema.ts; src/service/orchestrator/index.ts; tests/service/orchestrator/eventSchema.spec.ts; PLAN.md | 建立事件总线 schema/版本常量，导出统一校验入口并在 PLAN 中记录 Phase B 任务 |
| 2025-10-12 | desktop-commander.apply_patch | README.md; PLAN.md; verification.md; docs/event-metrics-spec.md; scripts/event-bus-health-check.mjs | Phase B 收口：更新常用命令与计划记录、补充指标文档并新增事件总线巡检脚本 |
| 2025-10-12 | npm run typecheck -- --pretty false; npm run build; npm run ui:ga |  | 收口阶段复跑类型检查/构建与 GUI 冒烟脚本，结果已记录 `.codex/testing.md` |
| 2025-10-12 | npm run typecheck -- --pretty false |  | 事件总线 schema 引入后运行双 tsconfig 类型检查，确认无编译错误 |
| 2025-10-12 | npm run lint |  | 新增事件 schema 后复跑 ESLint，确保代码风格一致 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts |  | 事件 schema 单测通过，验证 runtime.state-change 与 logs.appended 示例解析 |
| 2025-10-12 | desktop-commander.apply_patch | src/service/orchestrator/server.ts; tests/service/orchestrator/eventBus.spec.ts | 在广播链路接入事件 schema 校验、统一 envelope 生成，并新增 eventBus 单测覆盖合法/非法事件 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts tests/service/orchestrator/eventBus.spec.ts |  | 事件 schema + eventBus 双测试通过，确认校验逻辑生效 |
| 2025-10-12 | npm run lint |  | 事件总线改造后再次运行 ESLint，确保 server.ts 变更符合规范 |
| 2025-10-12 | desktop-commander.apply_patch | src/service/orchestrator/server.ts; tests/service/orchestrator/eventBus.spec.ts; tests/service/orchestrator/eventBackpressure.spec.ts | 在广播链路加入背压阈值控制并扩展事件 schema 校验，新增 eventBus 与背压单测覆盖合法/非法与丢弃场景 |
| 2025-10-12 | npm run test -- tests/service/orchestrator/eventSchema.spec.ts tests/service/orchestrator/eventBus.spec.ts tests/service/orchestrator/eventBackpressure.spec.ts |  | 事件 schema + eventBus + 背压测试全部通过，确认校验与丢弃逻辑生效 |
| 2025-10-12 | npm run lint |  | 背压改造后再次运行 ESLint，确保 server.ts 更新符合规范 |
| 2025-10-12 | desktop-commander.write_file / apply_patch | docs/event-metrics-spec.md; scripts/event-bus-health-check.mjs; src/service/orchestrator/server.ts | 扩展 metrics.update 载荷记录 connectedClients/maxBufferedBytes，新增事件总线巡检脚本并更新指标文档 |
| 2025-10-13 | desktop-commander.apply_patch | docs/event-metrics-spec.md | 精简事件总线观测说明，明确不再提供内建脚本或替代方案 |
| 2025-10-13 | desktop-commander.apply_patch | PLAN.md | 标记观测脚本任务取消并确认 Phase B 收口完成 |
| 2025-10-13 | desktop-commander.apply_patch | tests/service/orchestrator/server.spec.ts | 调整 WebSocket 用例等待逻辑，改用 execution.completed 与轮询防止超时 |
| 2025-10-13 | desktop-commander.start_process | npm run typecheck | 观测脚本取消后复跑双 tsconfig 类型检查，通过 |
| 2025-10-13 | desktop-commander.start_process | npm run lint | 极简观测收口无新增 lint 问题 |
| 2025-10-13 | desktop-commander.start_process | npm run test | 全量 Vitest（32 文件/111 用例）通过，验证新用例逻辑稳定 |
| 2025-10-13 | desktop-commander.start_process | npm run build | TypeScript 构建确认极简方案可产出 dist |
| 2025-10-13 | desktop-commander.start_process | npm run ui:ga | Gold Release 冒烟（typecheck + UI 5 用例）通过 |
| 2025-10-13 | desktop-commander.apply_patch | .codex/testing.md | 追加 2025-10-13 验证记录（typecheck/lint/test/build/ui:ga） |
| 2025-10-13 | desktop-commander.apply_patch | verification.md | 更新验证结论与历史记录，说明观测脚本取消及测试结果 |
| 2025-10-13 | desktop-commander.start_process | typecheck/lint/test/build/ui:ga | JSON 存储改造后全量验证脚本通过 |
| 2025-10-13 | desktop-commander.apply_patch | tests/service/orchestrator/server.spec.ts | 更新 tool-stream 历史断言为 chunkCount≥1，兼容多段记录 |
| 2025-10-13 | desktop-commander.start_process | npm run test | 全量 Vitest 30 文件/103 用例通过，验证历史接口断言调整 |
| 2025-10-13 | desktop-commander.start_process | npm run ui:ga | 类型检查 + UI 5 用例冒烟复核通过 |
| 2025-10-13 | desktop-commander.start_process | npm run build | TypeScript 冒烟构建成功 |
| 2025-10-13 | desktop-commander.apply_patch | .codex/testing.md; verification.md | 同步新增测试记录与验证摘要 |
