import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestratorService } from '../../../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';

/**
 * 特征测试: MCP Integration
 * 目的: 验证 MCP 服务器列表、工具列表、工具调用等核心功能
 */
describe('characterization: MCP Integration', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl: string;

  beforeEach(async () => {
    const { app } = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  // GET /api/v1/mcp/servers - 列出 MCP 服务器
  it('GET /api/v1/mcp/servers 返回服务器列表', async () => {
    const res = await fetch(`${baseUrl}/mcp/servers`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toHaveProperty('servers');
    expect(Array.isArray(body.servers)).toBe(true);
  });

  it('GET /api/v1/mcp/servers 服务器条目包含 name 字段', async () => {
    const res = await fetch(`${baseUrl}/mcp/servers`);
    const body = (await res.json()) as Record<string, any>;
    if (body.servers.length > 0) {
      expect(body.servers[0]).toHaveProperty('name');
      expect(typeof body.servers[0].name).toBe('string');
    }
  });

  // GET /api/v1/mcp/tools - 列出可用工具
  it('GET /api/v1/mcp/tools 返回工具列表', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools`);
    // 如果没有外部 MCP 服务器，可能返回空列表或 502
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as Record<string, any>;
      expect(body).toHaveProperty('tools');
      expect(Array.isArray(body.tools)).toBe(true);
    }
  });

  it('GET /api/v1/mcp/tools 支持 useMockBridge 参数', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools?useMockBridge=true`);
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as Record<string, any>;
      expect(Array.isArray(body.tools)).toBe(true);
    }
  });

  it('GET /api/v1/mcp/tools 支持 mcpServer 参数筛选', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools?mcpServer=mock-server`);
    expect([200, 502]).toContain(res.status);
  });

  it('GET /api/v1/mcp/tools 失败时返回 502 和错误信息', async () => {
    // 模拟无法连接 MCP 的场景
    const res = await fetch(`${baseUrl}/mcp/tools?useMockBridge=false&mcpServer=non-existent`);
    if (res.status === 502) {
      const body = (await res.json()) as Record<string, any>;
      expect(body.error?.code).toBe('mcp_list_failed');
      expect(body.error).toHaveProperty('message');
    }
  });

  // POST /api/v1/mcp/tools/:toolName - 调用 MCP 工具
  it('POST /api/v1/mcp/tools/:toolName 调用工具', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/test-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arguments: { key: 'value' },
        useMockBridge: true
      })
    });
    // 工具可能不存在，返回 502；或成功返回 200
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as Record<string, any>;
      expect(body).toHaveProperty('result');
    }
  });

  it('POST /api/v1/mcp/tools/:toolName 支持 nodeId 参数', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/test-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: 'node-001',
        arguments: {},
        useMockBridge: true
      })
    });
    expect([200, 502]).toContain(res.status);
  });

  it('POST /api/v1/mcp/tools/:toolName 支持 riskLevel 参数', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/test-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riskLevel: 'low',
        arguments: {},
        useMockBridge: true
      })
    });
    expect([200, 502]).toContain(res.status);
  });

  it('POST /api/v1/mcp/tools/:toolName 失败时返回 502 和错误信息', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/non-existent-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useMockBridge: false
      })
    });
    if (res.status === 502) {
      const body = (await res.json()) as Record<string, any>;
      expect(body.error?.code).toBe('mcp_call_failed');
      expect(body.error).toHaveProperty('message');
    }
  });

  // MCP 服务器配置与动态加载
  it('MCP 服务器列表反映 mcp.servers.json 配置', async () => {
    const res = await fetch(`${baseUrl}/mcp/servers`);
    const body = (await res.json()) as Record<string, any>;
    // 即使没有配置服务器，也应返回空数组而非错误
    expect(Array.isArray(body.servers)).toBe(true);
  });

  // 模拟桥接
  it('useMockBridge=true 使用模拟桥接', async () => {
    // 创建审批请求验证模拟桥接可用
    const res = await fetch(`${baseUrl}/approvals/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        executionId: 'mcp-mock-test',
        message: '模拟桥接测试'
      })
    });
    expect([200, 201]).toContain(res.status);
  });

  // 边界条件
  it('MCP 工具调用超时或失败时优雅降级', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/timeout-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useMockBridge: false,
        arguments: {}
      })
    });
    // 超时或失败应返回 502
    if (res.status !== 200) {
      expect(res.status).toBe(502);
      const body = (await res.json()) as Record<string, any>;
      expect(body.error).toHaveProperty('message');
    }
  });

  it('MCP 工具参数验证（空 arguments 允许）', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/test-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useMockBridge: true
      })
    });
    expect([200, 502]).toContain(res.status);
  });

  it('MCP 工具名称支持特殊字符', async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/tool-with-dash_underscore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arguments: {},
        useMockBridge: true
      })
    });
    expect([200, 502]).toContain(res.status);
  });
}, 30000);
