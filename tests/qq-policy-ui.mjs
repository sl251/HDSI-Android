import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const browser = await chromium.launch({ executablePath: process.env.HDS_BROWSER || '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', headless: true, args: process.env.HDS_BROWSER_LOW_RESOURCES === '1' ? ['--single-process', '--no-zygote', '--disable-gpu'] : [] })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(15000)
  await page.goto(process.env.HDS_UI_URL || 'http://127.0.0.1:5173')
  await page.evaluate(async () => {
    const [{ default: React }, { default: ReactDOM }, { Inbox }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'), import('/apps/mobile-ui/Inbox.tsx'),
    ])
    window.qqSavedPolicy = { enabled: false, users: [], groups: [] }
    const bridge = { rpc: async ({ method, payload }) => {
      if (method === 'qq.policy') { window.qqSavedPolicy = structuredClone(payload); return { data: window.qqSavedPolicy } }
      if (method === 'qq.status') return { data: { phase: 'stopped', installed: false, running: false, loggedIn: false, online: false, progress: '', error: '', account: '', nickname: '', qr: '', policy: window.qqSavedPolicy, logs: [] } }
      if (method === 'qq.conversations') return { data: [] }
      throw new Error(`Unexpected RPC ${method}`)
    } }
    document.body.innerHTML = '<div id="qq-harness"></div>'
    ReactDOM.createRoot(document.getElementById('qq-harness')).render(React.createElement(Inbox, { bridge, healthy: true, native: true, configure() {} }))
  })
  await page.getByRole('button', { name: /角色自动回复/ }).click()
  const dialog = page.getByRole('dialog', { name: 'QQ 自动回复设置' })
  await dialog.getByLabel('启用角色自动回复').check()
  await dialog.getByRole('button', { name: '添加朋友' }).click()
  const friend = dialog.getByRole('group', { name: '朋友 1', exact: true })
  await friend.getByLabel('QQ 号', { exact: true }).fill('12345')
  await friend.getByLabel('称呼', { exact: true }).fill('阿林')
  await friend.locator('summary').click()
  await friend.getByLabel('人物标识').fill('lin')
  await friend.getByLabel('她知道的背景').fill('住在隔壁，喜欢看书')
  await friend.getByLabel('初始关系').fill('认识很久的朋友')
  await friend.locator('summary').click()
  await friend.locator('summary').getByText('已填写', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '添加群聊' }).click()
  const group = dialog.getByRole('group', { name: '群聊 1', exact: true })
  await group.getByLabel('群号', { exact: true }).fill('88888')
  await group.getByLabel('群备注').fill('读书会')
  const settings = group.locator('summary').filter({ hasText: '群设置' })
  await settings.click()
  await group.getByLabel('这个群的日常').fill('分享读到的故事')
  await group.getByLabel('她在群里的身份').fill('常来聊天的书友')
  await group.getByLabel('什么时候关注群消息').selectOption('always')
  await group.getByRole('combobox', { name: /^发言意愿/ }).selectOption('custom')
  assert.equal(await group.getByLabel('发言阈值', { exact: true }).isVisible(), false)
  await group.locator('summary').filter({ hasText: '高级' }).click()
  await group.getByLabel('启用自定义数值门').check()
  await group.getByLabel('发言阈值', { exact: true }).fill('0.42')
  await group.getByLabel('群上下文条数').fill('32')
  await group.getByLabel('消息合并等待（秒）').fill('0.25')
  await group.getByLabel('发言冷却（秒）').fill('90')
  await group.getByLabel('历史图片上限').fill('5')
  await group.getByLabel('让她留意的关键词').fill('故事\n晚安\n')
  assert.equal(await group.getByLabel('群上下文条数').getAttribute('inputmode'), 'numeric')
  assert.equal(await group.getByLabel('消息合并等待（秒）').getAttribute('inputmode'), 'decimal')
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await dialog.evaluate(element => {
      const depth = node => { let count = 0; for (let p = node; p && p !== element; p = p.parentElement) if (p.tagName === 'DETAILS') count++; return count }
      return { depth: Math.max(...[...element.querySelectorAll('details')].map(depth)), touch: [...element.querySelectorAll('summary')].every(node => node.getBoundingClientRect().height >= 44), fits: element.scrollWidth <= element.clientWidth }
    })
    assert.deepEqual(layout, { depth: 2, touch: true, fits: true }, `Fold and touch layout at ${width}px`)
  }
  await group.getByRole('combobox', { name: /^发言意愿/ }).selectOption('normal')
  assert.equal(await group.getByLabel('发言阈值', { exact: true }).count(), 0, 'Custom controls disappear outside custom mode')
  await settings.click()
  assert.match(await settings.innerText(), /标准 · normal 档/)
  await dialog.getByRole('button', { name: '保存回复范围' }).click()
  await dialog.waitFor({ state: 'hidden' })
  const saved = await page.evaluate(() => window.qqSavedPolicy)
  assert.deepEqual(saved.users[0], { qq: '12345', label: '阿林', personId: 'lin', profile: '住在隔壁，喜欢看书', relationship: '认识很久的朋友', enabled: true })
  assert.equal(saved.groups[0].contextLimit, 32)
  assert.equal(saved.groups[0].debounceSeconds, 0.25)
  assert.equal(saved.groups[0].cooldownSeconds, 90)
  assert.equal(saved.groups[0].historicalImageLimit, 5)
  assert.equal(saved.groups[0].responseMode, 'always')
  assert.deepEqual(saved.groups[0].keywords, ['故事', '晚安'])
  assert.equal(saved.groups[0].willingness.threshold, 0.42)
  await page.getByRole('button', { name: /角色自动回复/ }).click()
  await dialog.getByLabel('称呼', { exact: true }).waitFor()
  assert.equal(await dialog.getByLabel('称呼', { exact: true }).inputValue(), '阿林')
  const reopened = dialog.getByRole('group', { name: '群聊 1', exact: true })
  assert.match(await reopened.locator('summary').filter({ hasText: '群设置' }).innerText(), /normal 档/)
  await reopened.locator('summary').filter({ hasText: '群设置' }).click()
  await reopened.locator('summary').filter({ hasText: '高级' }).click()
  assert.equal(await reopened.getByLabel('群上下文条数').inputValue(), '32')
  await reopened.getByRole('combobox', { name: /^发言意愿/ }).selectOption('custom')
  assert.equal(await reopened.getByLabel('发言阈值', { exact: true }).inputValue(), '0.42')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: join(tmpdir(), 'hds-m1-qq-policy.png'), fullPage: true })
  await reopened.getByRole('combobox', { name: /^发言意愿/ }).selectOption('off')
  await dialog.getByRole('button', { name: '保存回复范围' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.qqSavedPolicy.groups[0].willingness.enabled), false, 'Off disables the old custom gate as well')
  console.log('PASS QQ policy UI: identity card, nested settings, custom controls, numeric keyboards, 320/390/430px touch/layout, RPC save and reopen')
} finally { await browser.close() }
