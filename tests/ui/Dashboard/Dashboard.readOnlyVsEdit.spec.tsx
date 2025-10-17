import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, queryByText } from '@testing-library/react';
import Dashboard from '../../../src/ui/pages/Dashboard';

describe('Dashboard read-only vs edit toolbar visibility', () => {
  it('hides edit toolbar in read-only and shows it in edit mode', async () => {
    const { container } = render(<Dashboard />);
    // read-only 默认不应出现“连线”按钮
    expect(queryByText(container, '连线')).toBeNull();

    // 切换编辑
    const editBtn = await screen.findByRole('button', { name: /编辑器/i });
    fireEvent.click(editBtn);

    // 编辑态出现“连线”按钮
    expect(await screen.findByRole('button', { name: /连线/ })).toBeTruthy();
  });
});
