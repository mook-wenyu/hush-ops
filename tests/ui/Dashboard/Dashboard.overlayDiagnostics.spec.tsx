import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Dashboard from '../../../src/ui/pages/Dashboard';
import { setAppStoreEnabledForTests } from '../../../src/ui/state/appStore';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function mockText(text: string) {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

describe('Dashboard — 诊断错误高亮 overlay', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // 禁用 app store 确保 Dashboard 始终渲染 DashboardNoStore
    setAppStoreEnabledForTests(false);
    // 注意：初始不使用 fake timers，让 fetch 正常完成
    global.fetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      // 使用 includes 匹配完整 URL
      if (url.includes('/plans') && !url.includes('/plans/') && method === 'GET') return mockJson({ plans: [] });
      if (url.includes('/schedules')) return mockJson({ schedules: [] });
      if (url.includes('/mcp/servers')) return mockJson({ servers: [] });
      if (url.includes('/plans/demo-mixed.json')) return mockText(JSON.stringify({ id: 'demo', nodes: [{ id: 'n1', type: 'local_task' }] }));
      if (url.includes('/designer/compile') && method === 'POST') {
        return mockJson({ plan: {}, diagnostics: [{ severity: 'error', message: '图无效', nodeId: 'n1' }] });
      }
      // dry-run 不需要在本用例触发，返回 200 空即可
      if (url.includes('/plans/dry-run') && method === 'POST') {
        return mockJson({ timeline: [], warnings: [] });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('compile 返回 error 时在节点头部显示错误徽标', async () => {
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

    // EditorView 中 compile 延迟在测试环境下为 0，会立即触发
    // 等待 compile 完成并生成 diagnostics
    await waitFor(() => {
      const badge = screen.queryByTitle(/存在错误|图无效/);
      expect(badge).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
