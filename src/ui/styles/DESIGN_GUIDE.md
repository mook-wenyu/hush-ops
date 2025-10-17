# UI/UX 设计规范指南

**版本**: 1.0.0
**更新时间**: 2025-10-16
**适用范围**: Hush-Ops 混合编排可视化调度平台前端

---

## 1. 设计系统概述

本设计规范基于 **DaisyUI 5.2.1** 组件库，采用 **Tailwind CSS 4.1.14** 作为样式基础。所有组件设计遵循统一的视觉语言和交互模式，确保用户体验的一致性。

**核心原则**:
- 基于DaisyUI，不重复造轮子
- 语义化颜色使用
- 统一的间距和排版
- 明确的交互反馈
- 无障碍支持

---

## 2. 颜色系统

### 2.1 语义化颜色映射

| 颜色类型 | DaisyUI类 | 用途 | 示例场景 |
|---------|----------|-----|---------|
| 操作色 | `primary` | 主要操作按钮 | "执行计划"按钮 |
| 成功色 | `success` | 成功状态、通过操作 | "通过"审批按钮 |
| 警告色 | `warning` | 警告提示、待处理状态 | 待审批提示 |
| 错误色 | `error` | 错误提示、拒绝操作 | "拒绝"审批按钮 |
| 中性色 | `base-content` | 常规文本 | 正文内容 |

### 2.2 背景和边框

```typescript
// 卡片背景（统一标准）
bg-base-200/70

// 卡片边框（统一标准）
border-base-content/10

// 文本弱化
text-base-content/60
```

**示例**:
```tsx
<div className="card bg-base-200/70 border border-base-content/10">
  <div className="card-body">
    <h2 className="card-title">标题</h2>
    <p className="text-base-content/60">次要信息</p>
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

**基础样式**:
```tsx
<div className="card bg-base-200/70 shadow-xl">
  <div className="card-body space-y-4">
    <h2 className="card-title text-lg">卡片标题</h2>
    <p>卡片内容</p>
  </div>
</div>
```

**带边框卡片**:
```tsx
<div className="card bg-base-200/70 border border-base-content/10">
  <div className="card-body space-y-2 p-4 text-sm">
    {/* 紧凑内容 */}
  </div>
</div>
```

**嵌套卡片**（父卡片）:
```tsx
<div className="card bg-base-300/70 shadow-xl">
  {/* 外层使用base-300，内层使用base-200 */}
</div>
```

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

## 8. 无障碍支持

### 8.1 必需的ARIA属性

**列表**:
```tsx
<div role="list" aria-label="执行记录列表">
  <article role="listitem">
    {/* 列表项内容 */}
  </article>
</div>
```

**按钮**:
```tsx
<button
  type="button"
  aria-label="停止执行"
  title="停止执行"
>
  <IconSquare size={16} />
</button>
```

**loading状态**:
```tsx
<div role="status" aria-live="polite">
  <span className="loading loading-spinner" />
  <span>加载中…</span>
</div>
```

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

**卡片容器**:
```
card bg-base-200/70 shadow-xl
```

**卡片body（标准间距）**:
```
card-body space-y-4
```

**卡片body（紧凑）**:
```
card-body space-y-2 p-4 text-sm
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

为避免重复和提高可维护性，使用 `src/ui/utils/classNames.ts` 中的工具函数：

```tsx
import { cardClasses, buttonClasses } from '../utils/classNames';

<div className={cardClasses()}>
  <button className={buttonClasses({ variant: 'primary', size: 'sm' })}>
    提交
  </button>
</div>
```

---

## 12. 常见问题（FAQ）

### Q: 什么时候使用base-200/70，什么时候使用base-300/70？
**A**: 统一使用 `bg-base-200/70`。`base-300`仅在需要嵌套卡片时作为外层卡片使用。

### Q: 按钮应该用btn-sm还是btn-xs？
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
|-----|------|---------|
| 1.0.0 | 2025-10-16 | 初始版本，建立基础设计规范 |

---

**维护者**: Claude Code
**反馈**: 如有设计规范问题或建议，请记录到 `.claude/operations-log.md`
