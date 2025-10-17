import { describe, it, expect } from 'vitest';
import { appendMessage, getThread, clearThread, exportThread, importThread } from '../../src/service/orchestrator/agents/memoryStore.js';

const SK = 'spec-session';

describe('MemoryStore(JSONL)', () => {
  it('append/get/clear/export/import', async () => {
    await clearThread(SK);
    await appendMessage(SK, { role: 'user', content: 'hello', ts: new Date().toISOString() });
    const t1 = await getThread(SK);
    expect(t1.messages.length).toBeGreaterThanOrEqual(1);
    const jsonl = await exportThread(SK);
    expect(jsonl).toContain('"content":"hello"');
    await clearThread(SK);
    const t2 = await getThread(SK);
    expect(t2.messages.length).toBe(0);
    const res = await importThread(SK, jsonl, { replace: true });
    expect(res.imported).toBeGreaterThan(0);
    const t3 = await getThread(SK);
    expect(t3.messages.length).toBeGreaterThan(0);
  });
});