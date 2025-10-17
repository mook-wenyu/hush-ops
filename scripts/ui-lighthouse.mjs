#!/usr/bin/env node
// 轻量离线跑分脚本（本地使用）：node scripts/ui-lighthouse.mjs http://127.0.0.1:4173
// 依赖 npx 可用，无需将 lighthouse 写入依赖。
import { spawn } from 'node:child_process'

const url = process.argv[2] || 'http://127.0.0.1:4173'
const args = ['lighthouse', url, '--quiet', '--only-categories=performance', '--no-enable-error-reporting', '--chrome-flags=--headless=new']

const child = spawn('npx', args, { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
