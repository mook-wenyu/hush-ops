import { spawn } from 'node:child_process';
import http from 'node:http';

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function check() {
  const url = new URL('http://127.0.0.1:4173/');
  return new Promise((resolve) => {
    const req = http.get(url, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function main(){
  const preview = spawn(process.platform === 'win32' ? 'cmd' : 'bash',
    process.platform === 'win32'
      ? ['/c', 'vite', 'preview', '--config', 'vite.config.ts']
      : ['-lc', 'vite preview --config vite.config.ts'],
    { stdio: 'inherit' }
  );

  // 等待预览服务启动
  let ok = false;
  for (let i=0;i<30;i++) { // ~30s
    await wait(1000);
    ok = await check();
    if (ok) break;
  }

  // 结束预览进程
  preview.kill('SIGTERM');

  if (!ok) {
    console.error('[smoke] 预览健康检查失败');
    process.exit(1);
  }
  console.log('[smoke] 预览健康检查通过');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
