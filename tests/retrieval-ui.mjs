import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'
const f = await characterFixture(true), { page } = f
try {
  await mkdir('artifacts/typing-tasks', { recursive: true })
  await page.addInitScript(() => {
    const original = window.Capacitor.nativePromise
    fixture.probes = []; fixture.probeHold = false
    fixture.settings = { activeCard: 'first', providers: [{ id: 'primary', preset: 'custom', label: '测试连接', endpoint: 'https://example.invalid/v1/chat/completions', model: 'chat-fixture', protocol: 'chat-completions', enabled: true, credentialPresent: true, useForMain: true, useForCompaction: true, useForAlter: true, useForEmbedding: true }], modelOptions: {}, mobileConfig: { sections: {} }, userName: '我', userProfile: '', autoAdvance: false }
    window.Capacitor.PluginHeaders[0].methods.push({ name: 'saveSettings', rtype: 'promise' })
    window.Capacitor.nativePromise = async (plugin, method, options) => {
      if (method === 'settings') return structuredClone(fixture.settings)
      if (method === 'saveSettings') { fixture.settings = structuredClone(options); return {} }
      if (method === 'rpc' && options.method === 'models.testRetrieval') {
        if (fixture.probeFailure) throw new Error('模型测试进程清理失败，请重启应用')
        fixture.probes.push(structuredClone(options.payload)); if (fixture.probeHold) await new Promise(r => { fixture.releaseProbe = r })
        return { data: { ok: true, task: options.payload.task, category: 'succeeded', elapsedMs: 12, ...(options.payload.task === 'embedding' ? { vectorDimensions: 3 } : { resultCount: 2 }) } }
      }
      return original(plugin, method, options)
    }
  })
  await f.load(); await page.getByRole('button', { name: '空间', exact: true }).click(); await page.getByRole('button', { name: /^模型与任务分工/ }).click()
  assert.equal(await page.getByRole('button', { name: '测试聊天连接', exact: true }).count(), 1)
  assert.equal(await page.getByLabel('embedding 连接').count(), 0)
  await page.getByRole('tab', { name: '任务分工', exact: true }).click()
  const section = page.getByRole('region', { name: '向量与重排序' })
  await section.getByText('向量与重排序', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '测试聊天连接', exact: true }).count(), 0)
  assert.equal(await section.getByLabel('启用重排序', { exact: true }).isChecked(), false)
  assert.equal(await section.getByLabel('embedding 连接').inputValue(), 'primary', 'Legacy flag is reflected by the single task selector')
  await section.getByLabel('embedding 连接').selectOption('')
  await page.waitForFunction(() => fixture.settings.providers[0].useForEmbedding === false)
  await section.getByLabel('embedding 连接').selectOption('primary')
  await page.waitForFunction(() => fixture.settings.mobileConfig.sections.embedding.providerId === 'primary' && fixture.settings.providers[0].useForEmbedding === true)
  await section.getByLabel('embedding 模型名').fill('vector-fixture'); await section.getByLabel('embedding 完整端点').fill('https://example.invalid/v1/embeddings')
  await page.evaluate(() => { fixture.probeHold = true })
  await section.getByRole('button', { name: '测试向量连接', exact: true }).click(); await page.waitForFunction(() => fixture.probes.length === 1)
  await section.getByLabel('embedding 模型名').fill('changed-fixture'); await page.evaluate(() => fixture.releaseProbe())
  await section.getByText(/对应之前的配置/).waitFor()
  const first = await page.evaluate(() => fixture.probes[0]); assert.equal(first.mobileConfig.sections.embedding.model, 'vector-fixture'); assert.equal(first.task, 'embedding')
  await section.getByLabel('rerank 连接').selectOption('primary'); await section.getByLabel('rerank 模型名').fill('ranker-fixture'); await page.evaluate(() => { fixture.probeHold = false })
  await section.getByRole('button', { name: '测试重排序连接', exact: true }).click(); await section.getByText(/返回 2 条/).waitFor()
  assert.equal((await page.evaluate(() => fixture.probes[1])).task, 'rerank')
  await page.evaluate(() => { fixture.probeFailure = true })
  await section.getByRole('button', { name: '测试重排序连接', exact: true }).click()
  await section.getByText('模型测试进程清理失败，请重启应用。', { exact: true }).waitFor()
  assert.equal(await section.locator('[data-retrieval-task=rerank]').getByText(/测试成功/).count(), 0, 'A failed new probe must not retain an old success')
  await page.getByRole('checkbox', { name: '开启图片理解' }).check()
  await page.getByLabel('识图模型', { exact: true }).selectOption('primary')
  await page.getByLabel('图片输入能力 · 测试连接').selectOption('supported')
  await page.waitForFunction(() => fixture.settings.providers[0].imageInput === 'supported' && fixture.settings.modelOptions.visionProviderId === 'primary')
  await page.getByRole('tab', { name: '模型连接', exact: true }).click()
  assert.equal(await page.getByLabel('识图模型', { exact: true }).count(), 0)
  assert.equal(await page.getByLabel('图片输入能力 · 测试连接').count(), 0)
  await page.getByLabel('模型名称', { exact: true }).fill('replacement-chat')
  await page.getByLabel('模型名称', { exact: true }).blur()
  await page.waitForFunction(() => fixture.settings.providers[0].imageInput === 'unknown')
  await page.getByRole('tab', { name: '任务分工', exact: true }).click()
  assert.equal(await page.getByLabel('识图模型', { exact: true }).inputValue(), 'primary')
  assert.equal(await page.getByLabel('图片输入能力 · 测试连接').inputValue(), 'unknown')
  for (const width of [320, 390, 740]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: `artifacts/typing-tasks/tasks-${width}.png`, fullPage: true }) }
  assert.deepEqual(f.errors, [])
  console.log('PASS retrieval UI: independent switches, text fields, chat/retrieval labels, frozen probe snapshot, stale result, rerank test and responsive layouts')
} finally { await f.close() }
