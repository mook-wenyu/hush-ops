# Hush-Ops

> 面向混合任务编排的可视化调度平台 · 统筹脚本、智能体与 MCP 工具执行

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![License](https://img.shields.io/badge/license-Apache--2.0-orange.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)

</div>

---

## 📖 目录

- [项目简介](#-项目简介)
- [核心特性](#-核心特性)
- [演示预览](#-演示预览)
- [技术栈](#️-技术栈)
- [系统要求](#-系统要求)
- [快速开始](#-快速开始)
- [部署指南](#-部署指南)
- [使用指南](#-使用指南)
- [开发指南](#-开发指南)
- [贡献指南](#-贡献指南)
- [架构说明](#️-架构说明)
- [故障排查](#-故障排查)
- [许可证](#-许可证)
- [支持与反馈](#-支持与反馈)

---

## 🎯 项目简介

**Hush-Ops** 是一款面向混合任务编排的可视化调度平台,帮助团队在同一界面下统筹普通脚本、AI 智能体流程与 MCP 工具执行。

系统提供 **审批闭环**、**执行状态追踪** 与 **工具流审计** 能力,便于业务团队以图形方式监管自动化任务。无论是定时任务、手动触发还是智能体驱动的复杂流程,Hush-Ops 都能提供统一的编排、调度与可观测性支持。

**适用场景**:

- DevOps 自动化任务编排
- AI Agent 工作流可视化管理
- 多工具集成的混合任务调度
- 需要审批闭环的业务流程自动化

---

## ✨ 核心特性

### 🖥️ 可视化调度台

网页端实时展示计划节点、执行进度、审批待办与桥接状态,提供直观的任务监控界面。

### 📅 灵活的计划调度

- **Cron 调度**: 支持标准 cron 表达式定时执行
- **手动重载**: `POST /api/v1/schedules/reload` 即时更新调度配置
- **目录热监听**: 设置 `ORCHESTRATOR_SCHEDULE_WATCH=1` 自动检测计划变更

### 🚦 智能并发门控

通过 `schedule.concurrency: 'forbid'` 自动复用同一计划运行中实例,避免并发风暴和资源竞争。

### 🔍 完整的工具流审计

- 提供工具流摘要/明细/重放接口
- 前端"执行详情"支持查看、仅错误视图与复制 JSON
- "Tool Streams"页面汇总全局工具流(支持仅错误与分页)
- 支持导出 JSON/NDJSON 格式

### 🔀 多通道任务支持

同一计划可同时调度手动任务、AI 智能体与 MCP 工具,默认提供模拟桥接便于无外部服务时体验。

### ✅ 审批与审计闭环

高风险节点触发审批队列,结果写入 JSON 存档与统一日志 `.hush-ops/logs/app.jsonl`,确保操作可追溯。

### 💾 JSON 持久化存储

检查点、工具流与审批历史默认保存在用户目录 `.hush-ops/state/`,支持跨版本迁移与备份。

### 🎨 可视化编辑器

- Dashboard 内置拖拽式计划编辑器
- 支持一键布局(ELK 算法)
- 连线成环检测与自动 dry-run
- 实时编译诊断与错误高亮

### 🔌 灵活扩展能力

通过 `.hush-ops/config/mcp.servers.json` 管理 MCP 服务器配置,CLI 保留作为灾备与批处理入口。

---

## 🖼️ 演示预览

> 💡 **快速预览**: 启动 `npm run dev` 后访问 `http://127.0.0.1:5173`
>
> **主要界面**:
>
> - **Dashboard**: 执行列表、实时状态、审批待办
> - **可视化编辑器**: 拖拽建模、自动布局、连线检测
> - **执行详情**: 节点状态、工具流审计、错误诊断
> - **工具流页面**: 全局工具调用历史、错误过滤、导出功能

> 📸 欢迎贡献截图到 `docs/images/` 目录

---

## 🛠️ 技术栈

### 前端技术

- **框架**: React 18.x + TypeScript 5.5
- **构建**: Vite 5.4
- **样式**: Tailwind CSS 4.1 + DaisyUI 5.2
- **路由**: TanStack Router 1.58
- **可视化**: ReactFlow 11.11 + ELK.js 0.8
- **虚拟化**: TanStack Virtual 3.13

### 后端技术

- **服务**: Fastify 4.28 + WebSocket
- **调度**: Croner 9.1 (Cron)
- **AI**: OpenAI Agents 0.1 + LangGraph 0.4
- **MCP**: Model Context Protocol SDK 1.20
- **日志**: Pino 10.0
- **文件监听**: Chokidar 4.0

### 数据与状态

- **持久化**: JSON 文件存储
- **验证**: Zod 3.25
- **并发控制**: p-limit 7.1

### 开发工具

- **测试**: Vitest 2.0 + Testing Library 16.3
- **代码质量**: ESLint 9 + Prettier 3 + TypeScript-ESLint 8
- **Git**: Husky 9 + Commitlint 19 + Lint-staged 15

---

## 📋 系统要求

- **Node.js**: 20 或以上版本
- **npm**: 10+ (建议使用 `npm@10`)
- **OpenAI API Key**: 有效的 `OPENAI_API_KEY` (用于 AI Agent 功能)
- **可选**: 自建或第三方 MCP 服务器,按需配置 `.hush-ops/config/mcp.servers.json`

**无需浏览器驱动** - 已移除 Playwright 依赖,手动检查可运行 `npm run ui:preview` 访问首页 `/`。

---

## 🚀 快速开始

### 1. 安装依赖

```powershell
npm install
```

### 2. 配置环境变量

PowerShell 示例:

```powershell
$Env:OPENAI_API_KEY = "sk-..."
# 可选: 无外部 MCP 时启用内置模拟
$Env:MCP_BRIDGE_MOCK = "1"
```

### 3. 启动开发环境

```powershell
npm run dev
```

该命令会并行启动:

- **Orchestrator Service**: `http://127.0.0.1:3000/api/v1`
- **Vite 前端**: `http://127.0.0.1:5173`

访问 `http://127.0.0.1:5173` 即可查看执行列表、桥接状态和审批队列。

### 4. 导入示例计划

首次运行若 `plans/` 目录为空,系统会自动创建空计划文件。你可以点击"导入示例"一键导入内置示例计划(来自 `plans/examples/`)。

---

## 📦 部署指南

### 1. 构建产物

```bash
# 编译 Node 服务与 CLI
npm run build

# 生成前端静态文件(输出至 dist/ui)
npm run ui:build

# 或一次性构建全部
npm run build:all
```

### 2. 启动服务端

```bash
npm run service:prod
```

**环境变量配置**:

- `ORCHESTRATOR_PORT`: 服务端口(默认 3000)
- `ORCHESTRATOR_HOST`: 监听地址(默认 127.0.0.1)
- `ORCHESTRATOR_BASE_PATH`: API 基础路径(默认 `/api/v1`)
- `MCP_BRIDGE_MOCK=1`: 启用模拟桥接(无外部 MCP 时)

### 3. 部署前端

将 `dist/ui` 目录交由静态资源服务器(Nginx、Vercel 等)托管,并配置反向代理使 `/api/v1` 指向服务端地址。

**Nginx 配置示例**:

```nginx
location /api/v1 {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}
```

### 4. 持久化与备份

确保以下目录位于可持久化卷中:

- `.hush-ops/state/`: 检查点、工具流、审批历史
- `.hush-ops/logs/`: 日志文件(JSONL 格式)

定期备份 JSON 文件即可恢复执行历史。

---

## 📚 使用指南

### 计划管理

**创建计划**: 在 Dashboard 点击"添加计划"或使用编辑器拖拽建模。

**执行计划**:

```bash
# CLI 方式
npm run cli -- run:auto --plan <file>

# API 方式
POST /api/v1/plans/:id/execute
```

**调度配置**:

```json
{
  "schedule": {
    "cron": "0 0 * * *",
    "concurrency": "forbid"
  }
}
```

### 审批流程

需要审批的节点会自动进入审批队列:

```bash
# 查看待审批事项
npm run approvals -- pending

# 批准
npm run approvals -- approve <approval-id>

# 拒绝
npm run approvals -- reject <approval-id>
```

或在 Dashboard 的"审批队列"页面进行操作。

### MCP 服务器配置

编辑 `.hush-ops/config/mcp.servers.json`:

```json
{
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "API_KEY": "..."
      }
    }
  }
}
```

---

## 🔧 开发指南

### 本地开发

```bash
# 同时启动服务与 UI
npm run dev

# 仅启动服务
npm run service:start

# 仅启动 UI
npm run ui:dev
```

### 代码质量检查

```bash
# Lint + 类型检查
npm run check

# 仅 Lint
npm run lint

# 仅类型检查
npm run typecheck

# 格式化
npm run format
```

### 测试

```bash
# 运行所有测试
npm test

# UI 测试(jsdom)
npm run ui:ga

# 快速验证(类型 + 契约 + UI)
npm run verify:fast

# 完整验证(包含 smoke 测试)
npm run verify
```

### 构建

```bash
# 构建后端
npm run build

# 构建前端
npm run ui:build

# 构建全部
npm run build:all
```

### 环境变量

**开发环境**:

- `ORCHESTRATOR_DEV=1`: 启用开发模式
- `ORCHESTRATOR_FORCE=1`: 强制模式(跳过检查)
- `ORCHESTRATOR_SCHEDULE_WATCH=1`: 启用计划目录热监听

**实验功能**:

- `AGENTS_ENABLED=1`: 启用 Agent 对话路由
- `CHATKIT_ENABLED=1`: 启用 ChatKit 接口
- `VITE_CHATKIT_ENABLED=1`: 前端显示 ChatKit 页面

---

## 🤝 贡献指南

### Before Merge 本地自检

> 精简基线:只保留 3 步(typecheck → build → smoke)

1. **一键烟囱**: `npm run smoke`
   - 类型检查 + 后端构建 + 前端构建 + 预览健康检查
   - 不再依赖 Playwright

2. **可选性能测试**: `npm run ui:perf`

3. **完成 PR Checklist**: 逐条完成 `.codex/pr-checklist.md`,将截图/摘要写入 `.codex/testing.md`

### 提交规范

遵循 Conventional Commits:

```
feat(scope): 添加新功能
fix(scope): 修复问题
docs(scope): 文档更新
test(scope): 测试相关
refactor(scope): 重构代码
```

### PR 要求

- 通过 `npm run check` (lint + typecheck)
- 通过 `npm run test` (后端测试)
- 通过 `npm run ui:ga` (UI 测试,涉及 UI 变更时)
- 包含必要的测试用例
- 更新相关文档

### 代码规范

- TypeScript 严格模式
- Prettier 格式化(2 空格,分号,双引号)
- 文件命名: `kebab-case.ts`,React 组件 `PascalCase.tsx`
- 倡导命名导出,避免未用变量

---

## 🏗️ 架构说明

### 项目结构

```
hush-ops/
├── src/
│   ├── agents/           # AI Agent 相关
│   ├── cli/              # CLI 命令
│   ├── service/          # 编排服务
│   │   └── orchestrator/ # 核心编排逻辑
│   ├── mcp/              # MCP 桥接
│   ├── shared/           # 共享工具
│   └── ui/               # React 前端
│       ├── components/   # UI 组件
│       ├── services/     # API 服务层
│       └── styles/       # 样式文件
├── tests/                # 测试文件
├── plans/                # 计划定义
├── .hush-ops/            # 运行时数据
│   ├── config/           # 配置文件
│   ├── state/            # 持久化状态
│   └── logs/             # 日志文件
└── dist/                 # 构建产物
```

### 数据流

1. **计划定义** → JSON 文件(plans/ 或 .hush-ops/config/plans/)
2. **调度触发** → Orchestrator Service
3. **执行引擎** → 节点处理 + 工具调用
4. **状态同步** → JSON 持久化 + WebSocket 推送
5. **前端展示** → Dashboard 实时更新

### API 文档

访问 `GET /api/v1/openapi.json` 获取完整 OpenAPI 规范(包含 paths 与示例 schemas)。

---

## 🔧 故障排查

### 端口占用

修改 `ORCHESTRATOR_PORT` 或 `VITE_*` 代理端口,或释放 `3000/5173` 端口后重试。

### 依赖安装失败

确认 Node≥20 / npm@10,删除 `node_modules` 和 `package-lock.json` 后执行:

```bash
npm ci
```

### 接口代理错误

检查 `vite.config.ts` 中代理地址是否与服务端 `127.0.0.1:3000` 一致。

### JSON 存储损坏

如果 `.hush-ops/state/` 下的 JSON 文件损坏:

1. 备份原文件
2. 删除或重命名损坏文件
3. 重启 Hush-Ops 自动生成空白文档

### 回滚方案

若近期改动导致异常:

1. 恢复至上一个通过 `npm run verify` 的提交
2. 还原 `plans/` 与 `.hush-ops/state/` 的最近快照

### 日志分析

查看 `.hush-ops/logs/app.jsonl` (JSONL 格式):

```powershell
# PowerShell
Get-Content .hush-ops/logs/app.jsonl | Select-String "error"

# Bash/zsh
grep "error" .hush-ops/logs/app.jsonl
```

---

## 📝 许可证

本项目采用 **Apache License 2.0** 开源协议。

详见 [LICENSE](LICENSE) 文件。

---

## 💬 支持与反馈

### 文档

- 验证与测试记录: `verification.md`, `.codex/testing.md`
- 架构与运维规划: `PLAN.md`, `TASKS.md`, `RISKS.md`
- UI/UX 设计规范: `src/ui/styles/DESIGN_GUIDE.md`
- 开发者指南: `AGENTS.md`

### 社区

- **Issues**: [GitHub Issues](https://github.com/mook-wenyu/hush-ops/issues)
- **讨论**: [GitHub Discussions](https://github.com/mook-wenyu/hush-ops/discussions)
- **源码**: [GitHub Repository](https://github.com/mook-wenyu/hush-ops)

### 常用脚本速查

| 命令                   | 说明                             |
| ---------------------- | -------------------------------- |
| `npm run dev`          | 启动开发环境(服务 + UI)          |
| `npm run check`        | Lint + 类型检查                  |
| `npm run verify`       | 完整验证(check + test + smoke)   |
| `npm run verify:fast`  | 快速验证(类型 + 契约 + UI jsdom) |
| `npm run build:all`    | 构建后端 + 前端                  |
| `npm run ui:preview`   | 预览构建后的 UI                  |
| `npm run service:prod` | 生产模式启动服务                 |

---

## 🙏 致谢

感谢所有贡献者和开源社区的支持!

**主要依赖**:

- [Fastify](https://fastify.dev/) - 高性能 Node.js 框架
- [React](https://react.dev/) - 用户界面库
- [ReactFlow](https://reactflow.dev/) - 可视化流程图
- [LangGraph](https://github.com/langchain-ai/langgraphjs) - AI Agent 编排
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP 协议

---

<div align="center">

**[⬆️ 返回顶部](#hush-ops)**

Made with ❤️ by Hush-Ops Team

</div>
