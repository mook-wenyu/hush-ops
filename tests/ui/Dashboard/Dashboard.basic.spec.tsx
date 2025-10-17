import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Dashboard from '../../../src/ui/pages/Dashboard';
import { setAppStoreEnabledForTests } from '../../../src/ui/state/appStore';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function mockText(text: string) {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

describe('Dashboard — 基础渲染测试', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    setAppStoreEnabledForTests(false);
    vi.useFakeTimers();
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/v1/plans')) return mockJson({ plans: [] });
      if (url.endsWith('/api/v1/schedules')) return mockJson({ schedules: [] });
      if (url.endsWith('/api/v1/mcp/servers')) return mockJson({ servers: [] });
      if (url.endsWith('/plans/demo-mixed.json')) return mockText(JSON.stringify({ id: 'demo', nodes: [] }));
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('应该能够渲染并显示基本元素', async () => {
    render(<Dashboard />);
    
    // 推进时间让初始化完成
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    
    // 验证基本元素存在
    expect(screen.getByText(/调度总数/i)).toBeInTheDocument();
    expect(screen.getByText(/工作模式/i)).toBeInTheDocument();
  });
});
