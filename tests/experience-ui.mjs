import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'

const f = await characterFixture(true), { page } = f
await mkdir('artifacts/experience-ui', { recursive: true })
try {
  await page.addInitScript(() => {
    const original = window.Capacitor.nativePromise
    window.Capacitor.PluginHeaders[0].methods.push(...['experienceSettings', 'saveExperience', 'pickImage', 'setMessageNotifications', 'characterAvatar', 'saveCharacterAvatar', 'saveAppearance'].map(name => ({ name, rtype: 'promise' })))
    fixture.experience = { enterBehavior: 'newline', feedEnabled: true, stt: { enabled: false, provider: 'compatible', endpoint: '', model: '' }, image: { enabled: false, provider: 'imagefree', endpoint: 'https://imagefree.net', model: '' }, visual: { appearance: '红发，绿色眼睛', style: '水彩插画', outfit: '白色针织衫', constraints: '', references: [], autonomous: true, cooldownMinutes: 30, ratio: '3:4' } }
    fixture.posts = [{ id: 'role-post', actor: 'character', content: '今天路过花店，买了一束白色的小花。', images: [], at: new Date().toISOString(), likes: [], comments: [] }]
    fixture.messages = [{ id: 'failed-message', direction: 'user', content: '今天过得怎么样？', occurredAt: new Date().toISOString(), status: 'accepted', replyState: 'failed' }]
    fixture.streams = []; fixture.mutations = []; fixture.jobs = []; fixture.avatar = {}; fixture.appearance = { font: 'default', fontSize: 14, backgroundOpacity: 35, panelOpacity: 84, backgroundBlur: 0, theme: 'light', palette: 'sky' }
    window.Capacitor.nativePromise = async (plugin, method, options) => {
      if (method === 'status') return { ...(await original(plugin, method, options)), state: 'healthy', running: true }
      if (method === 'characterAvatar') return { cardId: options.cardId, ...fixture.avatar }
      if (method === 'saveCharacterAvatar') { fixture.avatar = options.clear ? {} : { path: new URL('fixture.gif', location.href).href, revision: Date.now() }; return { cardId: options.cardId, ...fixture.avatar } }
      if (method === 'appearance') return fixture.appearance
      if (method === 'saveAppearance') { fixture.appearance = options; return {} }
      if (method === 'experienceSettings') return structuredClone(fixture.experience)
      if (method === 'saveExperience') { fixture.experience = structuredClone(options); return options }
      if (method === 'pickImage') { fixture.lastPick = options.source; return fixture.pickResult || { cancelled: true } }
      if (method === 'rpc') {
        const p = options.payload ?? {}
        if (options.method === 'media.create') { fixture.jobs.push({ ...p, status: 'ready', imageId: 'a'.repeat(64), at: new Date().toISOString() }); return { data: fixture.jobs.at(-1) } }
        if (options.method === 'preset.syncStatus') return { data: { visionRestartRequired: false } }
        if (options.method === 'experience.snapshot') return { data: { posts: fixture.posts, streams: fixture.streams, jobs: fixture.jobs } }
        if (options.method === 'messages.history') return { data: fixture.messages }
        if (options.method === 'diagnostics.messages') return { data: { events: [], storageAvailable: true } }
        if (options.method === 'qq.conversations') return { data: [] }
        if (options.method === 'turn.retry') { fixture.retry = p; fixture.messages[0].replyState = 'generating'; return { data: { accepted: true } } }
        if (options.method === 'feed.mutate') { fixture.mutations.push(p); if (p.action === 'like') fixture.posts[0].likes = p.enabled ? ['user'] : []; if (p.action === 'post') fixture.posts.unshift({ id: p.operationId, actor: 'user', content: p.content, images: [], likes: [], comments: [], at: new Date().toISOString() }); return { data: { accepted: true } } }
        if (options.method === 'messages.sendLocal') { fixture.sent = p; fixture.messages.push({ id: p.requestId, direction: 'user', content: p.content, occurredAt: new Date().toISOString(), status: 'accepted' }); return { data: { accepted: true } } }
      }
      return original(plugin, method, options)
    }
  })
  await f.load()
  await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.getByRole('button', { name: '回复失败 · 重试回复' }).click()
  assert.equal(await page.evaluate(() => fixture.retry.messageId), 'failed-message')
  await page.getByRole('textbox', { name: '消息内容' }).fill('第一行')
  await page.getByRole('textbox', { name: '消息内容' }).press('Enter')
  assert.equal(await page.evaluate(() => fixture.sent), undefined)
  await page.getByRole('textbox', { name: '消息内容' }).press('Control+Enter')
  await page.waitForFunction(() => !!fixture.sent)
  await page.getByRole('button', { name: '添加图片或语音', exact: true }).click()
  await page.getByRole('button', { name: '角色外观', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '生成并发送到聊天' }).count(), 0, 'generation belongs to the character decision')
  await page.getByRole('button', { name: '角色外观', exact: true }).click()
  await page.getByRole('heading', { name: '角色视觉档案', exact: true }).waitFor()
  await page.getByLabel('固定外观', { exact: true }).fill('红发、绿色眼睛，保持同一角色')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  assert.match(await page.evaluate(() => fixture.experience.visual.appearance), /保持同一角色/)
  await page.getByRole('button', { name: '动态', exact: true }).click()
  await page.getByText('今天路过花店，买了一束白色的小花。').waitFor()
  await page.getByRole('button', { name: '♡ 点赞' }).click()
  await page.getByRole('button', { name: '♥ 已赞' }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: '分享此刻' }).count(), 0)
  await page.getByRole('button', { name: /分享此刻/ }).click()
  await page.getByRole('textbox', { name: '分享此刻' }).fill('今天一起散步吧。')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.getByText('今天一起散步吧。', { exact: true }).waitFor()
  await page.getByRole('button', { name: /分享此刻/ }).click()
  await page.getByRole('button', { name: '拍摄', exact: true }).click()
  assert.equal(await page.evaluate(() => fixture.lastPick), 'camera')
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}`)
    const bounds = await page.locator('nav').evaluate(nav => { const marker = nav.querySelector('.nav-indicator').getBoundingClientRect(), cell = nav.querySelector('button.active').getBoundingClientRect(); return { left: marker.left >= cell.left, right: marker.right <= cell.right } })
    assert.ok(bounds.left && bounds.right, 'active marker fits selected cell')
    await page.screenshot({ path: `artifacts/experience-ui/feed-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /信箱与外部连接/ }).waitFor()
  assert.equal(await page.locator('nav').getByRole('button', { name: '信箱', exact: true }).count(), 0)
  await page.getByRole('button', { name: /角色视觉档案 固定外观/ }).click()
  await page.getByText('当前档案', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '从相册上传头像', exact: true }).count(), 0)
  await page.getByRole('button', { name: '返回空间', exact: true }).click()
  await page.getByRole('button', { name: /角色头像 聊天与动态头像/ }).click()
  assert.equal(await page.getByLabel('固定外观', { exact: true }).count(), 0)
  const visualBeforeAvatar = await page.evaluate(() => JSON.stringify(fixture.experience.visual))
  await page.evaluate(() => { fixture.pickResult = { cancelled: false, dataUri: 'data:image/jpeg;base64,fixture' } })
  await page.getByRole('button', { name: '从相册上传头像', exact: true }).click()
  await page.getByText('头像已更新', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => JSON.stringify(fixture.experience.visual)), visualBeforeAvatar)
  await page.getByRole('button', { name: '动态', exact: true }).click()
  await page.locator('.feed-author img.character-avatar').waitFor()
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /界面个性化 壁纸/ }).click()
  await page.getByText('主题与恢复默认', { exact: true }).click()
  await page.getByRole('button', { name: '蔷薇粉', exact: true }).click()
  assert.equal(await page.locator('html').getAttribute('data-palette'), 'rose')
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /高级设置 后台预算/ }).click()
  assert.equal(await page.getByRole('checkbox', { name: /流式输出/ }).count(), 0)
  await page.getByRole('button', { name: '前往聊天与输入 →', exact: true }).click()
  assert.equal(await page.getByRole('checkbox', { name: /流式输出/ }).count(), 1)
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^语音识别与生图/ }).click()
  await page.getByLabel(/^渠道/).selectOption('compatible')
  await page.getByLabel('服务地址', { exact: true }).last().fill('https://provider.test/v1')
  await page.getByLabel('模型', { exact: true }).last().fill('gemini-3.1-flash-image')
  for (const api of ['images', 'chat', 'gemini', 'auto']) {
    await page.getByLabel(/^生图接口格式/).selectOption(api)
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await page.waitForFunction(api => fixture.experience.image.imageApi === api, api)
  }
  await page.getByLabel('发送角色参考图（服务需支持）', { exact: true }).check()
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.waitForFunction(() => fixture.experience.image.referenceImages === true)
  await page.screenshot({ path: 'artifacts/experience-ui/image-protocol-settings.png', fullPage: true })
  // 校验自定义液态玻璃下拉框、唯一页面标题与移除固定保存提示文案
  await page.getByRole('button', { name: '返回空间', exact: true }).click()
  await page.getByRole('button', { name: /^聊天与输入/ }).click()
  assert.equal(await page.locator('.subpage-heading h1').count(), 1)
  assert.equal(await page.locator('.space-detail h2').count(), 0)
  assert.equal(await page.getByText('点击保存设置后应用', { exact: true }).count(), 0)
  const enterTrigger = page.getByRole('combobox', { name: '回车键' })
  await enterTrigger.click()
  const enterListbox = page.getByRole('listbox', { name: '回车键' })
  await enterListbox.waitFor()
  assert.deepEqual(await enterListbox.getByRole('option').allTextContents(), ['换行', '发送消息'])
  assert.equal(await page.evaluate(() => window.hdsHandleBack()), true)
  await enterListbox.waitFor({ state: 'detached' })
  await page.getByRole('heading', { name: '聊天与输入', exact: true }).waitFor()
  await enterTrigger.click()
  await enterListbox.waitFor()
  await page.keyboard.press('Escape')
  await enterListbox.waitFor({ state: 'detached' })
  await enterTrigger.click()
  await enterListbox.getByRole('option', { name: '发送消息' }).click()
  await page.getByText(/Shift\+Enter 换行/).waitFor()
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.waitForFunction(() => fixture.experience.enterBehavior === 'send')
  assert.deepEqual(f.errors, [])
  console.log('Experience UI: retry, Enter, visual profile, autonomous generation, feed, camera, navigation and responsive layout passed')
} catch (error) { console.error(f.errors); await page.screenshot({ path: 'artifacts/experience-ui/failure.png', fullPage: true }); console.error(await page.locator('main').innerText()); throw error } finally { await f.close() }
