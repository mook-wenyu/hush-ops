# IndexedDB 持久化模块使用指南

## 概览

`src/ui/services/db/index.ts` 提供了基于 `idb` 库的 IndexedDB 封装,支持:
- ✅ TypeScript 强类型支持
- ✅ Promise-based API
- ✅ 自动数据库初始化和升级
- ✅ 分类的对象存储 (plans, executions, approvals, mcp-config, chat-messages)
- ✅ 索引支持 (按时间排序)

## 数据库结构

### Object Stores (对象存储)

| Store 名称 | Key | Indexes | 用途 |
|-----------|-----|---------|------|
| `plans` | id | by-updated | 存储 PlanRecord |
| `executions` | id | by-created | 存储执行记录 |
| `approvals` | id | - | 存储审批记录 |
| `mcp-config` | id | - | 存储 MCP 配置 |
| `chat-messages` | id | by-timestamp | 存储聊天消息 |

## 基础用法

### 1. Plans 数据操作

```typescript
import { plansDB } from '@/services/db';

// 获取所有 plans
const allPlans = await plansDB.getAll();

// 按更新时间降序获取
const sortedPlans = await plansDB.getAllSorted();

// 获取单个 plan
const plan = await plansDB.get('plan-123');

// 保存或更新 plan
await plansDB.put({
  id: 'plan-123',
  name: '新计划',
  planData: { /* ... */ },
  createdAt: Date.now(),
  updatedAt: Date.now()
});

// 批量保存
await plansDB.putMany([plan1, plan2, plan3]);

// 删除 plan
await plansDB.delete('plan-123');

// 清空所有 plans
await plansDB.clear();
```

### 2. Executions 数据操作

```typescript
import { executionsDB } from '@/services/db';

// 保存执行记录
await executionsDB.put({
  id: 'exec-456',
  planId: 'plan-123',
  status: 'running',
  createdAt: Date.now(),
  metadata: { /* ... */ }
});

// 更新状态
const execution = await executionsDB.get('exec-456');
if (execution) {
  execution.status = 'completed';
  execution.completedAt = Date.now();
  await executionsDB.put(execution);
}
```

### 3. Chat Messages 数据操作

```typescript
import { chatMessagesDB } from '@/services/db';

// 保存消息
await chatMessagesDB.put({
  id: `msg-${Date.now()}`,
  role: 'user',
  content: '用户消息内容',
  timestamp: Date.now()
});

// 按时间顺序获取所有消息
const messages = await chatMessagesDB.getAllSorted();
```

## 与 Zustand Store 集成

### 方案 1: 手动持久化

```typescript
// 在组件中保存到 IndexedDB
import { useAppStore } from '@/state/appStore';
import { plansDB } from '@/services/db';

function MyComponent() {
  const plans = useAppStore(state => state.plans.byId);

  // 保存到 IndexedDB
  const handleSave = async () => {
    const planArray = Object.values(plans);
    await plansDB.putMany(planArray);
  };

  // 从 IndexedDB 加载
  const handleLoad = async () => {
    const savedPlans = await plansDB.getAllSorted();
    useAppStore.getState().hydratePlans(savedPlans);
  };

  // ...
}
```

### 方案 2: 自动同步中间件 (推荐)

```typescript
// src/ui/state/middleware/persistMiddleware.ts
import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { plansDB } from '@/services/db';

type PersistMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>
) => StateCreator<T, Mps, Mcs>;

export const persistPlans: PersistMiddleware = (config) => (set, get, api) => {
  // 加载初始数据
  plansDB.getAllSorted().then((plans) => {
    if (plans.length > 0) {
      get().hydratePlans?.(plans);
    }
  });

  return config(
    (args) => {
      set(args);

      // 自动保存 plans 到 IndexedDB
      const state = get();
      if ('plans' in state) {
        const planArray = Object.values(state.plans.byId);
        plansDB.putMany(planArray).catch(console.error);
      }
    },
    get,
    api
  );
};
```

## 最佳实践

### 1. 错误处理

```typescript
async function savePlan(plan: PlanRecord) {
  try {
    await plansDB.put(plan);
    console.log('Plan 保存成功');
  } catch (error) {
    console.error('保存失败:', error);
    // 可选: 显示用户友好的错误提示
  }
}
```

### 2. 批量操作优化

```typescript
// ✅ 好的做法: 使用事务批量操作
await plansDB.putMany(plans);

// ❌ 避免: 循环单个操作
for (const plan of plans) {
  await plansDB.put(plan); // 每次都是新事务,性能差
}
```

### 3. 数据迁移

当数据库 schema 需要升级时:

```typescript
// 在 openHushOpsDB 的 upgrade 回调中
upgrade(db, oldVersion, newVersion, transaction) {
  if (oldVersion < 2) {
    // 版本 2 的迁移逻辑
    const store = transaction.objectStore('plans');
    // 添加新字段、修改索引等
  }
}
```

### 4. 定期清理

```typescript
// 清理旧的执行记录 (例如保留最近 30 天)
async function cleanupOldExecutions() {
  const db = await openHushOpsDB();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const tx = db.transaction('executions', 'readwrite');
  const index = tx.store.index('by-created');

  for await (const cursor of index.iterate(IDBKeyRange.upperBound(thirtyDaysAgo))) {
    await cursor.delete();
  }

  await tx.done;
}
```

## 调试

### 查看数据库内容

在 Chrome DevTools:
1. 打开 Application 标签页
2. 展开 IndexedDB
3. 选择 `hush-ops-db`
4. 查看各个 object stores

### 删除数据库 (重置)

```typescript
import { deleteDatabase } from '@/services/db';

// 慎用! 会删除所有本地数据
await deleteDatabase();
```

## 注意事项

1. **浏览器兼容性**: idb 支持所有现代浏览器,但请确保用户使用较新版本
2. **存储限额**: IndexedDB 通常有数百 MB 到数 GB 的存储空间,具体取决于浏览器和设备
3. **隐私模式**: 隐私/无痕模式下 IndexedDB 可能在会话结束后被清除
4. **安全性**: IndexedDB 数据存储在客户端,不要存储敏感信息 (如密码、token)
5. **并发**: 同一浏览器的多个标签页会共享同一个 IndexedDB,注意数据同步问题

## 下一步

- [ ] 集成到 Zustand store 的持久化中间件
- [ ] 添加数据导入/导出功能
- [ ] 实现自动备份机制
- [ ] 添加数据压缩 (对于大型 plans)
