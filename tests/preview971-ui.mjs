import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'

const f = await characterFixture(true), { page } = f
await mkdir('artifacts/preview971-ui', { recursive: true })
try {
  const dataUri = `data:image/jpeg;base64,${(await readFile('fixtures/images/vision-fixture.jpg')).toString('base64')}`
  await page.addInitScript(({ dataUri }) => {
    const original = Capacitor.nativePromise
    Capacitor.PluginHeaders[0].methods.push(...['experienceSettings', 'saveExperience', 'pickImage', 'openFreeImage'].map(name => ({ name, rtype: 'promise' })))
    fixture.settings = { enterBehavior: 'newline', feedEnabled: true, stt: { enabled: false, provider: 'compatible', endpoint: '', model: '' }, image: { enabled: true, provider: 'imagefree', endpoint: 'https://imagefree.net', model: '' }, visual: { appearance: '', style: '水彩', outfit: '', constraints: '', references: [], autonomous: true, cooldownMinutes: 30, ratio: '3:4' } }
    fixture.jobs = [{ id: 'free-failed-job', kind: 'image', purpose: 'chat', provider: 'imagefree', status: 'failed', phase: 'submit', reason: 'image_verification', retryMode: 'generate', error: '免费渠道需要网页验证', prompt: 'a cup', at: new Date().toISOString() }]
    fixture.events = [{ id: 'failed-image-event', at: Date.now(), requestIds: [], stage: 'image', outcome: 'failed', reason: 'image_verification', mediaJobId: 'free-failed-job', mediaPhase: 'submit', mediaProvider: 'imagefree', mediaPurpose: 'chat' }]
    fixture.posts = []; fixture.uploads = 0; fixture.creates = 0; fixture.freeOpens = 0
    fixture.messages = Array.from({ length: 50 }, (_, i) => ({ id: `message-${i}`, direction: i % 2 ? 'character' : 'user', content: `第 ${i + 1} 条聊天记录`, status: i % 2 ? 'delivered' : 'accepted', occurredAt: new Date(Date.now() - (50 - i) * 1000).toISOString() }))
    Capacitor.nativePromise = async (plugin, method, options) => {
      if (method === 'status') return { state: 'healthy', installed: true, running: true, logs: [], device: {} }
      if (method === 'experienceSettings') return structuredClone(fixture.settings)
      if (method === 'saveExperience') { fixture.settings = options; return options }
      if (method === 'openFreeImage') { fixture.freeOpens++; fixture.webPrompt = options.prompt; return fixture.cancelFree ? { cancelled: true } : { cancelled: false, dataUri } }
      if (method === 'pickImage') return { cancelled: false, images: [{ dataUri }, { dataUri }, { dataUri: 'broken' }] }
      if (method === 'rpc') {
        const p = options.payload || {}
        if (options.method === 'experience.snapshot') return { data: { posts: fixture.posts, jobs: fixture.jobs, streams: [] } }
        if (options.method === 'messages.history') return { data: fixture.messages }
        if (options.method === 'diagnostics.messages') return { data: { events: fixture.events, storageAvailable: true } }
        if (options.method === 'qq.conversations') return { data: [{ id: 'private:123', unread: 88 }] }
        if (options.method === 'media.freeInput') return { data: { prompt: '原任务的完整画面描述' } }
        if (options.method === 'media.completeFree') { fixture.imported = p; const job = fixture.jobs.find(j => j.id === p.id); Object.assign(job, { status: 'ready', delivered: true, error: undefined, imageId: 'a'.repeat(64) }); fixture.events.push({ ...fixture.events[0], id: 'image-completed-event', at: Date.now(), outcome: 'succeeded', mediaPhase: 'deliver', reason: undefined }); return { data: job } }
        if (options.method === 'images.upload') { fixture.uploads++; if (p.dataUri === 'broken') throw new Error('读取失败'); return { data: { id: 'a'.repeat(64) } } }
        if (options.method === 'images.get') { if (fixture.failRead) { fixture.failRead = false; throw new Error('temporary') } return { data: { dataUri } } }
        if (options.method === 'feed.mutate') { fixture.feedPayload = p; fixture.posts.push({ id: p.operationId, actor: 'user', content: p.content, images: p.images, at: new Date().toISOString(), likes: [], comments: [] }); return { data: {} } }
        if (options.method === 'media.create') { fixture.creates++; fixture.jobs.push({ ...p, status: 'ready', delivered: true, imageId: 'a'.repeat(64), at: new Date().toISOString() }); return { data: fixture.jobs.at(-1) } }
        return { data: {} }
      }
      return original(plugin, method, options)
    }
  }, { dataUri })
  await f.load()
  await page.getByRole('button', { name: '故事', exact: true }).click()
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true })
  await composer.scrollIntoViewIfNeeded()
  const notice = page.locator('.composer-wrap .media-job-notice')
  await notice.getByRole('button', { name: '查看生图诊断', exact: true }).waitFor()
  assert.equal(await page.locator('nav .nav-unread').count(), 0)
  await notice.getByRole('button', { name: '查看生图诊断', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '消息诊断', exact: true })
  await dialog.getByRole('button', { name: '图片', exact: true }).click()
  await page.evaluate(() => { fixture.cancelFree = true })
  await dialog.getByRole('button', { name: '打开免费生图', exact: true }).click()
  assert.equal(await page.evaluate(() => fixture.imported), undefined)
  await page.evaluate(() => { fixture.cancelFree = false })
  await dialog.getByRole('button', { name: '打开免费生图', exact: true }).click()
  await page.waitForFunction(() => fixture.imported?.id === 'free-failed-job')
  assert.equal(await page.evaluate(() => fixture.creates), 0, 'web recovery must not POST another API generation')
  assert.equal(await page.evaluate(() => fixture.webPrompt), '原任务的完整画面描述')
  await dialog.getByRole('button', { name: '关闭消息诊断', exact: true }).click()
  await notice.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '动态', exact: true }).click()
  await page.getByRole('button', { name: /分享此刻/ }).click()
  await page.evaluate(() => { fixture.failRead = true })
  await page.getByRole('button', { name: '相册', exact: true }).click()
  await page.getByRole('button', { name: '重新加载图片', exact: true }).click()
  await page.locator('.feed-compose .message-image img').waitFor()
  assert.equal(await page.locator('.feed-compose .message-image').count(), 1, 'duplicate images are deduplicated and the successful upload survives partial failure')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.waitForFunction(() => fixture.feedPayload?.images?.length === 1)
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^语音识别与生图/ }).click()
  await page.getByRole('button', { name: '保存并测试生图', exact: true }).click()
  await page.waitForFunction(() => fixture.creates === 1)
  await page.locator('.image-test-result').scrollIntoViewIfNeeded()
  await page.locator('.image-test-result img').waitFor()
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `artifacts/preview971-ui/image-test-${width}.png`, fullPage: true })
  }
  assert.deepEqual(f.errors, [])
  console.log('PASS Preview 9.7.1: free-web recovery, cancellation, original job delivery, no QQ dot, feed partial upload/deduplication, reload and generation test.')
} finally { await f.close() }
