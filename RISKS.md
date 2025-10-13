# 风险台账（精简版）

| 风险编号 | 描述 | 触发条件 | 影响 | 缓解策略 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R-001 | 运维脚本与指标移除后缺乏巡检手段 | 宿主环境未补充日志/监控方案 | 发现问题延迟、审批 SLA 失控 | 在部署手册中要求提供外部日志/监控；CLI 保留审批与执行兜底，记录人工操作 | open |
| R-002 | 计划粘贴操作易出错 | GUI/CLI 输入 Plan 时格式不正确 | 执行失败或产生脏数据 | 保留 dry-run 校验；在 GUI 展示校验警告与错误信息 | monitoring |
| R-003 | MCP 断线导致业务不可用 | MCP 服务不稳定 | UI/CLI 功能禁用 | 已实现指数退避与手动重连；继续监控日志并在运维手册提示 | monitoring |
| R-004 | 历史文档保留已废弃自动化信息 | 继续引用旧 Registry/ops 说明 | 新成员按旧流程执行导致混乱 | 2025-10-12 归档 context-question 与 RESULTS，定期审查 `.codex` 记录 | closed |
| R-005 | 未提供 MCP 服务器配置 | `config/mcp.servers.json` 为空或路径错误 | Web UI/CLI 无法执行 Plan，工具面板报错 | 快速开始文档新增配置步骤；UI/CLI 在未选择服务器时提示并禁用危险操作 | monitoring |

> 状态：open / monitoring / mitigated / closed。
