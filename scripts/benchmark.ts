/**
 * 性能基准测试脚本
 * 用于建立系统性能基准，为后续优化提供对比依据
 */

import { performance } from 'node:perf_hooks';
import { createOrchestratorService } from '../src/service/orchestrator/server.js';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  minMs: number;
  maxMs: number;
}

interface BenchmarkReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    totalMemory: string;
  };
  results: BenchmarkResult[];
}

/**
 * 计算百分位数
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 执行基准测试
 */
async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number
): Promise<BenchmarkResult> {
  const timings: number[] = [];

  console.log(`\n[基准测试] ${name} (${iterations} 次迭代)...`);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    timings.push(elapsed);

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r  进度: ${i + 1}/${iterations}`);
    }
  }

  process.stdout.write(`\r  完成: ${iterations}/${iterations}\n`);

  const totalMs = timings.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    p50: percentile(timings, 0.5),
    p95: percentile(timings, 0.95),
    p99: percentile(timings, 0.99),
    minMs: Math.min(...timings),
    maxMs: Math.max(...timings)
  };
}

/**
 * 基准测试：Plans 列表查询
 */
async function benchmarkPlansGet(baseUrl: string, iterations: number): Promise<BenchmarkResult> {
  return runBenchmark(
    'Plans GET /api/v1/plans',
    async () => {
      const res = await fetch(`${baseUrl}/plans`);
      await res.json();
    },
    iterations
  );
}

/**
 * 基准测试：Plans 创建
 */
async function benchmarkPlansCreate(baseUrl: string, iterations: number): Promise<BenchmarkResult> {
  return runBenchmark(
    'Plans POST /api/v1/plans',
    async () => {
      const plan = {
        id: `bench-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        version: 'v1',
        entry: 'root',
        nodes: [{ id: 'root', type: 'sequence', children: [] }]
      };
      const res = await fetch(`${baseUrl}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      await res.json();
    },
    iterations
  );
}

/**
 * 基准测试：Plans 读取单个
 */
async function benchmarkPlansGetById(baseUrl: string, planId: string, iterations: number): Promise<BenchmarkResult> {
  return runBenchmark(
    'Plans GET /api/v1/plans/:id',
    async () => {
      const res = await fetch(`${baseUrl}/plans/${planId}`);
      await res.json();
    },
    iterations
  );
}

/**
 * 基准测试：Executions 启动
 */
async function benchmarkExecutionStart(baseUrl: string, planId: string, iterations: number): Promise<BenchmarkResult> {
  return runBenchmark(
    'Executions POST /api/v1/plans/:id/execute',
    async () => {
      const res = await fetch(`${baseUrl}/plans/${planId}/execute`, {
        method: 'POST'
      });
      await res.json();
    },
    iterations
  );
}

/**
 * 基准测试：Executions 列表查询
 */
async function benchmarkExecutionsGet(baseUrl: string, iterations: number): Promise<BenchmarkResult> {
  return runBenchmark(
    'Executions GET /api/v1/executions',
    async () => {
      const res = await fetch(`${baseUrl}/executions`);
      await res.json();
    },
    iterations
  );
}

/**
 * 基准测试：并发执行
 */
async function benchmarkConcurrentExecution(baseUrl: string, planId: string, concurrency: number): Promise<BenchmarkResult> {
  const start = performance.now();

  console.log(`\n[基准测试] 并发执行 ${concurrency} 个 Plans...`);

  const tasks = Array.from({ length: concurrency }, async () => {
    const res = await fetch(`${baseUrl}/plans/${planId}/execute`, {
      method: 'POST'
    });
    return res.json();
  });

  await Promise.all(tasks);

  const elapsed = performance.now() - start;
  console.log(`  完成: ${concurrency} 个并发执行`);

  return {
    name: `并发执行 ${concurrency} Plans`,
    iterations: concurrency,
    totalMs: elapsed,
    avgMs: elapsed / concurrency,
    p50: elapsed / concurrency,
    p95: elapsed / concurrency,
    p99: elapsed / concurrency,
    minMs: elapsed / concurrency,
    maxMs: elapsed / concurrency
  };
}

/**
 * 生成基准报告
 */
function generateReport(results: BenchmarkResult[]): BenchmarkReport {
  return {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`
    },
    results
  };
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdown(report: BenchmarkReport): string {
  const { timestamp, environment, results } = report;

  let md = '# 性能基准测试报告\n\n';
  md += `**生成时间:** ${timestamp}\n\n`;
  md += '## 运行环境\n\n';
  md += `- **Node 版本:** ${environment.nodeVersion}\n`;
  md += `- **操作系统:** ${environment.platform}\n`;
  md += `- **架构:** ${environment.arch}\n`;
  md += `- **CPU 核心数:** ${environment.cpus}\n`;
  md += `- **总内存:** ${environment.totalMemory}\n\n`;

  md += '## 性能指标\n\n';
  md += '| 测试项 | 迭代次数 | 平均耗时 (ms) | P50 (ms) | P95 (ms) | P99 (ms) | 最小值 (ms) | 最大值 (ms) |\n';
  md += '|--------|----------|---------------|----------|----------|----------|-------------|-------------|\n';

  for (const result of results) {
    md += `| ${result.name} | ${result.iterations} | ${result.avgMs.toFixed(2)} | ${result.p50.toFixed(2)} | ${result.p95.toFixed(2)} | ${result.p99.toFixed(2)} | ${result.minMs.toFixed(2)} | ${result.maxMs.toFixed(2)} |\n`;
  }

  md += '\n## 解读\n\n';
  md += '- **平均耗时 (Avg)**: 所有请求的平均响应时间\n';
  md += '- **P50**: 50% 的请求在此时间内完成（中位数）\n';
  md += '- **P95**: 95% 的请求在此时间内完成\n';
  md += '- **P99**: 99% 的请求在此时间内完成\n';
  md += '- **最小值/最大值**: 最快和最慢的单次请求时间\n\n';
  md += '## 基准说明\n\n';
  md += '此基准测试在重构前运行，用于与后续优化结果对比。重点关注：\n\n';
  md += '1. **Plans CRUD 性能**: GET/POST 操作的响应时间\n';
  md += '2. **Executions 启动延迟**: 计划执行的启动速度\n';
  md += '3. **并发执行能力**: 系统处理并发请求的吞吐量\n';
  md += '4. **P95/P99 指标**: 尾部延迟，影响用户体验的关键指标\n';

  return md;
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('    性能基准测试');
  console.log('========================================\n');

  let app: FastifyInstance | null = null;
  let baseUrl = '';

  try {
    // 启动服务
    console.log('[启动] 创建 Orchestrator 服务...');
    const service = await createOrchestratorService({
      basePath: '/api/v1',
      controllerOptions: { defaultUseMockBridge: true }
    });
    app = service.app;

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    console.log(`[启动] 服务已启动: ${baseUrl}\n`);

    // 准备测试数据
    console.log('[准备] 创建测试 Plan...');
    const testPlan = {
      id: 'benchmark-test-plan',
      version: 'v1',
      entry: 'root',
      nodes: [
        { id: 'root', type: 'sequence', children: ['task'] },
        {
          id: 'task',
          type: 'local_task',
          driver: 'shell',
          command: 'node',
          args: ['-e', "process.stdout.write('ok')"],
          riskLevel: 'low'
        }
      ]
    };

    const createRes = await fetch(`${baseUrl}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: testPlan })
    });

    if (!createRes.ok) {
      throw new Error(`创建测试 Plan 失败: ${createRes.status}`);
    }

    console.log('[准备] 测试 Plan 创建成功\n');

    // 运行基准测试
    const results: BenchmarkResult[] = [];

    // Plans API 基准测试
    results.push(await benchmarkPlansGet(baseUrl, 100));
    results.push(await benchmarkPlansGetById(baseUrl, 'benchmark-test-plan', 100));
    results.push(await benchmarkPlansCreate(baseUrl, 50));

    // Executions API 基准测试
    results.push(await benchmarkExecutionStart(baseUrl, 'benchmark-test-plan', 20));
    results.push(await benchmarkExecutionsGet(baseUrl, 50));

    // 并发执行基准测试
    results.push(await benchmarkConcurrentExecution(baseUrl, 'benchmark-test-plan', 5));
    results.push(await benchmarkConcurrentExecution(baseUrl, 'benchmark-test-plan', 10));

    // 生成报告
    console.log('\n[报告] 生成基准报告...');
    const report = generateReport(results);
    const markdown = generateMarkdown(report);

    // 确保输出目录存在
    const outputDir = join(process.cwd(), '.codex');
    await mkdir(outputDir, { recursive: true });

    // 写入报告
    const reportPath = join(outputDir, 'performance-baseline.md');
    await writeFile(reportPath, markdown, 'utf-8');

    console.log(`[报告] 已保存到: ${reportPath}\n`);

    // 打印摘要
    console.log('========================================');
    console.log('    基准测试摘要');
    console.log('========================================\n');

    for (const result of results) {
      console.log(`${result.name}:`);
      console.log(`  平均: ${result.avgMs.toFixed(2)}ms, P95: ${result.p95.toFixed(2)}ms, P99: ${result.p99.toFixed(2)}ms`);
    }

    console.log('\n✅ 基准测试完成！');

  } catch (error) {
    console.error('\n❌ 基准测试失败:', error);
    process.exit(1);
  } finally {
    // 关闭服务
    if (app) {
      await app.close();
    }
  }
}

// 运行主函数
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
