/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SchedulesPage from '../../src/ui/pages/Schedules';

vi.mock('../../src/ui/services/schedules', async () => {
  return {
    fetchSchedules: vi.fn(async () => { throw new Error('410 Gone: schedules_disabled'); }),
    reloadSchedules: vi.fn(async () => { throw new Error('410 Gone: schedules_disabled'); })
  };
});

describe('Schedules 页面 · 禁用(410)分支', () => {
  it('显示错误并在重试后仍然保持错误提示（后端禁用）', async () => {
    render(<SchedulesPage />);
    const alert = await screen.findByText(/410 Gone/i);
    expect(alert).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /重试|Retry/i });
    await userEvent.click(retry);
    // 仍有错误提示（因为后端仍返回 410）
    expect(await screen.findByText(/410 Gone/i)).toBeInTheDocument();
  });
});
