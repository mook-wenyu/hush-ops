import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PlanRecord } from '../../state/appStore';

/**
 * IndexedDB 数据库 Schema 定义
 */
export interface HushOpsDB extends DBSchema {
  /**
   * Plans 对象存储
   * - key: plan id (string)
   * - value: PlanRecord
   * - indexes: updatedAt (用于按更新时间排序)
   */
  plans: {
    key: string;
    value: PlanRecord;
    indexes: { 'by-updated': number };
  };

  /**
   * Executions 对象存储
   * - key: execution id (string)
   * - value: execution 记录
   * - indexes: createdAt (用于按创建时间排序)
   */
  executions: {
    key: string;
    value: {
      id: string;
      planId: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      createdAt: number;
      completedAt?: number;
      metadata?: Record<string, unknown>;
    };
    indexes: { 'by-created': number };
  };

  /**
   * Approvals 对象存储
   * - key: approval id (string)
   * - value: approval 记录
   */
  approvals: {
    key: string;
    value: {
      id: string;
      executionId: string;
      status: 'pending' | 'approved' | 'rejected';
      createdAt: number;
      metadata?: Record<string, unknown>;
    };
  };

  /**
   * MCP 配置对象存储
   * - key: config id (string)
   * - value: MCP 配置
   */
  'mcp-config': {
    key: string;
    value: {
      id: string;
      name: string;
      config: Record<string, unknown>;
      updatedAt: number;
    };
  };

  /**
   * Chat 消息对象存储
   * - key: message id (string)
   * - value: chat message
   * - indexes: timestamp (用于按时间排序)
   */
  'chat-messages': {
    key: string;
    value: {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: number;
      metadata?: Record<string, unknown>;
    };
    indexes: { 'by-timestamp': number };
  };
}

/**
 * 数据库名称和版本
 */
const DB_NAME = 'hush-ops-db';
const DB_VERSION = 1;

/**
 * 数据库实例缓存
 */
let dbInstance: IDBPDatabase<HushOpsDB> | null = null;

/**
 * 打开并初始化 IndexedDB 数据库
 * @returns Promise<IDBPDatabase<HushOpsDB>>
 */
export async function openHushOpsDB(): Promise<IDBPDatabase<HushOpsDB>> {
  // 返回已缓存的实例
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<HushOpsDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, _transaction) {
      console.log(
        `[IndexedDB] 升级数据库: v${oldVersion} -> v${newVersion}`
      );

      // 创建 plans 对象存储
      if (!db.objectStoreNames.contains('plans')) {
        const plansStore = db.createObjectStore('plans', { keyPath: 'id' });
        plansStore.createIndex('by-updated', 'updatedAt', { unique: false });
        console.log('[IndexedDB] 创建 plans 对象存储');
      }

      // 创建 executions 对象存储
      if (!db.objectStoreNames.contains('executions')) {
        const executionsStore = db.createObjectStore('executions', {
          keyPath: 'id'
        });
        executionsStore.createIndex('by-created', 'createdAt', {
          unique: false
        });
        console.log('[IndexedDB] 创建 executions 对象存储');
      }

      // 创建 approvals 对象存储
      if (!db.objectStoreNames.contains('approvals')) {
        db.createObjectStore('approvals', { keyPath: 'id' });
        console.log('[IndexedDB] 创建 approvals 对象存储');
      }

      // 创建 mcp-config 对象存储
      if (!db.objectStoreNames.contains('mcp-config')) {
        db.createObjectStore('mcp-config', { keyPath: 'id' });
        console.log('[IndexedDB] 创建 mcp-config 对象存储');
      }

      // 创建 chat-messages 对象存储
      if (!db.objectStoreNames.contains('chat-messages')) {
        const chatStore = db.createObjectStore('chat-messages', {
          keyPath: 'id'
        });
        chatStore.createIndex('by-timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] 创建 chat-messages 对象存储');
      }
    },

    blocked() {
      console.warn(
        '[IndexedDB] 数据库升级被阻塞，请关闭其他打开的标签页'
      );
    },

    blocking() {
      console.warn(
        '[IndexedDB] 当前连接阻止了新版本数据库的打开，准备关闭...'
      );
      // 优雅关闭当前连接
      dbInstance?.close();
      dbInstance = null;
    },

    terminated() {
      console.error('[IndexedDB] 数据库连接被浏览器异常终止');
      dbInstance = null;
    }
  });

  console.log(`[IndexedDB] 数据库 ${DB_NAME} v${DB_VERSION} 已打开`);
  return dbInstance;
}

/**
 * Plans 对象存储 CRUD 操作
 */
export const plansDB = {
  /**
   * 获取所有 plans
   */
  async getAll(): Promise<PlanRecord[]> {
    const db = await openHushOpsDB();
    return db.getAll('plans');
  },

  /**
   * 按更新时间降序获取所有 plans
   */
  async getAllSorted(): Promise<PlanRecord[]> {
    const db = await openHushOpsDB();
    const index = db.transaction('plans').store.index('by-updated');
    const plans = await index.getAll();
    // idb 索引默认升序，需要反转
    return plans.reverse();
  },

  /**
   * 根据 ID 获取单个 plan
   */
  async get(id: string): Promise<PlanRecord | undefined> {
    const db = await openHushOpsDB();
    return db.get('plans', id);
  },

  /**
   * 保存或更新 plan
   */
  async put(plan: PlanRecord): Promise<void> {
    const db = await openHushOpsDB();
    await db.put('plans', plan);
  },

  /**
   * 批量保存 plans
   */
  async putMany(plans: PlanRecord[]): Promise<void> {
    const db = await openHushOpsDB();
    const tx = db.transaction('plans', 'readwrite');
    await Promise.all([
      ...plans.map((plan) => tx.store.put(plan)),
      tx.done
    ]);
  },

  /**
   * 删除 plan
   */
  async delete(id: string): Promise<void> {
    const db = await openHushOpsDB();
    await db.delete('plans', id);
  },

  /**
   * 清空所有 plans
   */
  async clear(): Promise<void> {
    const db = await openHushOpsDB();
    await db.clear('plans');
  }
};

/**
 * Executions 对象存储 CRUD 操作
 */
export const executionsDB = {
  async getAll() {
    const db = await openHushOpsDB();
    return db.getAll('executions');
  },

  async get(id: string) {
    const db = await openHushOpsDB();
    return db.get('executions', id);
  },

  async put(execution: HushOpsDB['executions']['value']) {
    const db = await openHushOpsDB();
    await db.put('executions', execution);
  },

  async delete(id: string) {
    const db = await openHushOpsDB();
    await db.delete('executions', id);
  },

  async clear() {
    const db = await openHushOpsDB();
    await db.clear('executions');
  }
};

/**
 * Approvals 对象存储 CRUD 操作
 */
export const approvalsDB = {
  async getAll() {
    const db = await openHushOpsDB();
    return db.getAll('approvals');
  },

  async get(id: string) {
    const db = await openHushOpsDB();
    return db.get('approvals', id);
  },

  async put(approval: HushOpsDB['approvals']['value']) {
    const db = await openHushOpsDB();
    await db.put('approvals', approval);
  },

  async delete(id: string) {
    const db = await openHushOpsDB();
    await db.delete('approvals', id);
  },

  async clear() {
    const db = await openHushOpsDB();
    await db.clear('approvals');
  }
};

/**
 * MCP Config 对象存储 CRUD 操作
 */
export const mcpConfigDB = {
  async getAll() {
    const db = await openHushOpsDB();
    return db.getAll('mcp-config');
  },

  async get(id: string) {
    const db = await openHushOpsDB();
    return db.get('mcp-config', id);
  },

  async put(config: HushOpsDB['mcp-config']['value']) {
    const db = await openHushOpsDB();
    await db.put('mcp-config', config);
  },

  async delete(id: string) {
    const db = await openHushOpsDB();
    await db.delete('mcp-config', id);
  },

  async clear() {
    const db = await openHushOpsDB();
    await db.clear('mcp-config');
  }
};

/**
 * Chat Messages 对象存储 CRUD 操作
 */
export const chatMessagesDB = {
  async getAll() {
    const db = await openHushOpsDB();
    return db.getAll('chat-messages');
  },

  async getAllSorted() {
    const db = await openHushOpsDB();
    const index = db.transaction('chat-messages').store.index('by-timestamp');
    return index.getAll();
  },

  async get(id: string) {
    const db = await openHushOpsDB();
    return db.get('chat-messages', id);
  },

  async put(message: HushOpsDB['chat-messages']['value']) {
    const db = await openHushOpsDB();
    await db.put('chat-messages', message);
  },

  async delete(id: string) {
    const db = await openHushOpsDB();
    await db.delete('chat-messages', id);
  },

  async clear() {
    const db = await openHushOpsDB();
    await db.clear('chat-messages');
  }
};

/**
 * 关闭数据库连接
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[IndexedDB] 数据库连接已关闭');
  }
}

/**
 * 删除整个数据库（慎用）
 */
export async function deleteDatabase(): Promise<void> {
  closeDB();
  await indexedDB.databases().then((databases) => {
    const exists = databases.some((db) => db.name === DB_NAME);
    if (exists) {
      indexedDB.deleteDatabase(DB_NAME);
      console.log(`[IndexedDB] 数据库 ${DB_NAME} 已删除`);
    }
  });
}
