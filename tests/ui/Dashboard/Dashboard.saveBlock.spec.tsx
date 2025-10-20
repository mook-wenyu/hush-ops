import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import Dashboard from '../../../src/ui/pages/Dashboard';
import { setAppStoreEnabledForTests } from '../../../src/ui/state/appStore';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function mockText(text: string) {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

describe('Dashboard — 保存前 compile 阻断', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // 禁用 app store 确保 Dashboard 始终渲染 DashboardNoStore
    setAppStoreEnabledForTests(false);
    // 注意：初始不使用 fake timers，让 fetch 正常完成
    // 默认 fetch 路由表
    global.fetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      // 初始化依赖
      if (url.includes('/plans') && !url.includes('/plans/') && method === 'GET') return mockJson({ plans: [] });
      if (url.includes('/schedules')) return mockJson({ schedules: [] });
      if (url.includes('/mcp/servers')) return mockJson({ servers: [] });
      if (url.includes('/plans/demo-mixed.json')) return mockText(JSON.stringify({ id: 'demo', nodes: [{ id: 'n1', type: 'local_task' }] }));
      // 保存前 compile：返回 error 诊断以阻断
      if (url.includes('/designer/compile') && method === 'POST') {
        return mockJson({ plan: {}, diagnostics: [{ severity: 'error', message: '图无效', nodeId: 'n1' }] });
      }
      // 避免未覆盖请求导致的失败
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('compile 返回 error 时阻断自动保存并显示错误', async () => {
    render(<Dashboard />);

    // 等待初始数据加载（真实 timers）
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 切换到编辑器模式
    const editorBtn = screen.getByRole('button', { name: /编辑器/i });
    fireEvent.click(editorBtn);

    // 等待 EditorView 渲染（以“执行计划”按钮出现为准）
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /执行计划|执行/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    // EditorView 挂载后会设置 1.5s 自动保存定时器
    // 等待真实 1.6s 让自动保存触发并完成 compile 检查
    await new Promise((resolve) => setTimeout(resolve, 1600));

    // 断言出现保存阻断告警（可能有多个，使用 queryAllByText 验证至少有一个）
    const alerts = screen.queryAllByText(/保存已取消：编译失败/i);
    expect(alerts.length).toBeGreaterThan(0);
  });
});
