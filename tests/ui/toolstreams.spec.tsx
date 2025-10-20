import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// mock services used by ToolStreamsPage
vi.mock('../../src/ui/services', async () => {
  return {
    buildGlobalToolStreamExportUrl: (id: string) => `/mock/${id}`,
    fetchGlobalToolStreamSummaries: vi.fn().mockResolvedValue({ total: 0, streams: [] }),
    fetchGlobalToolStreamChunks: vi.fn().mockResolvedValue([]),
  } as any;
});

import ToolStreamsPage from '../../src/ui/pages/ToolStreams';

describe('ToolStreamsPage', () => {
  beforeEach(() => {
    // reset URLSearchParams influence
    history.replaceState(null, '', '/');
  });

  it('默认开启“仅显示错误”', async () => {
    render(<ToolStreamsPage />);
    const checkbox = await screen.findByLabelText('仅显示错误');
    const input = checkbox as HTMLInputElement;
    expect(input.checked).toBe(true);
  });
});
