import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import ToolStreamsPage from '../../../src/ui/pages/ToolStreams';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('ToolStreams — 时间范围筛选与 URL 同步', () => {
  const originalFetch = global.fetch;
  const replaceSpy = vi.spyOn(window.history, 'replaceState');
  beforeEach(() => {
    // 使用真实计时器，避免 waitFor 在 fake timers 下的轮询卡住
    vi.useRealTimers();
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/v1/tool-streams')) return mockJson({ streams: [], total: 0 });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    global.fetch = originalFetch;
    replaceSpy.mockClear();
  });

  it('从 URL 初始化筛选并写回更新后的查询参数', async () => {
    const after = '2025-01-01T00:00:00.000Z';
    const before = '2025-12-31T23:59:59.999Z';
    window.history.pushState(null, '', `/tool-streams?onlyErrors=0&tool=my&executionId=ex1&correlationPrefix=agents:&updatedAfter=${encodeURIComponent(after)}&updatedBefore=${encodeURIComponent(before)}&offset=50`);

    render(<ToolStreamsPage />);

    // 初始渲染会触发一次请求，随后我们修改 updatedAfter 以触发 URL 同步
    const afterInput = screen.getByPlaceholderText('Updated After (ISO)') as HTMLInputElement;
    const beforeInput = screen.getByPlaceholderText('Updated Before (ISO)') as HTMLInputElement;
    expect(afterInput.value).toBe(after);
    expect(beforeInput.value).toBe(before);

    fireEvent.change(afterInput, { target: { value: '2025-06-01T00:00:00.000Z' } });
    await waitFor(() => expect(replaceSpy).toHaveBeenCalled());
    await waitFor(() => {
      const calls = replaceSpy.mock.calls.map((c) => String(c[2]));
      expect(calls.some((u) => u?.includes('updatedAfter=2025-06-01T00%3A00%3A00.000Z'))).toBe(true);
    });
  });
  it('非法 ISO 不写入 URL', async () => {
    window.history.pushState(null, '', `/tool-streams`);
    render(<ToolStreamsPage />);
    const afterInput = screen.getByPlaceholderText('Updated After (ISO)') as HTMLInputElement;
    // 非法格式
    fireEvent.change(afterInput, { target: { value: '2025/01/01 00:00:00' } });
    await waitFor(() => {
      const calls = (window.history.replaceState as any).mock?.calls?.map((c: any[]) => String(c[2])) ?? [];
      expect(calls.some((u: string) => /updatedAfter=/.test(u))).toBe(false);
    });
  });

});
