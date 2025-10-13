# 自动化资产价值评估（精简版）

运维自动化脚本已全部移除，当前仅保留支持业务编排的核心命令。

| 资产 | 类型 | 价值说明 | 删除风险 | 建议 |
| --- | --- | --- | --- | --- |
| npm run dev | npm 脚本 | 快速加载示例，辅助演示 | 仅影响体验，可按需删除 | 中期可迁至独立示例仓库 |
| npm run build | npm 脚本 | 输出可部署 ESM | 构建产物缺失 | 必须保留 |
| npm run lint / format | npm 脚本 | 保持代码规范 | 质量门禁失效 | 保留 |
| npm run test / typecheck | npm 脚本 | 验证核心流程 | 无法验证主流程 | 保留 |
| npm run agents:config | npm 脚本 | 管理插件配置 | 需手动操作 JSON | 短期保留，等待 GUI 支持 |
| npm run approvals | npm 脚本 | 审批兜底 | 审批无法落地 | 保留，直至 GUI 取代 |
| npm run cli | npm 脚本 | 统一 CLI 入口 | 需直接执行 tsx | 保留（提示迁移 GUI） |
| npm run ui:dev / ui:build / ui:preview / ui:ga | npm 脚本 | GUI 开发、构建与回归 | GUI 无法迭代或验收 | 保留 |

其它 Day-2 运维命令、历史监控指标导出与 Registry GitOps 已下线，不再提供替代方案。
