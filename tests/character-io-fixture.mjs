import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { existsSync, readFileSync } from 'node:fs'

function resolveBrowserLaunch() {
  if (process.env.HDS_BROWSER) return { executablePath: process.env.HDS_BROWSER, headless: true }
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return { executablePath: bundled, headless: true }
  } catch { /* 未安装内置 Chromium 时回退系统 Edge */ }
  return { channel: 'msedge', headless: true }
}

export async function characterFixture(styles = false) {
  const bundle = await build({ entryPoints: ['apps/mobile-ui/main.tsx'], outfile: 'app.js', bundle: true, write: false, format: 'esm', platform: 'browser', loader: styles ? {} : { '.css': 'empty' }, tsconfig: 'tsconfig.json' })
  const server = createServer((req, res) => {
    if (req.url === '/fixture.gif') { res.setHeader('Content-Type', 'image/gif'); res.end(readFileSync('fixtures/images/sticker-fixture.gif')); return }
    const file = bundle.outputFiles.find(file => file.path.replaceAll('\\', '/').endsWith(req.url))
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html; charset=utf-8')
    res.end(file?.text ?? (req.url === '/app.css' ? '' : '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>'))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch(resolveBrowserLaunch())
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('hds.onboarding.v1', '1')
    const card = { format: 'v2', name: '已有角色', description: '已编辑的人设', personality: '', scenario: '', firstMessage: '你好', alternateGreetings: ['晚安'], examples: '', systemPrompt: '', postHistoryInstructions: '', creatorNotes: '', warnings: [], raw: { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '旧名字', description: '旧人设', extensions: { safe: true, apiKey: 'SECRET' } } } }
    const empty = new URL(location.href).searchParams.has('empty')
    const f = window.fixture = { calls: [], cards: empty ? [] : [{ id: 'first', importedAt: new Date().toISOString(), card }], exported: [], selected: empty ? '' : 'first', failSave: false, failSelect: false, exportMode: '', hold: false, release: null,
      share: { code: 'ABCDEFGH', title: '分享的角色', revision: 1, sections: ['agency', 'storyDefaults'], payload: { agency: { enabled: true }, storyDefaults: { characterName: '星禾', characterProfile: '修理师' } } } }
    const methods = ['settings', 'cards', 'saveCard', 'selectCard', 'pickCard', 'exportCharacter', 'status', 'appearance', 'notificationSettings', 'notificationLaunch', 'voiceState', 'rpc']
    window.androidBridge = {}
    window.Capacitor = { PluginHeaders: [{ name: 'HdsRuntime', methods: [...methods, 'addListener', 'removeListener'].map(name => ({ name, rtype: 'promise' })) }, { name: 'CapacitorHttp', methods: [{ name: 'get', rtype: 'promise' }] }], nativePromise: async (plugin, method, options) => {
      f.calls.push({ plugin, method, options: structuredClone(options) })
      if (plugin === 'CapacitorHttp') { if (f.hold) await new Promise(resolve => { f.release = resolve }); if (f.httpError) throw new Error(f.httpError); return { status: 200, data: f.share, headers: {}, url: options.url } }
      if (method === 'settings') return { activeCard: f.selected, providers: [], modelOptions: {}, mobileConfig: { sections: { agency: { enabled: true } } }, userName: '我', userProfile: '', autoAdvance: false }
      if (method === 'cards') return { cards: structuredClone(f.cards) }
      if (method === 'saveCard') { if (f.failSave) throw new Error('测试：保存失败'); let row = f.cards.find(row => row.source === options.base64); if (!row) { row = { id: `imported-${f.cards.length}`, importedAt: new Date().toISOString(), card: options.card, source: options.base64 }; f.cards.push(row) }; return structuredClone(row) }
      if (method === 'selectCard') { if (f.failSelect) throw new Error('测试：切换失败'); f.selected = options.id; return {} }
      if (method === 'pickCard') return { base64: btoa(unescape(encodeURIComponent(JSON.stringify({ name: '文件角色', description: '文件人设' })))) }
      if (method === 'exportCharacter') { f.exported.push(options); if (f.hold) await new Promise(resolve => { f.release = resolve }); if (f.exportMode === 'error') throw new Error('测试：写入失败'); return { cancelled: f.exportMode === 'cancel', name: options.filename } }
      if (method === 'status') return { state: 'stopped', installed: true, environmentState: 'ready', running: false, logs: [], device: {} }
      if (method === 'appearance') return { font: 'default', fontSize: 14, backgroundOpacity: 35, panelOpacity: 92, backgroundBlur: 0, theme: 'light' }
      if (method === 'notificationSettings') return { enabled: false, permission: 'prompt', available: false }
      if (method === 'voiceState') return { voices: [], characters: {}, defaultVoiceId: '', cooldown: 5, credentialPresent: false }
      if (method === 'rpc') throw new Error('请先启动 HDS')
      return {}
    } }
  })
  const load = async (empty = false) => {
    await page.goto(`http://127.0.0.1:${server.address().port}/${empty ? '?empty' : ''}`)
    await page.getByRole('button', { name: '切换角色或故事', exact: true }).click()
    await page.getByRole('button', { name: '导入、创建与管理角色', exact: true }).click()
  }
  return { page, errors, load, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)) } }
}
