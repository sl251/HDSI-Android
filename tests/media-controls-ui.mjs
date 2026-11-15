import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'
const f = await characterFixture(true), { page } = f
await mkdir('artifacts/media-controls', { recursive: true })
try {
  await page.addInitScript(() => {
    const bridge = window.Capacitor, original = bridge.nativePromise
    bridge.convertFileSrc = () => '/fixture.gif'
    for (const name of ['pickStickers', 'pruneStickers', 'syncStickerLibrary', 'saveSettings']) bridge.PluginHeaders[0].methods.push({ name, rtype: 'promise' })
    fixture.mediaCalls = []
    bridge.nativePromise = async (plugin, method, options) => {
      if (method === 'settings') return { ...(await original(plugin, method, options)), providers: [{ id: 'vision', endpoint: 'https://example.com/v1', model: 'vision', enabled: true, useForMain: true, useForCompaction: true, useForAlter: true, imageInput: 'supported' }], modelOptions: { visionEnabled: localStorage.getItem('test-vision') === 'on' } }
      if (['pickStickers', 'pruneStickers', 'syncStickerLibrary', 'saveSettings'].includes(method)) {
        fixture.mediaCalls.push(method)
        if (method === 'syncStickerLibrary' && fixture.failSync) throw new Error('测试：表情包清单同步失败')
        if (method === 'pickStickers') {
          if (fixture.holdPicker) await new Promise(resolve => { fixture.releasePicker = resolve })
          return fixture.cancelPicker ? { cancelled: true } : { cancelled: false, name: '开心的小动物与晚安表情', assets: [0, 1].map(() => ({ id: 'a'.repeat(64), path: '/fixture.gif', size: 2048, mime: 'image/gif' })) }
        }
        return {}
      }
      return original(plugin, method, options)
    }
  })
  const open = async () => {
    await page.getByRole('button', { name: '空间', exact: true }).click()
    await page.getByRole('button', { name: /^聊天与输入/ }).click()
    await page.getByRole('button', { name: /^表情包管理/ }).click()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await f.load(); await open()
  const dialog = page.getByRole('dialog', { name: '表情包管理' })
  const importImages = () => dialog.getByRole('button', { name: '多选图片导入', exact: true })
  assert.equal(await importImages().isDisabled(), true)
  await dialog.getByRole('alert').getByText(/开启图片理解/).waitFor()
  assert.equal(await page.evaluate(() => fixture.mediaCalls.includes('pickStickers')), false)
  await page.screenshot({ path: 'artifacts/media-controls/vision-required.png' })
  await dialog.getByRole('button', { name: '去设置识图模型' }).click()
  await page.locator('[data-settings-category="tasks"]').waitFor()
  await page.evaluate(() => localStorage.setItem('test-vision', 'on'))
  await f.load(); await open()
  await page.evaluate(() => { fixture.cancelPicker = true; fixture.holdPicker = true }); await importImages().click()
  await page.waitForFunction(() => !!fixture.releasePicker)
  assert.equal(await page.evaluate(() => window.hdsHandleBack()), true)
  assert.equal(await dialog.isVisible(), true, 'Back cannot dismiss a pending import')
  await page.evaluate(() => { fixture.holdPicker = false; fixture.releasePicker() })
  await dialog.getByText('正在处理表情包…').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.sticker-group').count(), 0)
  await page.evaluate(() => { fixture.cancelPicker = false; fixture.failSync = true; fixture.mediaCalls = [] }); await importImages().click()
  await dialog.getByRole('status').filter({ hasText: '测试：表情包清单同步失败' }).waitFor()
  assert.equal(await page.evaluate(() => fixture.mediaCalls.includes('pruneStickers')), false)
  await page.evaluate(() => { fixture.failSync = false; fixture.mediaCalls = [] }); await importImages().click()
  await dialog.getByRole('status').filter({ hasText: '导入 0 张，跳过 2 张' }).waitFor()
  assert.equal(await page.locator('.sticker-group').count(), 1, 'Retry reuses the already saved pack')
  assert.deepEqual(await page.evaluate(() => fixture.mediaCalls.filter(method => ['syncStickerLibrary', 'pruneStickers'].includes(method))), ['syncStickerLibrary', 'pruneStickers'])
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    for (const button of await dialog.locator('.media-import-actions button').all()) assert.ok((await button.boundingBox()).height >= 44)
    await page.screenshot({ path: `artifacts/media-controls/library-${width}.png` })
  }
  assert.equal(await page.evaluate(() => window.hdsHandleBack()), true)
  await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '故事', exact: true }).click()
  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('textbox', { name: '消息内容' }).scrollIntoViewIfNeeded()
    const input = await page.getByRole('textbox', { name: '消息内容' }).boundingBox()
    const send = await page.getByRole('button', { name: '发送消息', exact: true }).boundingBox()
    assert.ok(input.width >= width * .45, `Input stays usable beside send at ${width}px: ${input.width}px`); assert.ok(send.x >= input.x + input.width, 'Send button sits beside input'); assert.ok(send.y < input.y + input.height && send.y + send.height > input.y, 'Input and send control share a row')
    await page.screenshot({ path: `artifacts/media-controls/composer-${width}.png` })
  }
  assert.deepEqual(f.errors, [])
  console.log('PASS media controls: vision gate/settings link, cancellation, sync failure without pruning, retry dedup, native sync order, 320/390/740 layouts and touch targets.')
} catch (error) { console.error(f.errors); await page.screenshot({ path: 'artifacts/media-controls/failure.png' }); throw error } finally { await f.close() }
