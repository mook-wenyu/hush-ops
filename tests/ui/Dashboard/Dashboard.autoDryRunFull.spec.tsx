import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../../../src/ui/pages/Dashboard';
import { setAppStoreEnabledForTests } from '../../../src/ui/state/appStore';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function mockText(text: string) {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

describe('Dashboard auto dry-run debounce', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // 禁用 app store 确保 Dashboard 始终渲染 DashboardNoStore
    setAppStoreEnabledForTests(false);
    // 不使用 fake timers - 让异步操作正常执行
    // Mock 所有 HTTP 请求
    global.fetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      console.log('[FETCH]', method, url);
      
      // GET /plans - 计划列表
      if (url.includes('/plans') && !url.includes('/plans/') && method === 'GET') {
        console.log('[MOCK] Returning plans list');
        return mockJson({ plans: [{ id: 'demo', version: 'v1' }] });
      }
      // GET /plans/{id} - 单个计划
      if (url.match(/\/plans\/[^/?]+$/) && method === 'GET') {
        console.log('[MOCK] Returning single plan');
        return mockJson({ id: 'demo', nodes: [{ id: 'n1', type: 'local_task' }] });
      }
      // POST /plans - 创建计划
      if (url.includes('/plans') && !url.includes('/plans/') && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        return mockJson({ id: body?.id ?? 'p1' });
      }
      // PUT /plans/{id} - 更新计划
      if (url.includes('/plans/') && method === 'PUT') {
        return mockJson({ success: true });
      }
      // POST /plans/dry-run
      if (url.includes('/plans/dry-run') && method === 'POST') {
        return mockJson({ warnings: ['w1'], timeline: [{ t: Date.now(), status: 'ok' }] });
      }
      // POST /designer/compile
      if (url.includes('/designer/compile') && method === 'POST') {
        return mockJson({ plan: {}, diagnostics: [] });
      }
      // 其他资源
      if (url.includes('/schedules')) return mockJson({ schedules: [] });
      if (url.includes('/mcp/servers')) return mockJson({ servers: [] });
      if (url.includes('/plans/demo-mixed.json')) return mockText(JSON.stringify({ id: 'demo', nodes: [{ id: 'n1', type: 'local_task' }] }));
      
      console.log('[MOCK] No match, returning 404');
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('enters edit mode, opens a plan, adds a node and triggers auto dry-run', async () => {
    render(<Dashboard />);

    // 等待初始数据加载（不使用 fake timers）
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /编辑器/i })).toBeInTheDocument();
    });

    // 切换到编辑器模式
    const editBtn = screen.getByRole('button', { name: /编辑器/i });
    fireEvent.click(editBtn);

    // 验证进入编辑器视图（以“执行计划”按钮出现为准）
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /执行计划|执行/i })).toBeInTheDocument();
    });

    // 等待计划列表加载
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /demo/i })).toBeInTheDocument();
    });

    // 打开 demo 计划
    const openBtn = screen.getByRole('button', { name: /demo/i });
    fireEvent.click(openBtn);

    // 等待计划加载并渲染画布
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /新增/i })).toBeInTheDocument();
    });

    // 现在启用 fake timers 来控制去抖定时器
    vi.useFakeTimers();

    // 点击"新增"按钮（PlanCanvas 工具栏）
    const addBtn = screen.getByRole('button', { name: /新增/i });
    fireEvent.click(addBtn);

    // 推进去抖定时器：auto dry-run 400ms、autosave 1.5s
    await vi.advanceTimersByTimeAsync(2000);

    // 验证 fetch 被调用：dry-run 和保存
    const calls = (global.fetch as any).mock.calls as any[];
    const dryRunCalls = calls.filter((c: any) => {
      const url = typeof c[0] === 'string' ? c[0] : c[0]?.url;
      return url?.endsWith('/plans/dry-run') || url?.includes('/plans/dry-run');
    });
    const saveCalls = calls.filter((c: any) => {
      const url = typeof c[0] === 'string' ? c[0] : c[0]?.url;
      const method = c[1]?.method;
      return (url?.endsWith('/plans') && method === 'POST') ||
             (url?.includes('/plans/') && method === 'PUT');
    });
    expect(dryRunCalls.length).toBeGreaterThan(0);
    expect(saveCalls.length).toBeGreaterThan(0);

    // 清理 fake timers
    vi.useRealTimers();
  });
});
