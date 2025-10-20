import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../../../src/ui/pages/Dashboard';

// 最小交互：切换编辑模式出现提示卡片

describe('Dashboard Edit Mode', () => {
  it('toggles to editor view', async () => {
    render(<Dashboard />);
    const btn = await screen.findByRole('button', { name: /编辑器/i });
    fireEvent.click(btn);
    // 编辑器视图加载后应出现“执行计划”按钮或 MCP 服务器选择
    expect(await screen.findByRole('button', { name: /执行计划|执行/i })).toBeTruthy();
  });
});
