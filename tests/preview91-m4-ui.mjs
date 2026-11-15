import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
const { startHost } = createRequire(import.meta.url)('../runtime/generated/host.cjs')
const directory = mkdtempSync(join(tmpdir(), 'hds-m4-ui-'))
const card = { name: '原主角', description: '原人设', personality: '', examples: '', systemPrompt: '', postHistoryInstructions: '', scenario: '原世界', firstMessage: '原开场', format: 'v2', warnings: [], raw: {} }
const settings = { activeCard: 'first', providers: [{ id: 'writer', preset: 'custom', label: '故事模型', endpoint: 'http://127.0.0.1:1/v1/chat/completions', model: 'fixture', protocol: 'chat-completions', enabled: true, useForMain: true, useForCompaction: true, useForAlter: true }], modelOptions: { mainStreamingMode: 'off', mainResponseFormat: 'json-object', mainTemperature: .8, mainMaxTokens: 4096, mainTimeout: 60000, mainPayloadOrder: 'cache-first', failoverEnabled: false, failoverStrategy: 'priority' }, userName: '我', userProfile: '原用户', autoAdvance: false }
const status = { state: 'healthy', installed: true, running: true, environmentState: 'ready', logs: [], device: { model: 'M4 browser', android: '15', sdk: 35, abi: 'arm64', pageSize: 4096, availableBytes: 1e10 }, version: 'Preview9.1' }
let host, browser, page, failApply = false
const requests = []
const heights = []
const gateway = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.end('{}'); return }
  try {
    let text = ''; for await (const chunk of req) text += chunk
    const { method, options = {} } = JSON.parse(text)
    let result = {}
    if (method === 'settings') result = settings
    else if (method === 'saveSettings') Object.assign(settings, options)
    else if (method === 'cards') result = { cards: [{ id: 'first', card, importedAt: new Date().toISOString() }] }
    else if (method === 'status') result = status
    else if (method === 'appearance') result = { font: 'default', fontSize: 14, backgroundOpacity: 35, panelOpacity: 92, backgroundBlur: 0, theme: 'light' }
    else if (method === 'notificationSettings') result = { enabled: false, permission: 'prompt', available: false }
    else if (method === 'voiceState') result = { voices: [], characters: {}, cooldown: 5 }
    else if (method === 'rpc') {
      requests.push(options)
      if (options.method === 'qq.conversations') result = { data: [] }
      else if (options.method === 'story.applySetting' && failApply) throw new Error('测试：保存设定失败')
      else result = { data: await host.dispatch(options.method, options.payload || {}) }
    }
    res.end(JSON.stringify(result))
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: error.message })) }
})
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const close = server => new Promise(resolve => server.close(resolve))
try {
  await listen(gateway)
  const reserve = createServer(); await listen(reserve); const port = reserve.address().port; await close(reserve)
  const config = { card, providers: settings.providers, modelOptions: settings.modelOptions, endpoint: settings.providers[0].endpoint, model: 'fixture', userName: '我', userProfile: '原用户', autoAdvance: false, token: 'preview91-m4-ui-private-host-token-longer-than-32', port, dataDir: directory }
  host = await startHost(config)
  const before = (await host.dispatch('story.snapshot', {})).story
  const history = await host.dispatch('messages.history', {})
  browser = await chromium.launch({ executablePath: process.env.HDS_BROWSER || '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', headless: true, args: process.env.HDS_BROWSER_LOW_RESOURCES === '1' ? ['--single-process', '--no-zygote', '--disable-gpu'] : [] })
  page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(20000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(url => {
    localStorage.setItem('hds.onboarding.v1', '1')
    window.androidBridge = {}
    const methods = ['settings', 'cards', 'status', 'saveSettings', 'appearance', 'notificationSettings', 'notificationLaunch', 'voiceState', 'rpc']
    window.Capacitor = { convertFileSrc: value => value, PluginHeaders: [{ name: 'HdsRuntime', methods: [...methods, 'addListener', 'removeListener'].map(name => ({ name, rtype: 'promise' })) }], nativePromise: async (_, method, options) => { if (method === 'addListener' || method === 'removeListener') return {}; 
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, options }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error); return result
    } }
  }, `http://127.0.0.1:${gateway.address().port}/native`)
  await page.goto(process.env.HDS_UI_URL || 'http://127.0.0.1:5173')
  console.log('M4: actual App and host loaded.')
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^模型与任务分工/ }).click()
  await page.getByRole('tab', { name: '高级与节奏', exact: true }).click()
  assert.equal(await page.locator('details details details').count(), 0)
  await page.screenshot({ path: 'artifacts/preview9.1-m4/life-world.png', fullPage: true })
  // All six shipped sections render from their schema and persist actual inputs.
  const expected = { schedulePreplan: true, timelineDirector: true, memory: true, worldSeeder: false, longHorizon: false, weather: false }
  for (const [key, enabled] of Object.entries(expected)) {
    console.log(`M4: inspecting ${key}.`)
    const group = page.locator(`[data-config-section="${key}"]`)
    await group.locator(':scope > summary').click()
    assert.ok(await page.locator('.space-detail').evaluate(element => element.getBoundingClientRect().height < innerHeight * 2), `${key} outer group stays about two screens`)
    assert.equal(await group.locator(':scope > label input[type=checkbox]').isChecked(), enabled, `${key} default switch`)
    assert.match(await group.locator(':scope > summary .tag').textContent(), enabled ? /已开启/ : /已关闭/)
    assert.ok(await group.locator(':scope > summary').evaluate(element => element.getBoundingClientRect().height >= 44))
    if (key !== 'timelineDirector') {
      await group.locator(':scope > details > summary').click()
      assert.ok(await group.locator('details').getByRole('spinbutton').count() > 0)
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 })
        const height = await page.locator('.space-detail').evaluate(element => element.getBoundingClientRect().height)
        heights.push({ section: key, width, height, viewportHeight: 844 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${key} advanced open @ ${width}: no horizontal overflow`)
        await group.locator(':scope > label input[type=checkbox]').scrollIntoViewIfNeeded()
        assert.equal(await page.locator('details details details').count(), 0)
      }
    }
    await group.locator(':scope > label input[type=checkbox]').setChecked(!enabled)
    await page.waitForFunction(({ key, enabled }) => document.querySelector(`[data-config-section="${key}"] > summary .tag`).textContent.includes(enabled ? '已关闭' : '已开启'), { key, enabled })
    if (key === 'memory') {
      const capped = group.locator('input[type=number][max="20"]')
      assert.equal(await capped.count(), 2)
      assert.deepEqual(await capped.evaluateAll(rows => rows.map(row => row.value)), ['20', '20'])
      assert.equal(await group.getByRole('checkbox', { name: '长期记忆向量检索', exact: true }).count(), 0)
      await group.getByText(/统一在「任务分工/).waitFor()
    }
    if (key === 'longHorizon') await group.getByRole('combobox').selectOption('moderate')
    await group.locator(':scope > summary').click()
  }
  console.log('M4: opening runtime story editor.')
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^角色与故事/ }).click()
  await page.getByRole('button', { name: '修改故事设定', exact: false }).click()
  const editor = page.getByRole('dialog', { name: '修改故事设定' })
  await editor.getByLabel('主角名称', { exact: true }).fill('星禾')
  await editor.getByLabel('主角人设', { exact: true }).fill('海边修理师')
  await editor.getByLabel('世界', { exact: true }).fill('海边小镇')
  await editor.getByLabel('关系', { exact: true }).fill('老朋友')
  await editor.getByLabel('视角', { exact: true }).fill('珍惜日常')
  await editor.getByLabel('故事时区', { exact: true }).fill('Asia/Tokyo')
  await editor.getByLabel('补充事实（每行一条）', { exact: true }).fill('修理铺在海边\n养了一只猫')
  failApply = true
  await editor.getByRole('button', { name: '保存故事设定' }).click()
  await editor.getByRole('alert').getByText('测试：保存设定失败').waitFor()
  assert.equal(await editor.getByLabel('主角名称').inputValue(), '星禾')
  assert.deepEqual((await host.dispatch('story.snapshot', {})).story.setting, before.setting)
  failApply = false
  await editor.getByRole('button', { name: '保存故事设定' }).click()
  await editor.waitFor({ state: 'detached' })
  const after = (await host.dispatch('story.snapshot', {})).story
  const patch = { character: { name: '星禾', profile: '海边修理师' }, world: '海边小镇', relationship: '老朋友', perspective: '珍惜日常', timezone: 'Asia/Tokyo', supplementaryFacts: ['修理铺在海边', '养了一只猫'] }
  for (const [key, value] of Object.entries(patch)) assert.deepEqual(after.setting[key], value)
  assert.equal(after.id, before.id)
  assert.deepEqual(after.setting.user, before.setting.user)
  assert.deepEqual(await host.dispatch('messages.history', {}), history)
  await page.getByRole('button', { name: '修改故事设定', exact: false }).click()
  await editor.getByLabel('主角名称').waitFor()
  assert.equal(await editor.getByLabel('主角名称').inputValue(), '星禾')
  await editor.getByLabel('世界', { exact: true }).fill('取消的世界')
  assert.equal(await page.evaluate(() => window.hdsHandleBack()), true)
  await editor.waitFor({ state: 'detached' })
  assert.equal((await host.dispatch('story.snapshot', {})).story.setting.world, '海边小镇')
  // 下拉菜单专注角色切换与人格库入口，故事设定统一保留在空间 -> 角色与故事中。
  await page.getByRole('button', { name: '故事', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '切换角色或故事', exact: true }).textContent(), '星禾⌄')
  await page.getByRole('button', { name: '切换角色或故事', exact: true }).click()
  await page.locator('.character-dropdown').waitFor()
  await page.getByRole('button', { name: '切换角色或故事', exact: true }).click()
  await page.locator('.character-dropdown').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^模型与任务分工/ }).click()
  await page.getByRole('tab', { name: '任务分工', exact: true }).click()
  await page.getByLabel('embedding 连接', { exact: true }).selectOption('writer')
  await page.getByRole('checkbox', { name: '启用向量检索', exact: true }).check()
  await page.getByRole('checkbox', { name: '对话中实时检索', exact: true }).check()
  await page.getByLabel('世界播种模型', { exact: true }).selectOption('writer')
  await page.getByText('已自动保存', { exact: true }).waitFor()
  assert.equal(settings.providers[0].useForEmbedding, true)
  assert.equal(settings.providers[0].useForWorldSeeding, true)
  assert.equal(settings.mobileConfig.sections.embedding.enabled, true)
  assert.equal(settings.mobileConfig.sections.embedding.liveQuery, true)
  for (const [key, enabled] of Object.entries(expected)) assert.equal(settings.mobileConfig.sections[key].enabled, !enabled)
  assert.equal(settings.mobileConfig.sections.longHorizon.intensity, 'moderate')
  assert.deepEqual(errors, [])
  await host.stop(); host = await startHost(config)
  assert.deepEqual((await host.dispatch('story.snapshot', {})).story.setting, after.setting, 'Editor writes survive host restart')
  mkdirSync('artifacts/preview9.1-m4', { recursive: true })
  writeFileSync('artifacts/preview9.1-m4/expanded-heights.json', JSON.stringify(heights, null, 2) + '\n')
  await page.screenshot({ path: 'artifacts/preview9.1-m4/model-tasks.png', fullPage: true })
  console.log('PASS M4: six schema-driven groups/defaults/switches/autosave, memory caps + vector controls, optional world model, actual App editor → RPC → HDS/SQLite snapshot, retry/cancel, history retention and restart persistence.')
} catch (error) {
  if (page) await page.screenshot({ path: 'artifacts/preview9.1-m4/m4-ui-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser?.close(); await host?.stop(); await close(gateway); rmSync(directory, { recursive: true, force: true })
}
