/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchExecutionHistory, buildExecutionsExportUrl } from '../../src/ui/services/executions';
import * as http from '../../src/ui/services/core/http';

function mockJson(obj: any, init: Partial<ResponseInit> = {}) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

describe('services — executions.history 与导出 URL', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    // 默认将 requestJson 走真实实现但用 mock fetch 兜底
    vi.spyOn(http, 'getBaseUrl').mockReturnValue('/api/v1');
    global.fetch = vi.fn(async (input: any) => {
      // 返回空结构
      return mockJson({ total: 0, executions: [] });
    }) as any;
  });

  afterEach(() => { global.fetch = origFetch; vi.restoreAllMocks(); });

  it('fetchExecutionHistory 组装正确的查询参数', async () => {
    const spy = vi.spyOn(http, 'requestJson');
    spy.mockResolvedValue({ total: 0, executions: [] } as any);

    await fetchExecutionHistory({ planId: 'p1', limit: 50, offset: 100 });

    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0]!; // 已断言调用发生
    const method = call[0];
    const path = call[1] as string;
    expect(method).toBe('GET');
    expect(path).toContain('/executions/history');
    expect(path).toContain('planId=p1');
    expect(path).toContain('limit=50');
    expect(path).toContain('offset=100');
  });

  it('buildExecutionsExportUrl 构造导出链接（ndjson + 压缩 + 过滤）', () => {
    const href = buildExecutionsExportUrl('ndjson', { compress: true, planId: 'foo' });
    expect(href).toBe('/executions/export?format=ndjson&compress=1&planId=foo');
  });
});
