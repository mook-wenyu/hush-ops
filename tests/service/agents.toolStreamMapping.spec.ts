import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createOrchestratorService } from '../../src/service/orchestrator/server.js';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Agents → ToolStream 审计（最小映射）', () => {
  let baseUrl = '';
  let close: null | (() => Promise<void>) = null;
  const prevAgents = process.env.AGENTS_ENABLED;
  const prevChatKit = process.env.CHATKIT_ENABLED;
  beforeEach(async () => {
    process.env.AGENTS_ENABLED = '1';
    process.env.CHATKIT_ENABLED = '1';
    const { app } = await createOrchestratorService({});
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
    close = async () => { await app.close(); };
  });
  afterEach(async () => {
    if (close) await close();
    process.env.AGENTS_ENABLED = prevAgents;
    process.env.CHATKIT_ENABLED = prevChatKit;
  });

  it('写入 /agents/session/messages 后可在 /tool-streams 中检索', async () => {
    const sessionKey = 's1';
    const res = await fetch(`${baseUrl}/agents/session/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey, message: 'hello' })
    });
    expect(res.status).toBe(200);

    const list = await fetch(`${baseUrl}/tool-streams?correlationPrefix=${encodeURIComponent('agents:'+sessionKey)}`);
    expect(list.status).toBe(200);
    const data = await list.json() as { streams: Array<{ correlationId: string, toolName: string }> };
    expect(Array.isArray(data.streams)).toBe(true);
    expect(data.streams.some(s => s.correlationId.startsWith('agents:'+sessionKey))).toBe(true);
  });

  it('POST /agents/tool-streams/report 可显式上报工具事件', async () => {
    const sessionKey = 's2';
    const cid = 'agents:' + sessionKey + ':tool-1';
    const res = await fetch(`${baseUrl}/agents/tool-streams/report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey, correlationId: cid, toolName: 'mcp.fs.read', status: 'success', message: 'ok' })
    });
    expect(res.status).toBe(200);

    const list = await fetch(`${baseUrl}/tool-streams?correlationPrefix=${encodeURIComponent('agents:'+sessionKey)}`);
    const data = await list.json() as { streams: Array<{ correlationId: string, toolName: string }> };
    expect(data.streams.some(s => s.correlationId === cid)).toBe(true);
  });
});
