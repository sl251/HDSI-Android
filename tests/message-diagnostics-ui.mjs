import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'

const f = await characterFixture(true), { page } = f
await mkdir('artifacts/media-controls', { recursive: true })
try {
  await page.addInitScript(() => {
    const bridge = window.Capacitor, original = bridge.nativePromise
    bridge.PluginHeaders[0].methods.push({ name: 'saveMessageDiagnostics', rtype: 'promise' })
    fixture.diagnosticEvents = Array.from({ length: 125 }, (_, n) => ({ id: `fixture-event-${n}`, at: Date.now(), requestIds: ['fixture-request-first'], stage: 'model', outcome: 'failed', reason: 'provider_quota', providerSlot: 1 }))
    bridge.nativePromise = async (plugin, method, options) => {
      if (method === 'status') return { state: 'healthy', installed: true, environmentState: 'ready', running: true, logs: [], device: {} }
      if (method === 'saveMessageDiagnostics') { fixture.exportFilter = options; return { cancelled: true } }
      if (method === 'rpc') {
        if (options.method === 'diagnostics.messages') return { data: { events: fixture.diagnosticEvents, storageAvailable: true } }
        if (options.method === 'diagnostics.clear') { fixture.diagnosticEvents = []; fixture.cleared = true; return { data: { cleared: true } } }
        if (options.method === 'messages.history') return { data: [{ id: 'fixture-request-first', direction: 'user', content: '诊断测试消息', status: 'accepted', occurredAt: new Date().toISOString() }] }
        return { data: {} }
      }
      return original(plugin, method, options)
    }
  })
  await f.load()
  await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.getByText('诊断测试消息', { exact: true }).waitFor()
  assert.equal(await page.locator('.message-diagnostic-link').count(), 0)
  await page.getByText('诊断测试消息', { exact: true }).click({ button: 'right' })
  assert.equal(await page.getByRole('dialog', { name: '消息诊断', exact: true }).count(), 0)
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^备份、诊断与帮助/ }).click()
  await page.getByRole('tab', { name: '诊断与帮助', exact: true }).click()
  await page.getByRole('button', { name: /^消息诊断/ }).click()
  const dialog = page.getByRole('dialog', { name: '消息诊断', exact: true })
  await dialog.waitFor()
  assert.equal(await dialog.getByLabel('查看范围').inputValue(), '')
  await dialog.locator('ol > li').first().waitFor()
  await dialog.getByLabel('查看范围').selectOption('fixture-request-first')
  await dialog.locator('ol > li').first().waitFor()
  await dialog.getByRole('button', { name: /展开明细/ }).click()
  assert.equal(await dialog.locator('.diagnostic-events > li').count(), 100)
  await dialog.getByRole('button', { name: /显示更多明细/ }).click()
  assert.equal(await dialog.locator('.diagnostic-events > li').count(), 125)
  await dialog.getByRole('button', { name: '导出脱敏记录' }).click()
  await page.waitForFunction(() => fixture.exportFilter?.messageId === 'fixture-request-first')
  // Returning from a native picker can leave keyboard focus outside the modal.
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: /^消息诊断/ }).click()
  for (const width of [320, 360, 390, 740]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844)
    await page.screenshot({ path: `artifacts/media-controls/diagnostics-${width}.png` })
  }
  await dialog.getByRole('button', { name: '关闭消息诊断' }).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await dialog.locator('button:not(:disabled), select:not(:disabled)').last().evaluate(element => element === document.activeElement), true)
  await dialog.getByRole('button', { name: '清空本故事记录' }).click()
  await dialog.getByRole('button', { name: '确认清空', exact: true }).click()
  await page.waitForFunction(() => fixture.cleared)
  await dialog.getByText('一切正常，暂无诊断记录', { exact: true }).waitFor()
  await dialog.getByLabel('查看范围').selectOption('')
  await page.evaluate(() => { fixture.diagnosticEvents = [{ id: 'background-retrieval-fixture', at: Date.now(), requestIds: [], stage: 'embedding', outcome: 'fallback', reason: 'route_not_found', httpStatus: 404, count: 2 }] })
  await dialog.getByText('后台检索增强 · 1 条').waitFor()
  await dialog.getByText('后台检索增强 · 1 条').click()
  await dialog.getByText('HTTP 404', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '失败', exact: true }).click()
  assert.equal(await dialog.getByText('HTTP 404', { exact: true }).count(), 0, 'Optional retrieval degradation is separate from failed messages')
  assert.equal(await dialog.locator('.diagnostic-message-card').count(), 0, 'Background retrieval does not become a failed chat card')
  await page.evaluate(() => { fixture.diagnosticEvents = [{ id: 'image-event-fixture', at: Date.now(), requestIds: [], stage: 'image', outcome: 'failed', reason: 'image_verification', mediaJobId: 'avatar-image-operation', mediaPurpose: 'avatar', mediaProvider: 'imagefree', mediaApi: 'imagefree', mediaPhase: 'submit', httpStatus: 403 }] })
  await dialog.getByText(/头像生成 #/).waitFor()
  assert.equal(await dialog.locator('.diagnostic-message-card').count(), 1)
  await dialog.getByLabel('查看范围').selectOption('avatar-image-operation')
  await dialog.getByRole('button', { name: /展开明细/ }).click()
  await dialog.getByText('接口格式：Imagefree', { exact: true }).waitFor()
  await dialog.getByText('生图阶段：提交请求', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '导出脱敏记录' }).click()
  await page.waitForFunction(() => fixture.exportFilter?.messageId === 'avatar-image-operation')
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 })
    const pipeline = dialog.locator('.diagnostic-pipeline')
    const bounds = await pipeline.boundingBox(), step = await pipeline.locator('li').boundingBox()
    assert.ok(step.width >= bounds.width - 2, 'A standalone image task uses the available diagnostic width')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.screenshot({ path: 'artifacts/media-controls/image-diagnostics.png' })
  assert.equal(await page.evaluate(() => window.hdsHandleBack()), true)
  await dialog.waitFor({ state: 'detached' })
  assert.deepEqual(f.errors, [])
  console.log('PASS message diagnostics: space-only entry, pagination, export filter, 320/360/390/740 layouts, focus, clear and native back.')
} finally { await f.close() }
