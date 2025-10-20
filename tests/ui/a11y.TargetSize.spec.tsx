/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import ToolStreamsPage from '../../src/ui/pages/ToolStreams';

function mockJson(obj: any) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('A11y target size — 常见按钮至少 24px (通过类名代理)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.useRealTimers();
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/v1/tool-streams')) {
        return mockJson({ total: 1, streams: [{ correlationId: 'c1', toolName: 'tool', chunkCount: 1, latestSequence: 1, updatedAt: '2025-01-01T00:00:00.000Z', hasError: false, completed: true }] });
      }
      if (url.includes('/api/v1/tool-streams/c1')) {
        return mockJson({ chunks: [{ status: 'msg', message: 'ok' }] });
      }
      return new Response('not found', { status: 404 });
    }) as any;
  });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('ToolStreams 行操作按钮包含 min-h-6（= 24px）', async () => {
    render(<ToolStreamsPage />);
    const viewBtn = await screen.findByRole('button', { name: '查看' });
    expect(viewBtn.className).toContain('min-h-6');
  });
});
