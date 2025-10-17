import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createOrchestratorService } from '../src/service/orchestrator/index.ts';

async function* iterPlanFiles() {
  const cwd = process.cwd();
  const dirs = [join(cwd, 'plans'), join(cwd, '.hush-ops', 'config', 'plans')];
  for (const dir of dirs) {
    try {
      const s = await stat(dir); if (!s.isDirectory()) continue;
      for (const name of await readdir(dir)) {
        if (name.toLowerCase().endsWith('.json')) yield { dir, name, path: join(dir, name) };
      }
    } catch {}
  }
}

async function main() {
  const { controller } = await createOrchestratorService({ basePath: '/api/v1' });
  let ok = 0, fail = 0;
  const results = [];
  for await (const f of iterPlanFiles()) {
    try {
      const raw = await readFile(f.path, 'utf-8');
      const plan = JSON.parse(raw);
      await controller.validate({ plan });
      results.push({ file: f.path, status: 'ok' });
      ok++;
    } catch (e) {
      results.push({ file: f.path, status: 'fail', message: (e?.message ?? String(e)) });
      fail++;
    }
  }
  console.log(JSON.stringify({ ok, fail, results }, null, 2));
  if (fail > 0) process.exitCode = 1;
}

main().catch((e)=>{ console.error(e); process.exit(2); });
