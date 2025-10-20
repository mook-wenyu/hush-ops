import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/ui/services', async () => {
  return {
    fetchExecutions: vi.fn().mockResolvedValue([]),
    fetchPlans: vi.fn().mockResolvedValue([]),
    fetchPlanById: vi.fn().mockResolvedValue(null),
    uploadPlanFiles: vi.fn().mockResolvedValue(undefined),
    fetchMcpServers: vi.fn().mockResolvedValue([]),
  } as any;
});

import Dashboard from '../../src/ui/pages/Dashboard';

describe('Dashboard 集成模式收敛', () => {
  it('不再显示“工具流/调度”模式按钮（入口已迁移/合并）', async () => {
    render(<Dashboard />);
    expect(screen.queryByRole('button', { name: '工具流' })).toBeNull();
    expect(screen.queryByRole('button', { name: '调度' })).toBeNull();
    // 仍应存在“工作模式”与“计划列表”文案
    expect(await screen.findByText('工作模式')).toBeInTheDocument();
    expect(await screen.findByText(/计划列表/)).toBeInTheDocument();
  });
});
