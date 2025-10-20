# UI/UX 设计规范指南

**版本**: 3.0.0
**更新时间**: 2025-10-18
**适用范围**: Hush-Ops 混合编排可视化调度平台前端

---

## 1. 设计系统概述

本设计规范采用**苹果式极简主义**设计理念，基于 **Tailwind CSS 4.1.14** 和 **DaisyUI 5.2.1** 主题系统。所有组件设计遵循清晰、和谐、一致的原则，创造专注、高效的用户体验。

**核心设计原则（基于 Apple HIG）**:

1. **Hierarchy（层级）**：建立清晰的视觉层级，让内容成为焦点
2. **Harmony（和谐）**：减少视觉噪音，创造统一的界面体验
3. **Consistency（一致性）**：保持组件和交互的一致性

**极简化四大原则**:

1. **聚焦核心**：每个界面只展示最重要的信息和操作
2. **渐进披露**：详细信息按需展示，避免一次性堆砌
3. **智能自动**：减少手动操作，系统自动完成常规任务
4. **视觉克制**：减少装饰元素，让内容成为焦点

**视觉优化策略（v3.0 核心改进）**:

1. **阴影最小化**：顶层卡片使用 `shadow-sm` 微妙阴影，嵌套卡片使用边框
2. **背景色纯化**：移除所有透明度，使用纯色背景确保清晰层级
3. **主题专业化**：使用 corporate（明亮专业）和 business（深色专业）主题
4. **间距标准化**：统一使用 `p-4`、`gap-4` 创造呼吸感

---

## 2. 颜色系统

### 2.1 主题选择

使用 daisyUI 亮/暗主题：

```css
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
}
```

- **light**：浅色主题（默认）
- **dark**：深色主题（系统偏好时启用）

### 2.2 语义化颜色映射

| 颜色类型 | DaisyUI类 | 用途 | 示例场景 |
|---------|----------|-----|---------|
| 操作色 | `primary` | 主要操作按钮 | "执行计划"按钮 |
| 成功色 | `success` | 成功状态、通过操作 | "通过"审批按钮 |
| 警告色 | `warning` | 警告提示、待处理状态 | 待审批提示 |
| 错误色 | `error` | 错误提示、拒绝操作 | "拒绝"审批按钮 |
| 中性色 | `base-content` | 常规文本 | 正文内容 |

### 2.2 背景和边框

**v3.0 核心变更**：移除所有透明度，使用纯色背景

```typescript
// 顶层卡片背景
bg-base-200

// 嵌套卡片背景
bg-base-100

// 统一边框
border-base-content/10

// 文本弱化
text-base-content/60
```

**示例**:
```tsx
import { cardClasses } from '../utils/classNames';

// 顶层卡片
<div className={cardClasses()}>
  <div className="card-body">
    <h2 className="card-title">标题</h2>
    <p className="text-base-content/60">次要信息</p>
  </div>
</div>

// 嵌套卡片
<div className={cardClasses({ variant: 'nested' })}>
  <div className="card-body">
    {/* 内容 */}
  </div>
</div>
```

---

## 3. 间距系统

### 3.1 标准间距规范

| 用途 | Tailwind类 | 实际大小 | 使用场景 |
|-----|-----------|---------|---------|
| 紧凑间距 | `gap-2` | 8px | 图标与文字 |
| 标准间距 | `gap-3` | 12px | 组件内元素（默认）|
| 宽松间距 | `gap-4` | 16px | 卡片之间 |
| 区块间距 | `gap-6` | 24px | 大区块之间 |

**使用建议**:
- 组件内部默认使用 `gap-3`
- 需要紧凑布局时使用 `gap-2`
- 卡片列表之间使用 `gap-4` 或 `mb-3`

**示例**:
```tsx
{/* 标准卡片body间距 */}
<div className="card-body space-y-4">
  <div className="flex items-center gap-3">
    <IconCheck size={16} />
    <span>带图标的文本</span>
  </div>
</div>
```

---

## 4. 组件规范

### 4.1 卡片（Card）

**v3.0 核心变更**：统一使用 `cardClasses()` 工具函数

**导入工具函数**:
```tsx
import { cardClasses, cardBodyClasses } from '../utils/classNames';
```

**顶层卡片**（带微妙阴影）:
```tsx
<div className={cardClasses()}>
  <div className={cardBodyClasses()}>
    <h2 className="card-title text-lg">卡片标题</h2>
    <p>卡片内容</p>
  </div>
</div>
```
生成样式：`card bg-base-200 shadow-sm`

**嵌套卡片**（使用边框而非阴影）:
```tsx
<div className={cardClasses({ variant: 'nested' })}>
  <div className={cardBodyClasses()}>
    {/* 内容 */}
  </div>
</div>
```
生成样式：`card bg-base-100 border border-base-content/10`

**带边框的顶层卡片**:
```tsx
<div className={cardClasses({ bordered: true })}>
  <div className={cardBodyClasses()}>
    {/* 内容 */}
  </div>
</div>
```

**紧凑模式**:
```tsx
<div className={cardClasses()}>
  <div className={cardBodyClasses({ compact: true })}>
    {/* 紧凑内容 */}
  </div>
</div>
```

**设计策略**:
- **顶层卡片**：`shadow-sm` 创造轻微深度感
- **嵌套卡片**：边框区分，无阴影，避免视觉噪音
- **背景色**：纯色，无透明度，清晰层级（base-200 → base-100）
- **间距**：标准 `p-4 space-y-4`，紧凑 `p-4 space-y-3`

### 4.2 按钮（Button）

**基础按钮尺寸**: `btn-sm`（统一标准，配合16px图标）

**按钮变体**:

```tsx
{/* 主要操作 */}
<button className="btn btn-primary btn-sm">
  <IconPlayerPlay size={16} className="mr-1" />
  执行计划
</button>

{/* 次要操作/轮廓按钮 */}
<button className="btn btn-outline btn-sm">
  <IconBolt size={16} className="mr-1" />
  dry-run
</button>

{/* 成功操作 */}
<button className="btn btn-success btn-xs">
  <IconCheck size={16} className="mr-1" />
  通过
</button>

{/* 危险操作 */}
<button className="btn btn-error btn-xs">
  <IconX size={16} className="mr-1" />
  拒绝
</button>

{/* 警告操作 */}
<button className="btn btn-warning btn-sm">
  提醒
</button>
```

**按钮状态**:
```tsx
{/* loading状态 */}
<button className="btn btn-primary btn-sm" disabled>
  执行中…
</button>

{/* disabled状态 */}
<button className="btn btn-primary btn-sm btn-disabled">
  已禁用
</button>
```

### 4.3 表单元素

**Textarea**:
```tsx
<textarea
  className="textarea textarea-bordered w-full font-mono text-sm"
  rows={12}
  spellCheck={false}
  placeholder="输入内容"
/>
```

**Select**:
```tsx
<select className="select select-bordered select-sm">
  <option value="">请选择</option>
  <option value="1">选项1</option>
</select>
```

**Input**:
```tsx
<input
  type="text"
  className="input input-bordered input-sm w-full"
  placeholder="输入内容"
/>
```

### 4.4 提示组件（Alert）

**成功提示**:
```tsx
<div className="alert alert-success text-sm">
  <span>操作成功</span>
</div>
```

**错误提示**:
```tsx
<div className="alert alert-error text-sm">
  <span>操作失败：{error.message}</span>
</div>
```

**警告提示**:
```tsx
<div className="alert alert-warning text-sm">
  <strong>警告：</strong>
  <span>存在风险</span>
</div>
```

**信息提示**:
```tsx
<div className="alert alert-info text-xs">
  <span>提示信息</span>
</div>
```

---

## 5. 排版规范

### 5.1 字号标准

| 用途 | Tailwind类 | 实际大小 |
|-----|-----------|---------|
| 卡片标题 | `text-lg` | 18px |
| 正文 | `text-sm` | 14px |
| 次要信息 | `text-xs` | 12px |
| 大标题 | `text-xl` | 20px |

### 5.2 字重

```tsx
{/* 强调文本 */}
<strong className="text-base">重要信息</strong>

{/* 卡片标题 */}
<h2 className="card-title text-lg">标题</h2>
```

---

## 6. 交互状态规范

### 6.1 Loading状态

**按钮loading**:
```tsx
<button className="btn btn-primary btn-sm" disabled>
  {loading ? "处理中…" : "提交"}
</button>
```

**组件loading**（使用LoadingSpinner组件）:
```tsx
<LoadingSpinner size="md" text="加载中…" />
```

### 6.2 Empty状态

使用EmptyState组件展示空状态：
```tsx
<EmptyState
  icon={<IconInbox size={48} />}
  title="暂无数据"
  description="当前没有可显示的内容"
/>
```

### 6.3 Disabled状态

```tsx
{/* disabled按钮 */}
<button className="btn btn-primary btn-sm btn-disabled">
  已禁用
</button>

{/* disabled input */}
<input
  className="input input-bordered input-sm"
  disabled
/>
```

---

## 7. 响应式设计

### 7.1 断点使用

| 断点 | Tailwind前缀 | 最小宽度 | 用途 |
|-----|------------|---------|------|
| 移动端 | (默认) | 0px | 基础样式 |
| 平板 | `md:` | 768px | 中等屏幕优化 |
| 桌面 | `lg:` | 1024px | 大屏幕优化 |
| 超宽屏 | `xl:` | 1280px | 超宽屏优化 |

**示例**:
```tsx
{/* 移动端flex-col，桌面端flex-row */}
<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
  {/* 内容 */}
</div>

{/* 移动端full-width，桌面端max-width */}
<label className="form-control w-full max-w-sm">
  {/* 表单元素 */}
</label>
```

---

## 8. 主题与外观

- 本项目不引入无障碍专用规范与额外语义属性；聚焦内部使用的可维护性与一致视觉。
- 主题采用 daisyUI 提供的 `light` 与 `dark`，默认跟随系统（light 默认、dark 作为 prefers-dark）。

---

## 9. 图标使用规范

### 9.1 @tabler/icons-react

**标准尺寸**: 16px（配合btn-sm, btn-xs）

```tsx
import { IconPlayerPlay, IconCheck, IconX } from "@tabler/icons-react";

{/* 按钮中的图标 */}
<button className="btn btn-primary btn-sm">
  <IconPlayerPlay size={16} className="mr-1" />
  执行
</button>

{/* 独立图标 */}
<IconCheck size={24} className="text-success" />
```

---

## 10. 实用工具类组合

### 10.1 常见组合模式

**v3.0 推荐使用工具函数**:
```tsx
import { cardClasses, cardBodyClasses, buttonClasses, inputClasses } from '../utils/classNames';
```

**卡片容器**（顶层）:
```typescript
cardClasses()
// 生成: card bg-base-200 shadow-sm
```

**卡片容器**（嵌套）:
```typescript
cardClasses({ variant: 'nested' })
// 生成: card bg-base-100 border border-base-content/10
```

**卡片body（标准间距）**:
```typescript
cardBodyClasses()
// 生成: card-body p-4 space-y-4
```

**卡片body（紧凑）**:
```typescript
cardBodyClasses({ compact: true })
// 生成: card-body p-4 space-y-3 text-sm
```

**按钮**:
```typescript
buttonClasses({ variant: 'primary', size: 'sm' })
// 生成: btn btn-primary btn-sm
```

**输入框**:
```typescript
inputClasses({ type: 'text', size: 'sm' })
// 生成: input input-bordered input-sm w-full
```

**按钮组**:
```
flex flex-wrap items-center gap-3
```

**文本信息层级**:
```
text-base                     // 主要信息
text-base-content/70          // 次要信息
text-base-content/60          // 弱化信息
```

---

## 11. 代码风格约定

### 11.1 className顺序

推荐顺序（Tailwind约定）:
1. 布局类（flex, grid, block）
2. 位置类（relative, absolute）
3. 尺寸类（w-, h-）
4. 间距类（p-, m-, gap-）
5. 排版类（text-, font-）
6. 背景/边框（bg-, border-）
7. 交互类（hover:, focus:）

**示例**:
```tsx
<div className="flex items-center gap-3 p-4 text-sm bg-base-200/70 border border-base-content/10 hover:bg-base-200">
  {/* 内容 */}
</div>
```

### 11.2 使用className工具函数

**v3.0 强制要求**：为避免重复和提高可维护性，必须使用 `src/ui/utils/classNames.ts` 中的工具函数：

```tsx
import {
  cardClasses,
  cardBodyClasses,
  buttonClasses,
  inputClasses,
  alertClasses
} from '../utils/classNames';

// 顶层卡片
<div className={cardClasses()}>
  <div className={cardBodyClasses()}>
    {/* 内容 */}
  </div>
</div>

// 嵌套卡片
<div className={cardClasses({ variant: 'nested' })}>
  <div className={cardBodyClasses({ compact: true })}>
    {/* 紧凑内容 */}
  </div>
</div>

// 按钮
<button className={buttonClasses({ variant: 'primary', size: 'sm' })}>
  提交
</button>

// 输入框
<input className={inputClasses({ size: 'sm' })} />
```

**禁止直接硬编码样式**：
```tsx
// ❌ 错误 - 不要硬编码
<div className="card bg-base-200 shadow-sm">

// ✅ 正确 - 使用工具函数
<div className={cardClasses()}>
```

---

## 12. 常见问题（FAQ）

### Q: v3.0 主要改了什么？
**A**:
1. **阴影最小化**：shadow-xl → shadow-sm（顶层）或 border（嵌套）
2. **背景纯化**：移除所有 /70、/60 透明度，使用纯色
3. **主题切换**：light/dark → corporate/business 专业主题
4. **工具函数强制**：必须使用 cardClasses() 等工具函数

### Q: 如何快速迁移现有组件到 v3.0？
**A**:
1. 导入工具函数：`import { cardClasses, cardBodyClasses } from '../utils/classNames'`
2. 替换卡片：`className="card bg-base-300/70 shadow-xl"` → `className={cardClasses()}`
3. 嵌套卡片：`className="card bg-base-200/70 border ..."` → `className={cardClasses({ variant: 'nested' })}`
4. 卡片body：`className="card-body space-y-4"` → `className={cardBodyClasses()}`

### Q: 什么时候使用 shadow-sm，什么时候使用 border？
**A**:
- **顶层卡片**：使用 `shadow-sm`（微妙阴影）→ `cardClasses()`
- **嵌套卡片**：使用 `border`（边框区分）→ `cardClasses({ variant: 'nested' })`
- **原则**：避免嵌套阴影造成视觉噪音

### Q: bg-base-200 和 bg-base-100 如何选择？
**A**:
- `bg-base-200`：顶层卡片背景（深一级）
- `bg-base-100`：嵌套卡片背景（浅一级）
- **自动处理**：使用 `cardClasses()` 和 `cardClasses({ variant: 'nested' })` 自动应用正确背景

### Q: 按钮应该用 btn-sm 还是 btn-xs？
**A**: 主要操作按钮（执行、dry-run）使用 `btn-sm`，次要操作按钮（通过、拒绝）使用 `btn-xs`。

### Q: gap-2、gap-3、gap-4如何选择？
**A**:
- `gap-2` (8px): 图标与文字
- `gap-3` (12px): 默认标准间距
- `gap-4` (16px): 卡片之间、大元素间距

### Q: 如何处理loading状态？
**A**:
- 按钮：改变文本为"处理中…"并disable
- 组件：使用 `<LoadingSpinner />` 组件
- 列表：保留虚拟列表，显示loading指示器

### Q: 响应式设计从哪个断点开始？
**A**: 优先移动端（默认flex-col），从 `md:` 或 `xl:` 断点开始优化桌面端布局（flex-row）。

---

## 13. 更新记录

| 版本 | 日期 | 变更内容 |
|-----|---------|---------|
| 3.0.0 | 2025-10-18 | **重大更新**：阴影最小化、背景纯化、主题专业化、工具函数强制化 |
| 2.0.0 | 2025-10-16 | 基于 DaisyUI 的初始设计规范 |
| 1.0.0 | 2025-10-16 | 初始版本，建立基础设计规范 |

### v3.0.0 详细变更

**视觉优化**：
- 阴影从 `shadow-xl` 简化为 `shadow-sm`（顶层）
- 嵌套卡片使用边框代替阴影
- 移除所有透明度（/70、/60），使用纯色背景
- 背景层级：base-200（顶层）→ base-100（嵌套）

**主题切换**：
- 从 light/dark 切换到 corporate/business
- corporate：明亮、专业、清爽
- business：深色、专业、低对比度

**工具函数强制化**：
- 新增 `cardClasses()`、`cardBodyClasses()` 工具函数
- 禁止硬编码卡片样式
- 统一间距：p-4、space-y-4

**文件变更**：
- `app.css`：更新主题配置和全局样式
- `classNames.ts`：新增卡片工具函数
- 所有组件：迁移到工具函数

---

**维护者**: Claude Code (v3.0 重构)
**反馈**: 如有设计规范问题或建议，请记录到 `.claude/operations-log.md`

---

## 14. 单入口与信息架构（SPA）

- 单一路径：仅使用 `/` 作为入口；所有视图（监控、编辑、工具流、调度）在首页内部以“模式切换/抽屉/对话框”承载。
- 深链策略：允许使用 URL search/hash 表达局部状态（如 `?tab=streams`、`#exec=123`），但不得新增路径段。
- 四件套统一：加载/空态/错误/重试组件在各模式一致复用；尺寸与交互一致（目标尺寸≥24×24）。
- 焦点管理：模式切换后将焦点置于主区域标题；Sticky 头部不得遮挡 focus（满足 WCAG 2.4.11）。
- 键盘路径：Tab/Shift+Tab/Enter/Esc 全路径可达；对话框遵循 APG 模式（role=dialog, aria-modal）。
