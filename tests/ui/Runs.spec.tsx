/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 被测组件
import RunsPage from '../../src/ui/pages/Runs';

// Mock services 门面：仅覆写本用例涉及的方法
vi.mock('../../src/ui/services', async () => {
  const actual = await vi.importActual<any>('../../src/ui/services');
  const now = new Date().toISOString();
  return {
    ...actual,
    getBaseUrl: vi.fn(() => '/api/v1'),
    fetchExecutionHistory: vi.fn(async () => ({
      total: 2,
      executions: [
        { id: 'exec-1', planId: 'p-1', createdAt: now, status: 'success' },
        { id: 'exec-2', planId: 'p-2', createdAt: now, status: 'failed' }
      ]
    }))
  };
});

describe('Runs 页面 · 渲染与导出链接', () => {
  it('默认渲染列表与导出链接', async () => {
    render(<RunsPage />);
    // 标题存在
    expect(await screen.findByText('运行历史（Runs）')).toBeInTheDocument();
    // 行存在（任一 executionId）
    expect(await screen.findByText('exec-1')).toBeInTheDocument();

    // 导出链接（测试环境可能存在重复渲染，这里取第一个）
    const jsonLink = screen.getAllByRole('link', { name: /导出JSON/ })[0] as HTMLAnchorElement;
    const ndjsonLink = screen.getAllByRole('link', { name: /导出NDJSON/ })[0] as HTMLAnchorElement;
    expect(jsonLink?.getAttribute('href')).toBe('/api/v1/executions/export?format=json');
    expect(ndjsonLink?.getAttribute('href')).toBe('/api/v1/executions/export?format=ndjson');
  });

  it('输入 planId 过滤时，导出链接带上 planId 参数', async () => {
    render(<RunsPage />);
    const input = (await screen.findAllByPlaceholderText('按 planId 过滤'))[0] as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'foo');

    const jsonLink = screen.getAllByRole('link', { name: /导出JSON/ })[0] as HTMLAnchorElement;
    const ndjsonLink = screen.getAllByRole('link', { name: /导出NDJSON/ })[0] as HTMLAnchorElement;
    expect(jsonLink.getAttribute('href')).toContain('planId=foo');
    expect(ndjsonLink.getAttribute('href')).toContain('planId=foo');
  });
});
