# Repository Guidelines

## 项目结构
- `src/`：核心代码（`agents/`、`cli/`、`service/` 编排服务、`mcp/`、`shared/`、`ui/` 等）。
- `tests/`：单元/集成；UI 用 `tests/ui/`。
- 其余：`examples/` 示例、`plans/` 计划、`config/` 配置、`state/` 运行态、`dist/` 构建产物。

## 构建与运行
- `npm run dev` 同时启动服务与 UI（开发模式）。
- `npm run build` / `npm run ui:build` / `npm run build:all` 构建后端/UI/全部。
- `npm run typecheck` 严格 TS 检查；`npm run lint`/`npm run check` 规范与合规。
- `npm run verify:fast` 本地快速校验（类型 + 契约 + UI jsdom）。
- `npm test` 后端测试；`npm run ui:ga` 运行 jsdom 下的 UI 测试。
- `npm run ui:preview` 预览 UI；`npm run service:start` 启动服务。

## 编码规范
- TypeScript（ES2022/NodeNext）；Prettier 3 + ESLint，2 空格、必须分号、默认双引号。
- 文件命名：`kebab-case.ts`；React 组件 `PascalCase.tsx`（置于 `src/ui/`）。
- 倡导命名导出；避免未用变量（必要时前缀 `_`）。

## 测试
- 框架：Vitest。默认环境 `node`；UI 测试通过 `npm run ui:ga` 使用 `jsdom`。
- 约定：`tests/<area>/**/*.spec.ts(x)`；网络与时间请打桩，确保可重复。

## 提交与 PR
- 使用 Conventional Commits：`feat|fix|docs|test|refactor(scope): message`。
- PR 需包含：变更目的、关联 issue、测试命令与（如有）UI 截图。
- 合并前必须通过：`npm run check && npm test && npm run ui:ga`（涉及 UI 变更时再构建 UI）。

## 安全与配置
- 禁止提交密钥；使用环境变量（检查 `config/mcp.servers.json` 与 `VITE_*`）。
- 运行环境：Node >= 20，建议 `npm@10`（已在 `package.json#packageManager` 固定）。
- 前端一切文件操作必须走后端封装的 FS API，禁止直接访问本地文件系统。

## 计划、调度与编辑器
- 计划存放于 `plans/` 或 `.hush-ops/config/plans/`；可在计划顶层声明 `schedule`（`cron` 等）。
- 并发：`ORCHESTRATOR_MAX_CONCURRENCY` 控制全局并发；同一计划可设置 `concurrency: "allow|forbid"`。
- 触发执行：`POST /api/v1/plans/:id/execute`；OpenAPI：`GET /api/v1/openapi.json`。
- 编辑器：Dashboard 内置“编辑器｜监控”分段切换；在“编辑器”中可拖拽建模与一键布局（ELK），自动 dry‑run 默认开启（设置中心可调整/关闭）。
- 错误高亮：编辑时自动触发 `/api/v1/designer/compile` 显示节点级错误/告警徽标（不写盘，仅可视）。
- 保存前校验：保存前先执行 `/api/v1/designer/compile` 与 `/api/v1/plans/dry-run`，存在 error 级诊断或 dry‑run 失败时将阻断保存（错误信息含节点 ID 便于定位）。

## 前端架构与 UI/UX 指南（React 18+/Vite）

### 范围与目标
- 面向 hush-ops 的内部/本地可视化调度平台，服务“计划建模、干跑/执行、审批、工具流审计”。
- 约束：中文文档、标准 Markdown；禁止外链；不引入通用新库（优先复用现有实现）。
- 版本基线：React ≥ 18.x、Vite、TypeScript 5、Vitest + Testing Library（jsdom）。
- 不采用 Next.js/RSC/Server Actions；如需引入，需先提交迁移评估与回归计划。

### 技术栈基线与文件边界
- 数据访问：统一经 `src/ui/services` 公共门面（分域 services 聚合）；禁止在组件内直接 `fetch` 未封装端点。
- 文件系统：前端一切文件操作必须走后端 FS API，禁止直接访问本地文件系统（与 README 一致）。
- 计划模型：UI/画布优先使用 Plan v3 的 `edges[]`；缺失时再由 `children[]` 推断。
- 运行态：插件订阅等状态使用 `useSyncExternalStore` 适配器，避免循环更新与不必要渲染。

### 组件架构与状态管理
- 局部状态优先：`useState/useReducer`；跨组件共享用 `Context + 自定义 hooks`，保持边界清晰。
- 服务器状态：通过 `src/ui/services` 公共门面统一请求与错误映射；避免在组件层写重复“取数+解析”逻辑。
- 可选：如评估确有必要引入 TanStack Query，仅用于“服务器状态”（缓存/失效/重试）；需任务评审与回归计划。
- 谨慎 memo：`React.memo/useMemo/useCallback` 仅在明确消除不必要渲染或稳定引用时使用；先量化、后加锁。

### 并发渲染与交互性能（React 18）
- 过渡更新：列表筛选、布局重算、视图切换等非紧急更新使用 `useTransition` 包裹；以 `isPending` 呈现轻量等待态。
- 输入与计算解耦：文本搜索/过滤使用 `useDeferredValue` 隔离高开销渲染，保持输入流畅。
- 异步块隔离：对按需加载或远端数据块设置 Suspense 边界与最小化 fallback，避免整页闪烁。
- 避免误用：不要将受控输入的 `setState` 放入 Transition；不要用 Effect 轮询可被订阅替代的状态。

### 画布与大列表性能
- 仅渲染可见：画布启用“只渲染视窗内元素”（与现实现一致）；长列表采用虚拟化或窗口化渲染，控制 `overscan`。
- 布局异步化：ELK 自动布局置于非阻塞路径，渲染前显示“布局中”提示；批量回写位置，减少多次提交。
- 稳定标识：节点/边 `key`/`id` 稳定；避免因可变引用导致全量重渲染。
- 大图阈值：≥200 节点启用降采样与去抖；≥1000 节点保底降级（隐藏次要装饰、降低动画频率）。

### 可访问性（WCAG 2.2 侧重）
- 键盘全路径：所有操作可用 Tab/Shift+Tab/Enter/Esc；无键盘陷阱。
- 焦点可见且不被遮挡：遵循“焦点不被遮挡(AA)”与“增强(AAA)”意图；必要时滚动 `scrollIntoView({ block: "center" })`。
- 目标尺寸：交互目标最小 24×24 CSS px，或提供足够间距。
- 拖拽替代：拖拽操作提供单指/无拖拽替代（如按钮移动、菜单操作）。
- Live Region：执行日志/编译诊断区使用 `aria-live="polite"` 或 `role="log"`；错误消息使用显式状态与可聚焦容器。
- 对比度与主题：遵循 AA 对比度；暗色/浅色与系统跟随一致；尊重 `prefers-reduced-motion`。

### 错误、加载与空态
- 统一骨架：为主要区域提供“加载骨架/空态/错误态/重试”四件套；错误态保留技术细节“可展开”。
- 失败可恢复：编译/干跑/执行失败提供“重试”与“复制错误 JSON”；错误详情携带节点 id 与建议处理。
- 工具流“仅错误”：执行详情与汇总页默认可切换“仅错误”；导出支持 JSON/NDJSON。
- 乐观但可回滚：审批按钮与非破坏性操作可使用乐观 UI，但需具备失败回滚。

### 测试与质量（Vitest + Testing Library）
- 语义选择器：使用 `getByRole/getByLabelText` 等语义查询；避免脆弱选择器与大快照。
- 计时控制：对去抖/编译延迟统一使用 `vi.useFakeTimers()` 与 `vi.advanceTimersByTimeAsync(0)` 推进。
- 路由 mock：在 Dashboard 端到端型用例中统一 mock `/api/v1/designer/compile` 与 `/api/v1/plans/dry-run`；工具流相关端点按需补齐。
- 可重复：避免真实网络/时间依赖；必要时为“画布大图”用例设置 `PERF_*` 环境阈值。
- 失败可读：断言消息包含关键文本（节点/边 id、severity、correlation）。
- URL 同步与计时：涉及 `history.replaceState` 的 URL 同步副作用建议使用 `queueMicrotask` 触发；在 jsdom 中优先使用真实计时器并以 `waitFor` 断言，必要时 `cleanup()` 以避免多实例残留。
- 超时/中止用例：若客户端使用 `Promise.race(fetch, abort)` 实现中止，测试中可在 `const p = ...` 后临时附加 `p.catch(() => {})`，以避免 Node 将短期未处理的拒绝提示为未捕获（不影响后续 `await expect(p).rejects` 的断言）。

### 样式与设计系统
- 主题：沿用现有主题（Light/Dark/跟随系统），颜色/间距/阴影来源于 tokens；避免内联硬编码。
- 布局：优先 CSS Grid/Flex；必要时使用容器查询增强响应式；组件尺寸/间距保持 4px 基线。
- 动画：默认轻量过渡；复杂动效需可被 `prefers-reduced-motion` 关闭。
- 图标：沿用 `@tabler/icons-react`，与文案间距 `4–8px`；遵循当前 UI 的尺寸规范。

### 开发者体验与工程约束
- 类型优先：公共组件与 API 返回值必须具备完整 TS 类型；`any` 需注记理由与回收计划。
- 边界清晰：组件只关心视图；数据访问集中于 services；画布逻辑集中于 graph 组件与 hooks。
- 日志级别：用户可见错误 `console.warn`；开发调试 `console.debug`；禁止将敏感信息写入日志。
- 不新增通用库：如需引入（状态、样式、测试、可视化），必须提交收益/成本评估与迁移/回滚计划。

### 禁止与审查清单
- 禁止直接访问本地文件系统或绕过 services 层直连后端。
- 禁止在 UI 内实现/恢复认证、授权、加密、审计、防护逻辑（A2）。
- 禁止以快照测试覆盖交互核心逻辑；不接受“仅快照”的新增用例。
- 禁止无依据的“全局 Suspense 包裹”导致大面积阻塞渲染。
- 禁止将异步副作用与渲染耦合（在 render 中触发 IO）。

### 版本与迁移提示（Plan v3）
- UI/画布与编译图构建必须“edges 优先、children 回退”；保存/导出时保留边 `id` 以利比对与稳定布局。
- v1/v3 混合计划的读取以 loader 归一化为准；新增用例需覆盖“仅 edges/仅 children/二者皆无”三类场景。


### 服务层拆分与公共 API 原则（新增）
- 目标：降低历史 `orchestratorApi.ts` 体积与耦合，按领域收敛 API，保证“组件无感、调用清晰、错误一致”。
- 文件布局：
  - 基础内核：`src/ui/services/core/http.ts`（`getBaseUrl`/`requestJson<T>`/`HTTPError`/`TimeoutError`/`AbortRequestError`）。
  - 分域模块：`src/ui/services/tool-streams.ts`、`src/ui/services/executions.ts`（后续：plans、designer、approvals、mcp、fs、schedules）。
  - 公共门面：`src/ui/services/index.ts` 统一命名导出，禁止 `export *`，避免循环依赖与摇树退化。
- 约束：
  - 组件内禁止直接 `fetch`；一切网络访问经 services 层，错误统一抛出自定义错误（`HTTPError`/`TimeoutError`/`AbortError`）。
  - Query 构造规范：`requestJson` 的 `query` 仅接受“已定义值”；`undefined/null` 自动忽略，避免脏参数。
  - 超时/中止：默认不传超时；需要时由调用方传入 `timeoutMs` 或外部 `AbortSignal`；两者同时存在时优先判定“外部中止”。
  - 文档与类型：分域模块导出返回值必须具备完整 TS 类型；若临时 `any`，需在注释中写明收敛计划。
- 迁移步骤：
  1) 新增分域模块并在 `services/index.ts` 汇总导出；
  2) 兼容层已移除（页面与测试均应从 `src/ui/services` 导入）；
  3) 每迁出一批模块，运行 `npm run typecheck && npm run verify:fast` 确认无回归；
  4) 当全部迁出完成，删除兼容层（已归档为 `.deleted.orchestratorApi.ts.bak`，不再参与构建）并在门面中直连各分域模块。
- 示例（调用端）：
  ```ts
  import { fetchGlobalToolStreamSummaries, buildGlobalToolStreamExportUrl } from "src/ui/services";
  const { total, streams } = await fetchGlobalToolStreamSummaries({ onlyErrors: true, limit: 50, offset: 0 });
  const href = buildGlobalToolStreamExportUrl(streams[0].correlationId, { format: "ndjson", compress: false });
  ```
- 错误分流（调用端处理建议）：
  - 4xx/5xx：捕获 `HTTPError`，优先显示 `error.message`；可展开 JSON 细节。
  - 超时：提示“请求超时，请重试”；
  - 主动取消：静默或提示“已取消”。
- 验证要求：
  - 为 `core/http.ts` 与每个分域模块补最小用例（JSON/Text、4xx、超时、中止、导出 URL 构造等）；
  - Dashboard 端到端类用例统一 mock `/designer/compile` 与 `/plans/dry-run`，并以 fake timers 推进；
  - 打开“Tool Streams”页可筛选与导出 JSON/NDJSON；执行详情页“仅错误视图”与导出入口与汇总页行为一致。

### 实验 · Agent 对话与 Chat（功能向）
- 服务端开关：`AGENTS_ENABLED=1`（启用 `/api/v1/agents/session/*` 路由）、`CHATKIT_ENABLED=1`（启用 `/api/v1/agents/chatkit/*` 占位）。
- 记忆存储：JSONL 持久化，路径 `.hush-ops/state/conversations/<sessionKey>/thread.jsonl`；支持导出/导入与清空；不引入外部数据库。
- UI：导航出现 “Chat (实验)” 页面，调用 services/agents.ts 完成最小交互；后续可切换为 ChatKit 皮肤（Custom Backends，不暴露密钥）。
- 不做：任何认证/授权/加密/审查逻辑（遵循 A2）。
- 规范：所有网络访问经 services 层；Plan v3 图构建继续 edges 优先；变更保持最小侵入，不影响既有编排/调度/审计链路。
### ChatKit 与 Agents SDK 引入原则（实验）
- ChatKit 采用“自定义后端”模式：前端仅请求本地 `/api/v1/agents/chatkit/*`，不直连外部托管会话，不暴露密钥。
- Agents SDK（`@openai/agents`）按需动态加载：存在 `OPENAI_API_KEY` 时启用真实执行；缺失则回退回声；统一写入 MemoryStore(JSONL)。
- 工具调用事件映射到 ToolStream 审计（start/success/error），与执行详情/汇总页一致。
- 以上均受 `AGENTS_ENABLED`、`CHATKIT_ENABLED`、`VITE_CHATKIT_ENABLED` 控制；默认关闭，零影响。

#### 本地开发（实验开关）
- 服务端：`AGENTS_ENABLED=1`、`CHATKIT_ENABLED=1`（默认关闭）
- 前端：`VITE_CHATKIT_ENABLED=1` 显示 ChatKit 页面（/chatkit）
- 模型：`OPENAI_API_KEY` 存在时 runAgentAuto 使用 @openai/agents 真实执行；否则回退回声
- 数据：对话历史 JSONL 保存在 `.hush-ops/state/conversations/<sessionKey>/`，导出/导入均为 JSONL 文本
