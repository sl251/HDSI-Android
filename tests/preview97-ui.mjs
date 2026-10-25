import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'

const f = await characterFixture(true), { page } = f
await mkdir('artifacts/preview97-ui', { recursive: true })
try {
  await page.addInitScript(() => {
    const original = Capacitor.nativePromise
    Capacitor.PluginHeaders[0].methods.push(...['powerSettings', 'savePowerSettings', 'experienceSettings', 'saveSettings', 'start', 'syncStickerLibrary'].map(name => ({ name, rtype: 'promise' })))
    const setup = new URL(location.href).searchParams.has('setup')
    fixture.ready = !setup; fixture.mode = 'continuous'; fixture.statusReads = 0; fixture.testCalls = 0; fixture.failTest = true
    fixture.provider = { id: 'primary', preset: 'custom', label: '测试连接', endpoint: 'https://fixture.test/v1', model: 'test', protocol: 'chat-completions', enabled: true, credentialPresent: true, useForMain: true, useForCompaction: true, useForAlter: true }
    fixture.messages = setup ? [] : Array.from({ length: 250 }, (_, index) => ({ id: `record-${String(index).padStart(4, '0')}`, direction: index % 2 ? 'character' : 'user', status: index % 2 ? 'delivered' : 'accepted', content: index === 7 ? 'Needle.* 一段旧回忆' : `聊天记录 ${index}`, occurredAt: new Date(1700000000000 + index * 1000).toISOString() }))
    Capacitor.nativePromise = async (plugin, method, options) => {
      if (method === 'settings') return { ...(await original(plugin, method, options)), providers: [fixture.provider] }
      if (method === 'status') { fixture.statusReads++; return { ...(await original(plugin, method, options)), state: fixture.ready ? 'healthy' : 'stopped', running: fixture.ready } }
      if (method === 'start') { fixture.ready = true; return {} }
      if (method === 'saveSettings' || method === 'syncStickerLibrary') return {}
      if (method === 'powerSettings') return { mode: fixture.mode }
      if (method === 'savePowerSettings') { if (fixture.failPower) throw new Error('后台模式保存失败'); fixture.mode = options.mode; return { mode: fixture.mode } }
      if (method === 'experienceSettings') return {}
      if (method === 'rpc') {
        const p = options.payload ?? {}
        if (options.method === 'messages.history') {
          if (fixture.failSearch && p.query === 'needle.*') throw new Error('搜索暂时失败')
          let rows = fixture.messages.filter(row => (!p.query || row.content.toLowerCase().includes(p.query.toLowerCase())) && (!p.until || row.occurredAt < p.until))
          if (p.before) rows = rows.filter(row => row.occurredAt < p.before.occurredAt || row.occurredAt === p.before.occurredAt && row.id < p.before.id)
          return { data: structuredClone(rows.slice(-(p.limit ?? 200))) }
        }
        if (options.method === 'experience.snapshot') return { data: { posts: [], streams: [], jobs: [] } }
        if (options.method === 'diagnostics.messages') return { data: { events: [], storageAvailable: true } }
        if (options.method === 'qq.conversations') return { data: [] }
        if (options.method === 'models.test') { fixture.testCalls++; if (fixture.failTest) throw new Error('测试连接失败'); return { data: { message: '连接成功' } } }
        if (options.method === 'messages.sendLocal') { fixture.messages.push({ id: p.requestId, direction: 'user', content: p.content, status: 'accepted', occurredAt: new Date().toISOString() }); return { data: { accepted: true } } }
        if (options.method === 'config.schema') return { data: { sections: [] } }
        return { data: {} }
      }
      return original(plugin, method, options)
    }
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await f.load(); await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.message[data-read-anchor]').length === 50)
  const older = page.getByRole('button', { name: '加载更早消息', exact: true })
  await older.scrollIntoViewIfNeeded()
  const anchor = page.locator('[data-read-anchor="message-record-0200"]')
  const before = await anchor.evaluate(element => element.getBoundingClientRect().top)
  await older.click(); await page.waitForFunction(() => document.querySelectorAll('.message[data-read-anchor]').length === 100)
  assert.ok(Math.abs((await anchor.evaluate(element => element.getBoundingClientRect().top)) - before) < 3, 'prepending keeps the reading anchor')
  for (const count of [150, 200, 250]) { await older.click(); await page.waitForFunction(value => document.querySelectorAll('.message[data-read-anchor]').length === value, count) }
  await older.scrollIntoViewIfNeeded()
  const oldest = page.locator('[data-read-anchor="message-record-0000"]')
  const endPosition = await oldest.evaluate(element => element.getBoundingClientRect().top)
  await older.click(); await older.waitFor({ state: 'detached' })
  const afterEnd = await oldest.evaluate(element => ({ top: element.getBoundingClientRect().top, y: scrollY }))
  assert.ok(Math.abs(afterEnd.top - endPosition) < 3, `the empty final page also consumes the reading anchor: ${endPosition} -> ${JSON.stringify(afterEnd)}`)
  assert.equal(await older.count(), 0)
  await page.getByRole('button', { name: '查找聊天记录', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '查找聊天记录' })
  await dialog.getByRole('button', { name: '查找记录', exact: true }).click()
  await dialog.getByText('已找到 50 条，可继续加载', { exact: true }).waitFor()
  await page.evaluate(() => { fixture.failSearch = true })
  await dialog.getByLabel('关键词').fill('needle.*')
  await dialog.getByRole('button', { name: '查找记录', exact: true }).click()
  await dialog.getByText('搜索暂时失败', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '继续查找更早记录', exact: true }).click()
  await dialog.getByText('已找到 100 条，可继续加载', { exact: true }).waitFor()
  assert.equal(await dialog.locator('.history-results article').count(), 100, 'failed new search retains the successful query for pagination')
  await page.evaluate(() => { fixture.failSearch = false })
  await dialog.getByLabel('关键词').fill('needle.*')
  await dialog.getByRole('button', { name: '查找记录', exact: true }).click()
  await dialog.getByText('Needle.* 一段旧回忆', { exact: true }).waitFor()
  assert.equal(await dialog.locator('.history-results article').count(), 1)
  assert.equal(await page.locator('.app').evaluate(element => element.inert), true)
  await page.setViewportSize({ width: 320, height: 740 })
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await page.screenshot({ path: 'artifacts/preview97-ui/history-search-320.png' })
  await dialog.getByLabel('关键词').fill('')
  await dialog.getByLabel('日期').fill('2023-11-13')
  await dialog.getByRole('button', { name: '查找记录', exact: true }).click()
  await dialog.getByText('已找到 0 条', { exact: true }).waitFor()
  // Chromium/Linux can blur a submit button when it is disabled during a read.
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  assert.equal(await page.locator('.app').evaluate(element => element.inert), false)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!fixture.hidden }); fixture.hidden = true; document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(200)
  const hiddenReads = await page.evaluate(() => fixture.statusReads)
  await page.waitForTimeout(3400)
  assert.equal(await page.evaluate(() => fixture.statusReads), hiddenReads, 'hidden UI does not poll status')
  await page.evaluate(() => { fixture.hidden = false; document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForFunction(count => fixture.statusReads > count, hiddenReads)
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^持续生活/ }).click()
  await page.getByLabel('后台运行方式').selectOption('balanced')
  await page.waitForFunction(() => fixture.mode === 'balanced')
  await page.evaluate(() => { fixture.failPower = true })
  await page.getByLabel('后台运行方式').selectOption('continuous')
  await page.getByText('后台模式保存失败', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('后台运行方式').inputValue(), 'balanced')
  await page.screenshot({ path: 'artifacts/preview97-ui/power-320.png' })

  const url = new URL(page.url()); url.search = '?setup'
  await page.goto(url.href)
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^首次对话准备/ }).click()
  const setup = page.getByRole('region', { name: '首次对话准备' })
  await setup.getByRole('button', { name: '测试连接', exact: true }).click()
  await page.getByText('测试连接失败', { exact: true }).waitFor()
  assert.equal(await setup.getByText('聊天连接已测试', { exact: true }).count(), 0)
  await page.evaluate(() => { fixture.failTest = false })
  await setup.getByRole('button', { name: '测试连接', exact: true }).click()
  await setup.getByText('聊天连接已测试', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => fixture.testCalls), 2)
  await setup.getByRole('button', { name: '唤醒故事', exact: true }).click()
  await setup.getByText('故事已唤醒', { exact: true }).waitFor()
  await page.screenshot({ path: 'artifacts/preview97-ui/quick-start-320.png' })
  await page.getByRole('textbox', { name: '消息内容' }).fill('第一句话')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.waitForFunction(() => fixture.messages.length === 1)
  assert.equal(await setup.count(), 1, 'accepted input alone does not complete the guide')
  await page.evaluate(() => { fixture.messages.push({ id: 'actual-reply', direction: 'character', status: 'delivered', content: '你好，故事开始了。', occurredAt: new Date().toISOString() }); document.dispatchEvent(new Event('visibilitychange')) })
  await setup.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => localStorage.getItem('hds.quickstart.v1')), '1')
  assert.deepEqual(f.errors, [])
  console.log('PASS Preview 9.7: 250 messages including an empty final page, stable reading anchor, literal/date search, 320px layout, hidden polling, power save errors, real-action onboarding and reply completion.')
} finally { await f.close() }
