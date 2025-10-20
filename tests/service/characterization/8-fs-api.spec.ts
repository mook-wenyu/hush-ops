import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

/**
 * 特征测试: FS API 文件系统操作
 * 目的: 验证后端统一文件系统接口（list/read/write/mkdir/move/delete）
 */
describe('characterization: FS API', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;
  let testScope = 'plansConfig';

  beforeEach(async () => {
    const { app } = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  // GET /api/v1/fs/list - 列出目录
  it('GET /api/v1/fs/list 列出目录内容', async () => {
    const res = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=.`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('entries');
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it('GET /api/v1/fs/list 条目包含必要字段', async () => {
    const res = await fetch(`${baseUrl}/fs/list?scope=${testScope}`);
    const body = (await res.json()) as Record<string, any>;
    if (body.entries.length > 0) {
      const entry = body.entries[0];
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('type');
      expect(['file', 'dir']).toContain(entry.type);
      expect(entry).toHaveProperty('size');
      expect(entry).toHaveProperty('modifiedAt');
    }
  });

  it('GET /api/v1/fs/list 不存在的路径返回 404', async () => {
    const res = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=non-existent-dir`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('not_found');
  });

  it('GET /api/v1/fs/list 路径为文件时返回 400', async () => {
    // 先创建一个文件
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'test-file.txt',
        content: 'test'
      })
    });

    const res = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=test-file.txt`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('not_directory');
  });

  // GET /api/v1/fs/read - 读取文件
  it('GET /api/v1/fs/read 读取文件内容', async () => {
    // 先创建文件
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'read-test.txt',
        content: 'Hello World'
      })
    });

    const res = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=read-test.txt`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('path');
    expect(body).toHaveProperty('content');
    expect(body.content).toBe('Hello World');
  });

  it('GET /api/v1/fs/read 支持 download=1 参数', async () => {
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'download-test.txt',
        content: 'Download me'
      })
    });

    const res = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=download-test.txt&download=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const text = await res.text();
    expect(text).toBe('Download me');
  });

  it('GET /api/v1/fs/read 不存在的文件返回 404', async () => {
    const res = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=non-existent.txt`);
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/fs/read 路径为目录时返回 400', async () => {
    await fetch(`${baseUrl}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'test-dir'
      })
    });

    const res = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=test-dir`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('not_file');
  });

  // POST /api/v1/fs/write - 写入文件
  it('POST /api/v1/fs/write 创建新文件', async () => {
    const res = await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'new-file.txt',
        content: 'New content'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.saved).toBe(true);

    // 验证文件已创建
    const readRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=new-file.txt`);
    const readBody = (await readRes.json()) as Record<string, any>;
    expect(readBody.content).toBe('New content');
  });

  it('POST /api/v1/fs/write 覆盖现有文件（默认）', async () => {
    // 创建初始文件
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'overwrite-test.txt',
        content: 'Original'
      })
    });

    // 覆盖
    const res = await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'overwrite-test.txt',
        content: 'Updated'
      })
    });
    expect(res.status).toBe(200);

    // 验证已覆盖
    const readRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=overwrite-test.txt`);
    const readBody = (await readRes.json()) as Record<string, any>;
    expect(readBody.content).toBe('Updated');
  });

  it('POST /api/v1/fs/write overwrite=false 文件存在时返回 409', async () => {
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'conflict-test.txt',
        content: 'Original'
      })
    });

    const res = await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'conflict-test.txt',
        content: 'Should fail',
        overwrite: false
      })
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('exists');
  });

  it('POST /api/v1/fs/write 自动创建父目录', async () => {
    const res = await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'nested/dir/file.txt',
        content: 'Nested content'
      })
    });
    expect(res.status).toBe(200);

    // 验证文件已创建
    const readRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=nested/dir/file.txt`);
    expect(readRes.status).toBe(200);
  });

  it('POST /api/v1/fs/write 保留设备名（CON/PRN/等）返回 400', async () => {
    const res = await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'CON',
        content: 'Reserved'
      })
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error?.code).toBe('invalid_name');
  });

  // POST /api/v1/fs/mkdir - 创建目录
  it('POST /api/v1/fs/mkdir 创建目录', async () => {
    const res = await fetch(`${baseUrl}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'new-directory'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.created).toBe(true);

    // 验证目录已创建
    const listRes = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=new-directory`);
    expect(listRes.status).toBe(200);
  });

  it('POST /api/v1/fs/mkdir 支持递归创建嵌套目录', async () => {
    const res = await fetch(`${baseUrl}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'a/b/c/d'
      })
    });
    expect(res.status).toBe(200);

    // 验证最深层目录存在
    const listRes = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=a/b/c/d`);
    expect(listRes.status).toBe(200);
  });

  // POST /api/v1/fs/move - 移动/重命名文件
  it('POST /api/v1/fs/move 重命名文件', async () => {
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'old-name.txt',
        content: 'Move me'
      })
    });

    const res = await fetch(`${baseUrl}/fs/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        from: 'old-name.txt',
        to: 'new-name.txt'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.moved).toBe(true);

    // 验证新文件存在，旧文件不存在
    const newRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=new-name.txt`);
    expect(newRes.status).toBe(200);

    const oldRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=old-name.txt`);
    expect(oldRes.status).toBe(404);
  });

  it('POST /api/v1/fs/move 移动文件到子目录', async () => {
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'root-file.txt',
        content: 'Move to subdir'
      })
    });

    const res = await fetch(`${baseUrl}/fs/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        from: 'root-file.txt',
        to: 'subdir/moved-file.txt'
      })
    });
    expect(res.status).toBe(200);

    // 验证文件在新位置
    const readRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=subdir/moved-file.txt`);
    expect(readRes.status).toBe(200);
  });

  // DELETE /api/v1/fs/delete - 删除文件/目录
  it('DELETE /api/v1/fs/delete 删除文件', async () => {
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'delete-me.txt',
        content: 'Will be deleted'
      })
    });

    const res = await fetch(`${baseUrl}/fs/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'delete-me.txt'
      })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.deleted).toBe(true);

    // 验证文件已删除
    const readRes = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=delete-me.txt`);
    expect(readRes.status).toBe(404);
  });

  it('DELETE /api/v1/fs/delete 删除空目录', async () => {
    await fetch(`${baseUrl}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'empty-dir'
      })
    });

    const res = await fetch(`${baseUrl}/fs/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'empty-dir',
        recursive: true
      })
    });
    expect(res.status).toBe(200);

    // 验证目录已删除
    const listRes = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=empty-dir`);
    expect(listRes.status).toBe(404);
  });

  it('DELETE /api/v1/fs/delete 递归删除目录', async () => {
    // 创建带文件的目录
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'dir-with-files/file1.txt',
        content: 'File 1'
      })
    });
    await fetch(`${baseUrl}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'dir-with-files/file2.txt',
        content: 'File 2'
      })
    });

    const res = await fetch(`${baseUrl}/fs/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: testScope,
        path: 'dir-with-files',
        recursive: true
      })
    });
    expect(res.status).toBe(200);

    // 验证目录已删除
    const listRes = await fetch(`${baseUrl}/fs/list?scope=${testScope}&path=dir-with-files`);
    expect(listRes.status).toBe(404);
  });

  // Scope 参数验证
  it('支持不同的 scope 参数', async () => {
    const scopes = ['plansRepo', 'plansConfig', 'state', 'archives', 'logs'];
    
    for (const scope of scopes) {
      const res = await fetch(`${baseUrl}/fs/list?scope=${scope}`);
      // 即使目录不存在，也不应返回 500 错误
      expect([200, 404]).toContain(res.status);
    }
  });

  // 路径越界保护
  it('路径越界尝试被拒绝', async () => {
    const res = await fetch(`${baseUrl}/fs/read?scope=${testScope}&path=../../etc/passwd`);
    // 应该返回错误（404、422 或 500）
    expect([404, 422, 500]).toContain(res.status);
  });
}, 30000);
