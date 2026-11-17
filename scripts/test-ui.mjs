import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

// 聚合全部 14 个移动端 UI 回归脚本，避免单跑聚合入口时漏测新增套件
const suites = [
  'story',
  'preview91-m4',
  'qq-policy',
  'share-persona',
  'm5',
  'import-code',
  'character-export',
  'retrieval',
  'typing',
  'media-controls',
  'message-diagnostics',
  'experience',
  'preview97',
  'preview971',
]

function resolveBrowserPath() {
  if (process.env.HDS_BROWSER && existsSync(process.env.HDS_BROWSER)) return process.env.HDS_BROWSER
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch { /* 忽略未安装内置浏览器的异常 */ }
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  return candidates.find(candidate => existsSync(candidate)) || ''
}

async function isPortReady(url) {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function ensureViteServer() {
  const url = 'http://127.0.0.1:5173'
  if (await isPortReady(url)) return null
  const viteCli = 'node_modules/vite/bin/vite.js'
  const child = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], {
    stdio: 'ignore',
    env: process.env,
  })
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await isPortReady(url)) return child
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error('本地 Vite 开发服务器 (127.0.0.1:5173) 启动超时')
}

const env = { ...process.env }
const browserPath = resolveBrowserPath()
if (browserPath) env.HDS_BROWSER = browserPath

let devServer = null
try {
  devServer = await ensureViteServer()
  const failures = []
  for (const name of suites) {
    const script = `tests/${name}-ui.mjs`
    console.log(`\n▶ Running ${script}...`)
    const result = spawnSync(process.execPath, [script], { stdio: 'inherit', env })
    if (result.status !== 0) failures.push(script)
  }
  if (failures.length) {
    console.error(`UI regressions failed: ${failures.join(', ')}`)
    process.exitCode = 1
  }
} finally {
  if (devServer) devServer.kill()
}
