# Repository Guidelines

## 项目结构与模块组织
- 根目录按照 feature oriented 思路划分：`src/agents` 内含默认 AI 智能体示例 `demandAnalysisAgent.ts`（可替换为其他场景），负责 prompts、schema 与队列集成；`src/utils` 提供 `openaiClient.ts`、`openaiModeQueue.ts` 等基础设施；`examples/` 保存 `run-demand-analysis.ts`，可快速验证 custom client；`docs/` 汇总运行手册，`tests/agents` 与 `tests/utils` 镜像源码结构保存 Vitest 规格。
- 当需要扩展模块（例如新增工具或导出接口）时，请在 `src/shared` 或对应 feature 子目录内新增文件，并在本节更新实际路径，同时在 `docs/architecture.md` 记录 data flow，确保后续贡献者理解上下游依赖。
- 对于 onboarding 的新人，可参考 `samples/`（如需创建）存放原始需求文档示例，并在 README 或 docs 中链接到该目录，说明如何执行 `npm run dev -- ./samples/demo.md` 进行 quick start。

## 构建、测试与开发命令
- `npm run dev`：使用 `tsx watch` 持续执行 `examples/run-demand-analysis.ts`，适合调试 prompt 或上下文。
- `npm run build`：调用 `tsc -p tsconfig.json` 产出 ESM；`npm run typecheck` 执行 `tsc --noEmit`，在提交前确认类型安全。
- `npm run lint` 与 `npm run format` 分别使用 ESLint、Prettier 保持风格一致；`npm run test` 运行 Vitest，覆盖 agent 行为、API 模式队列以及并发错误恢复；必要时可使用 `npm run test -- --runInBand` 降低并发干扰。

## 编码风格与命名规范
- 使用 TypeScript + ESM + strict 模式；命名规则：kebab-case 文件、PascalCase 类型、camelCase 变量、SCREAMING_SNAKE_CASE 常量。
- 所有注释、文档、提交信息保持中文说明“意图 + 使用方式”；引用路径、命令、环境变量可保留英文形式。
- 禁止自研安全/认证逻辑；若需新增工具，请优先复用 `@openai/agents`、`zod` 或既有 util；默认模型 `gpt-5`，`reasoning.effort = high`，全局 API 模式默认 Chat Completions，通过 `useChatCompletions: false` 可回退 Responses。
- https://daisyui.com/llms.txt file is a compact, text version of daisyUI docs to help AI generate accurate daisyUI code based on your prompt.

## 自定义客户端与环境配置
- 统一使用 `configureDefaultOpenAIClient` 封装 OpenAI SDK：读取 `OPENAI_API_KEY`、可选 `OPENAI_BASE_URL`，并在自定义 endpoint 场景下自动调用 `setTracingDisabled(true)`，避免出现 tracing client error 401。
- 若团队需要保留官方 tracing，请额外设置 `OPENAI_TRACING_EXPORT_API_KEY`；提交 PR 时说明使用场景以及如何在 staging/prod 设置凭据。
- 在本地或 CI 运行示例前，请使用 `direnv`, `dotenv-cli` 或 shell profile 导出变量，示例：`export OPENAI_API_KEY=sk-...`、`export OPENAI_BASE_URL=https://internal-gateway/v1`。所有示例命令应在 PR 描述或 docs 中保持同步，确保新的贡献者可以复现。
- 如需连接多租户环境，可在脚本中扩展 `context` 对象传入 `projectName`、`stakeholders`、`targetWindow` 等元信息，帮助智能体产生针对性的分析。

## 测试指南
- 新增测试文件命名为 `*.spec.ts`，放置在 `tests/模块` 目录；使用 `vi.mock` 模拟 `@openai/agents`、`enqueueOpenAITask`，确保在无真实 Key 情况下也能运行。
- 必须覆盖：空文档报错、混合语言输出、API 模式切换、openaiModeQueue 并发任务、错误分支恢复；测试结束将命令与结果写入 `.codex/testing.md`，若失败需记录原因与修复计划。

## 提交与 Pull Request 指南
- 提交遵循 Conventional Commits，例如 `feat: add queue tests`、`fix: guard empty demand document`；每次提交需确保 `npm run lint`、`npm run typecheck`、`npm run test` 全部通过。
- PR 描述应包含变更摘要、运行的 npm 命令、影响范围、可选截图或 JSON 片段；若涉及环境变量或自定义网关，请同步更新 `.codex/requirements.md` 与相关 `docs/` 文档，并在 PR checklist 标注。
- 合并前请确认 `.codex/verification.md` 已刷新，operations-log 记录了关键工具调用，确保团队了解验证闭环。