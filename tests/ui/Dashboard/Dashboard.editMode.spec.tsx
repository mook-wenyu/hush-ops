import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../../../src/ui/pages/Dashboard';

// 最小交互：切换编辑模式出现提示卡片

describe('Dashboard Edit Mode', () => {
  it('toggles edit mode and shows hint', async () => {
    render(<Dashboard />);
    const btn = await screen.findByRole('button', { name: /编辑器/i });
    fireEvent.click(btn);
    expect(await screen.findByText(/编辑模式已开启/i)).toBeTruthy();
  });
});
