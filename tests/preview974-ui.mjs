import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { characterFixture } from './character-io-fixture.mjs'

const f = await characterFixture(true)
const { page } = f
await mkdir('artifacts/preview974-ui', { recursive: true })

try {
  await page.addInitScript(() => {
    const original = window.Capacitor.nativePromise
    const extraMethods = [
      'saveSettings', 'start', 'stop', 'cancelInstall', 'diagnostics',
      'syncStickerLibrary', 'experienceSettings', 'saveExperience',
      'characterAvatar', 'saveCharacterAvatar', 'powerSettings', 'savePowerSettings',
      'saveMessageDiagnostics',
    ]
    const existing = new Set(window.Capacitor.PluginHeaders[0].methods.map(m => m.name))
    for (const name of extraMethods) {
      if (!existing.has(name)) window.Capacitor.PluginHeaders[0].methods.push({ name, rtype: 'promise' })
    }
    window.Capacitor.convertFileSrc = p => p

    localStorage.setItem('hds.quickstart.v1', '1')
    localStorage.setItem('hds-stickers-v1', JSON.stringify({
      packs: [{
        id: 'pack-974',
        name: '测试表情',
        pool: 'user',
        createdAt: 1,
        stickers: [{ id: 'a'.repeat(64), path: '/fixture.gif', size: 128, mime: 'image/gif', lastUsed: 1 }],
      }],
      messages: {},
    }))

    fixture.cards = [
      {
        id: 'first',
        importedAt: new Date().toISOString(),
        card: {
          format: 'v2',
          name: '星禾',
          description: '海边小镇的旧物修理师，总是在午后泡一壶焙茶。',
          personality: '温柔细腻',
          scenario: '海边修理铺',
          firstMessage: '今天的风吹过来有海盐的味道，你要进来坐坐吗？',
          alternateGreetings: [],
          examples: '',
          systemPrompt: '',
          postHistoryInstructions: '',
          creatorNotes: '',
          warnings: [],
          raw: {},
        },
      },
      {
        id: 'second',
        importedAt: new Date().toISOString(),
        card: {
          format: 'v2',
          name: '林间',
          description: '夜间电台与独立书店主理人。',
          personality: '随性豁达',
          scenario: '雨夜书店',
          firstMessage: '刚好在试一张老唱片，你来得正是时候。',
          alternateGreetings: [],
          examples: '',
          systemPrompt: '',
          postHistoryInstructions: '',
          creatorNotes: '',
          warnings: [],
          raw: {},
        },
      },
    ]
    fixture.healthy = false
    fixture.messagesByCard = { first: [], second: [] }
    fixture.diagnosticEvents = [
      { id: 'diag-974-1', at: Date.now(), requestIds: ['req-974'], stage: 'model', outcome: 'failed', reason: 'timeout', providerSlot: 1 },
    ]
    fixture.avatar = {}

    window.Capacitor.nativePromise = async (plugin, method, options = {}) => {
      if (method === 'settings') {
        return {
          activeCard: fixture.selected,
          providers: [{
            id: 'primary',
            preset: 'custom',
            label: '故事模型',
            endpoint: 'https://example.invalid/v1',
            model: 'fixture-model',
            protocol: 'chat-completions',
            enabled: true,
            credentialPresent: true,
            useForMain: true,
            useForCompaction: true,
            useForAlter: true,
          }],
          modelOptions: { visionEnabled: true },
          mobileConfig: { sections: { agency: { enabled: true } } },
          userName: '我',
          userProfile: '',
          autoAdvance: false,
        }
      }
      if (method === 'status') {
        return {
          state: fixture.healthy ? 'healthy' : 'stopped',
          installed: true,
          environmentState: 'ready',
          running: fixture.healthy,
          logs: ['[9.7.4] local runtime ready'],
          device: { model: 'Pixel Test', android: '15', sdk: 35, abi: 'arm64-v8a', pageSize: 16384, availableBytes: 32 * 1024 ** 3 },
          version: '0.1.0-preview.9.7.5',
        }
      }
      if (method === 'start') { fixture.healthy = true; return {} }
      if (method === 'stop') { fixture.healthy = false; return {} }
      if (method === 'saveSettings' || method === 'syncStickerLibrary') return {}
      if (method === 'diagnostics') return { probed: true, runtime: fixture.healthy ? 'healthy' : 'stopped' }
      if (method === 'powerSettings') return { mode: 'balanced' }
      if (method === 'experienceSettings') {
        return {
          enterBehavior: 'newline',
          feedEnabled: true,
          stt: { enabled: false, provider: 'compatible', endpoint: '', model: '' },
          image: { enabled: false, provider: 'imagefree', endpoint: 'https://imagefree.net', model: '' },
          visual: { appearance: '', style: '', outfit: '', constraints: '', references: [], autonomous: false, cooldownMinutes: 30, ratio: '3:4' },
        }
      }
      if (method === 'characterAvatar') return { cardId: options.cardId, ...(fixture.avatar[options.cardId] || {}) }
      if (method === 'rpc') {
        const p = options.payload || {}
        const cardId = p.expectedCardId || fixture.selected
        if (options.method === 'messages.history') return { data: structuredClone(fixture.messagesByCard[cardId] || []) }
        if (options.method === 'experience.snapshot') return { data: { posts: [], jobs: [], streams: [] } }
        if (options.method === 'diagnostics.messages') return { data: { events: structuredClone(fixture.diagnosticEvents), storageAvailable: true } }
        if (options.method === 'qq.conversations') return { data: [] }
        if (options.method === 'preset.syncStatus') return { data: { visionRestartRequired: false, activeVision: { enabled: true, candidates: [{ enabled: true, imageInput: 'supported' }] } } }
        if (options.method === 'story.snapshot') {
          return {
            data: {
              story: { status: 'active', state: { alterSystem: { emotionalOffset: { description: '平稳轻快' } } } },
              entries: [],
              facts: [],
              memories: [],
              intents: [],
            },
          }
        }
        return { data: {} }
      }
      return original(plugin, method, options)
    }
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await f.load()
  await page.getByRole('button', { name: '故事', exact: true }).click()

  // =========================================================================
  // 1. 未唤醒名片舱（休眠态）与已休眠↔在线状态切换
  // =========================================================================
  const wakeCard = page.locator('.chat-wake-stage .wake-glass-card')
  await wakeCard.waitFor()
  assert.equal(await page.locator('header .status').evaluate(el => el.classList.contains('online')), false)
  assert.match(await page.locator('header .status').innerText(), /已休眠/)
  assert.match(await wakeCard.locator('.wake-card-pill').innerText(), /已休眠/)
  assert.equal(await wakeCard.locator('.wake-card-tag').innerText(), '共 2 位角色 · 本地记忆')
  assert.equal(await wakeCard.locator('.wake-card-avatar').getAttribute('data-initial'), '星')
  assert.equal(await wakeCard.locator('.wake-card-copy h2').innerText(), '星禾')
  assert.match(await wakeCard.locator('.wake-card-quote').innerText(), /今天的风吹过来有海盐的味道/)
  assert.deepEqual(await wakeCard.locator('.wake-card-readiness .wake-chip.is-ready').allInnerTexts(), ['角色就绪', '模型已连', '本地隐私'])
  await page.screenshot({ path: 'artifacts/preview974-ui/wake-card-dormant-390.png', fullPage: true })

  // 通过名片舱主唤醒按钮唤醒 -> 在线
  await wakeCard.getByRole('button', { name: '唤醒', exact: true }).click()
  await page.locator('header .status.online').waitFor()
  assert.match(await page.locator('header .status').innerText(), /在线/)
  await wakeCard.waitFor({ state: 'detached' })
  await page.locator('.chat-empty-spacer').waitFor()

  // 通过顶栏状态胶囊点按：在线 -> 已休眠 -> 在线
  await page.locator('header .status.online').click()
  await page.locator('header .status:not(.online)').waitFor()
  assert.match(await page.locator('header .status').innerText(), /已休眠/)
  await wakeCard.waitFor()

  // 动态页休眠唤醒提示弹窗
  await page.getByRole('button', { name: '动态', exact: true }).click()
  await page.getByRole('button', { name: /分享此刻/ }).click()
  const wakePrompt = page.getByRole('dialog', { name: '唤醒角色提示', exact: true })
  await wakePrompt.waitFor()
  await wakePrompt.getByRole('button', { name: '立即唤醒', exact: true }).click()
  await page.locator('header .status.online').waitFor()
  await wakePrompt.waitFor({ state: 'detached' })

  // 存在聊天记录时休眠：展示底部内联状态条 .wake-inline-bar，且可切换恢复在线
  await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.evaluate(() => {
    fixture.messagesByCard.first = Array.from({ length: 24 }, (_, i) => ({
      id: `m974-${i}`,
      direction: i % 2 ? 'character' : 'user',
      content: `第 ${i + 1} 条对话消息，用于验证窄屏下列表与输入栏布局。`,
      occurredAt: new Date(1700000000000 + i * 1000).toISOString(),
      status: i % 2 ? 'delivered' : 'accepted',
    }))
  })
  await page.locator('[data-read-anchor="message-m974-23"]').waitFor()
  await page.locator('header .status.online').click()
  await page.locator('.wake-inline-bar').waitFor()
  assert.match(await page.locator('.wake-inline-bar .wake-inline-status').innerText(), /已休眠/)
  await page.locator('.wake-inline-bar button.wake-pill').click()
  await page.locator('header .status.online').waitFor()
  await page.locator('.wake-inline-bar').waitFor({ state: 'detached' })
  console.log('PASS 9.7.4 (1): dormant wake card, online<->dormant header & inline toggle, feed wake prompt.')

  // =========================================================================
  // 2. 表情抽屉外点关闭
  // =========================================================================
  const stickerBtn = page.getByRole('button', { name: '打开表情包', exact: true })
  const stickerDrawer = page.getByRole('region', { name: '表情抽屉', exact: true })
  await stickerBtn.click()
  await stickerDrawer.waitFor()
  assert.equal(await stickerBtn.getAttribute('aria-expanded'), 'true')
  // 点击抽屉内部标题不应关闭
  await stickerDrawer.locator('h3').first().click()
  assert.equal(await stickerDrawer.count(), 1)
  assert.equal(await stickerBtn.getAttribute('aria-expanded'), 'true')
  // 点击抽屉外消息区域自动收起（避开吸顶 header）
  await page.locator('[data-read-anchor="message-m974-23"] .bubble').click()
  await stickerDrawer.waitFor({ state: 'detached' })
  assert.equal(await stickerBtn.getAttribute('aria-expanded'), 'false')
  // 点击顶栏也可外点关闭；再次打开可用 Escape 收起
  await stickerBtn.click()
  await stickerDrawer.waitFor()
  await page.locator('header .header-char-name').click({ force: true })
  await stickerDrawer.waitFor({ state: 'detached' })
  await stickerBtn.click()
  await stickerDrawer.waitFor()
  await page.keyboard.press('Escape')
  await stickerDrawer.waitFor({ state: 'detached' })
  console.log('PASS 9.7.4 (2): sticker drawer outside click & Escape dismissal.')

  // =========================================================================
  // 3. 空间四分组及分段胶囊
  // =========================================================================
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.locator('.space-home').waitFor()
  assert.deepEqual(
    await page.locator('.space-section-label').allTextContents(),
    ['角色与叙事', '对话与日常', '模型与多模态', '外观与系统'],
  )
  const groupLabels = await page.locator('.space-group').evaluateAll(groups =>
    groups.map(group => [...group.querySelectorAll('.settings-entry')].map(btn => btn.textContent?.trim() || '')),
  )
  assert.equal(groupLabels.length, 4)
  assert.ok(groupLabels[0][0].startsWith('角色与故事') && groupLabels[0][1].startsWith('角色形象与视觉'))
  assert.ok(groupLabels[1][0].startsWith('聊天与输入') && groupLabels[1][1].startsWith('角色语音与音色') && groupLabels[1][2].startsWith('持续生活') && groupLabels[1][3].startsWith('外部连接与信箱'))
  assert.ok(groupLabels[2][0].startsWith('模型与任务分工') && groupLabels[2][1].startsWith('语音识别与生图'))
  assert.ok(groupLabels[3][0].startsWith('界面个性化与通知') && groupLabels[3][1].startsWith('备份、诊断与帮助'))
  await page.screenshot({ path: 'artifacts/preview974-ui/space-home-390.png', fullPage: true })

  // 校验全部 5 组分段胶囊
  const subtabGroups = [
    { entry: /^角色与故事/, tabs: ['角色与叙事', '人格与角色库'], categories: ['world', 'world'] },
    { entry: /^角色形象与视觉/, tabs: ['角色头像', '视觉档案与生图'], categories: ['avatar', 'visual'] },
    { entry: /^模型与任务分工/, tabs: ['模型连接', '任务分工', '高级与节奏'], categories: ['models', 'tasks', 'advanced'] },
    { entry: /^界面个性化与通知/, tabs: ['界面与壁纸', '消息通知'], categories: ['appearance', 'notifications'] },
    { entry: /^备份、诊断与帮助/, tabs: ['存档与设备', '诊断与帮助'], categories: ['system', 'system'] },
  ]
  for (const spec of subtabGroups) {
    await page.getByRole('button', { name: spec.entry }).click()
    const tablist = page.locator('.space-subtabs[role="tablist"]')
    await tablist.waitFor()
    assert.deepEqual(await tablist.getByRole('tab').allInnerTexts(), spec.tabs)
    for (let i = 0; i < spec.tabs.length; i++) {
      const tab = tablist.getByRole('tab', { name: spec.tabs[i], exact: true })
      await tab.click()
      assert.equal(await tab.getAttribute('aria-selected'), 'true')
      assert.equal(await tab.evaluate(el => el.classList.contains('is-active')), true)
      assert.equal(await page.locator('.space-detail').getAttribute('data-settings-category'), spec.categories[i])
      if (spec.tabs[i] === '人格与角色库') {
        await page.locator('.card-list').waitFor()
      }
    }
    assert.equal(await tablist.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
    await page.getByRole('button', { name: '返回空间', exact: true }).click()
    await page.locator('.space-home').waitFor()
  }
  console.log('PASS 9.7.4 (3): four space groups & five segmented capsule tab groups.')

  // =========================================================================
  // 4. 顶栏切角色
  // =========================================================================
  await page.getByRole('button', { name: '故事', exact: true }).click()
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true })
  await composer.fill('星禾专属草稿')

  const switcherBtn = page.getByRole('button', { name: '切换角色或故事', exact: true })
  const dropdown = page.locator('#header-character-dropdown')
  assert.match(await switcherBtn.innerText(), /星禾/)
  await switcherBtn.click()
  await dropdown.waitFor()
  assert.equal(await switcherBtn.evaluate(el => el.classList.contains('is-open')), true)
  assert.equal(await switcherBtn.getAttribute('aria-expanded'), 'true')
  // 外点关闭（避开左侧 278px 宽度的下拉浮层）
  await page.mouse.click(350, 320)
  await dropdown.waitFor({ state: 'detached' })
  // Escape 关闭
  await switcherBtn.click()
  await dropdown.waitFor()
  await page.keyboard.press('Escape')
  await dropdown.waitFor({ state: 'detached' })
  // 切换至另一角色并验证草稿隔离
  await switcherBtn.click()
  await dropdown.getByRole('button', { name: '林间 继续故事 →', exact: true }).click()
  await dropdown.waitFor({ state: 'detached' })
  await page.waitForFunction(() => fixture.selected === 'second')
  assert.match(await switcherBtn.innerText(), /林间/)
  assert.equal(await composer.inputValue(), '')
  // 切回星禾验证草稿保留
  await switcherBtn.click()
  await dropdown.getByRole('button', { name: '星禾 继续故事 →', exact: true }).click()
  await page.waitForFunction(() => fixture.selected === 'first')
  assert.equal(await composer.inputValue(), '星禾专属草稿')
  await composer.fill('')
  // 通过顶栏下拉直达人格与角色库
  await switcherBtn.click()
  await dropdown.getByRole('button', { name: '导入、创建与管理角色', exact: true }).click()
  await dropdown.waitFor({ state: 'detached' })
  assert.equal(await page.locator('main').getAttribute('data-page'), 'cards')
  await page.getByRole('button', { name: '返回故事', exact: true }).click()
  console.log('PASS 9.7.4 (4): header character switcher dropdown, outside/Escape close, switch & draft isolation, library entry.')

  // =========================================================================
  // 5. 底部输入框（窄屏 320px 下不遮挡）
  // =========================================================================
  await page.setViewportSize({ width: 320, height: 844 })
  await page.locator('[data-read-anchor="message-m974-23"]').waitFor()
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel'))
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(150)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(100)
  const checkComposer320 = async (label) => {
    const metrics = await page.evaluate(() => {
      const header = document.querySelector('header').getBoundingClientRect()
      const wrap = document.querySelector('.composer-wrap').getBoundingClientRect()
      const attach = document.querySelector('.composer .attach-button').getBoundingClientRect()
      const sticker = document.querySelector('.composer .sticker-entry').getBoundingClientRect()
      const input = document.querySelector('.composer textarea').getBoundingClientRect()
      const send = document.querySelector('.composer .send').getBoundingClientRect()
      const nav = document.querySelector('nav').getBoundingClientRect()
      const lastMsg = document.querySelector('.messages > article.message:last-of-type')?.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        headerBottom: header.bottom,
        wrap,
        attach,
        sticker,
        input,
        send,
        navTop: nav.top,
        lastMsgBottom: lastMsg?.bottom ?? 0,
      }
    })
    assert.equal(metrics.overflow, false, `${label}: no horizontal overflow at 320px`)
    assert.ok(metrics.wrap.left >= 0 && metrics.wrap.right <= 320, `${label}: composer-wrap within 320px width`)
    assert.ok(metrics.wrap.top >= metrics.headerBottom, `${label}: composer-wrap below header`)
    assert.ok(metrics.wrap.bottom <= metrics.navTop + 1, `${label}: composer-wrap not covered by nav (${metrics.wrap.bottom} <= ${metrics.navTop})`)
    assert.ok(metrics.attach.right <= metrics.input.left + 1, `${label}: attach left of textarea`)
    assert.ok(metrics.input.right <= metrics.sticker.left + 1, `${label}: textarea left of sticker`)
    assert.ok(metrics.sticker.right <= metrics.send.left + 1, `${label}: sticker left of send`)
    assert.ok(metrics.input.width >= 100, `${label}: textarea usable width (${metrics.input.width})`)
    return metrics
  }
  const singleLine = await checkComposer320('320px single-line')
  assert.ok(singleLine.lastMsgBottom <= singleLine.wrap.top + 4, `last message not covered by composer (${singleLine.lastMsgBottom} <= ${singleLine.wrap.top})`)

  await composer.fill('第一行\n第二行\n第三行\n第四行\n第五行\n第六行')
  await page.waitForTimeout(50)
  const multiLine = await checkComposer320('320px multi-line')
  assert.ok(multiLine.input.height > 60 && multiLine.input.height <= 152, `textarea auto-grows cleanly (${multiLine.input.height})`)
  await page.screenshot({ path: 'artifacts/preview974-ui/composer-320.png' })
  await composer.fill('')
  await page.setViewportSize({ width: 390, height: 844 })
  console.log('PASS 9.7.4 (5): 320px docked composer single-line & multi-line without overlap or nav occlusion.')

  // =========================================================================
  // 6. 诊断 / 新手引导
  // =========================================================================
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^备份、诊断与帮助/ }).click()
  // 存档与设备 -> 核心维护与诊断
  await page.getByText('核心维护与诊断', { exact: true }).click()
  await page.getByRole('button', { name: '查看安装诊断', exact: true }).click()
  await page.getByLabel('安装诊断', { exact: true }).waitFor()
  await page.getByText('查看运行日志', { exact: true }).click()
  await page.getByRole('log', { name: '运行日志', exact: true }).waitFor()

  // 诊断与帮助 -> 消息诊断 / 首次对话准备 / 重看新手引导
  await page.getByRole('tab', { name: '诊断与帮助', exact: true }).click()
  await page.getByRole('button', { name: /^消息诊断/ }).click()
  const diagDialog = page.getByRole('dialog', { name: '消息诊断', exact: true })
  await diagDialog.waitFor()
  await diagDialog.getByRole('button', { name: '失败', exact: true }).click()
  await diagDialog.getByRole('button', { name: '关闭消息诊断', exact: true }).click()
  await diagDialog.waitFor({ state: 'detached' })

  // 首次对话准备：切到尚未完成首次问答的第二角色，验证入口能重新打开准备面板
  await page.getByRole('button', { name: '切换角色或故事', exact: true }).click()
  await page.locator('#header-character-dropdown').getByRole('button', { name: '林间 继续故事 →', exact: true }).click()
  await page.waitForFunction(() => fixture.selected === 'second')
  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^备份、诊断与帮助/ }).click()
  await page.getByRole('tab', { name: '诊断与帮助', exact: true }).click()
  await page.getByRole('button', { name: /^首次对话准备/ }).click()
  const quickStart = page.getByRole('region', { name: '首次对话准备', exact: true })
  await quickStart.waitFor()
  await quickStart.getByRole('button', { name: '稍后再说', exact: true }).click()
  await quickStart.waitFor({ state: 'detached' })

  await page.getByRole('button', { name: '空间', exact: true }).click()
  await page.getByRole('button', { name: /^备份、诊断与帮助/ }).click()
  await page.getByRole('tab', { name: '诊断与帮助', exact: true }).click()
  await page.getByRole('button', { name: /^重看新手引导/ }).click()
  const guideStep = async step => page.waitForFunction(v => document.querySelector('.onboarding-overlay.is-visible')?.dataset.step === String(v), step)
  await guideStep(1)
  assert.equal(await page.locator('.app').evaluate(el => el.inert && el.getAttribute('aria-hidden') === 'true'), true)
  const expectedPages = ['chat', 'cards', 'settings', 'chat', 'story', 'settings']
  for (let step = 1; step <= 6; step++) {
    await guideStep(step)
    assert.equal(await page.locator('main').getAttribute('data-page'), expectedPages[step - 1])
    await page.locator('.onboarding-highlight').waitFor()
    if (step < 6) await page.getByRole('button', { name: '下一步', exact: true }).click()
  }
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await guideStep(5)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await guideStep(6)
  await page.getByRole('button', { name: '开始使用', exact: true }).click()
  await page.locator('.onboarding-overlay').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.app').evaluate(el => el.inert), false)
  assert.equal(await page.locator('[data-settings-category="system"]').count(), 1, 'onboarding restores origin subpage')
  console.log('PASS 9.7.4 (6): diagnostics modal, install probe, quick start, and 6-step onboarding replay & origin restoration.')

  // =========================================================================
  // 7. prefers-reduced-motion 下的动效降级
  // =========================================================================
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // 空间子页与首页切换无滑入动画
  await page.getByRole('button', { name: '返回空间', exact: true }).click()
  await page.locator('.space-home').waitFor()
  assert.equal(await page.locator('.space-home').evaluate(el => el.classList.contains('space-enter-back')), false)
  await page.getByRole('button', { name: /^备份、诊断与帮助/ }).click()
  assert.equal(await page.locator('.space-detail').evaluate(el => el.classList.contains('space-enter-forward')), false)

  // 新手引导：reduced-motion 下零过渡
  await page.getByRole('tab', { name: '诊断与帮助', exact: true }).click()
  await page.getByRole('button', { name: /^重看新手引导/ }).click()
  await guideStep(1)
  assert.equal(await page.locator('.onboarding-card').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  await page.getByRole('button', { name: '跳过', exact: true }).click()
  await page.locator('.onboarding-overlay').waitFor({ state: 'detached' })

  // 休眠态名片舱与呼吸光晕动画降级
  await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.evaluate(() => { fixture.messagesByCard.first = [] })
  await page.locator('header .status.online').click()
  await wakeCard.waitFor()
  const wakeMotion = await wakeCard.evaluate(card => ({
    aura: getComputedStyle(card.querySelector('.wake-aura-glow')).animationName,
    orbit: getComputedStyle(card.querySelector('.wake-orbit-svg')).animationName,
    spark: getComputedStyle(card.querySelector('.wake-spark-svg')).animationName,
    wave: getComputedStyle(card.querySelector('.wake-cta-wave i')).animationName,
    ctaTransition: getComputedStyle(card.querySelector('.wake-cta')).transitionDuration,
  }))
  assert.deepEqual(wakeMotion, { aura: 'none', orbit: 'none', spark: 'none', wave: 'none', ctaTransition: '0s' })

  // 导航指示条与页面切换（含横滑）降级：不经过 page-exit
  assert.equal(await page.locator('nav .nav-indicator').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  await page.locator('main').evaluate(el => {
    const p = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
    const s = p(200, 300), e = p(100, 300)
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [s], changedTouches: [s] }))
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [e], changedTouches: [e] }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [e] }))
  })
  const afterReducedSwipe = await page.evaluate(() => ({
    page: document.querySelector('main')?.dataset.page,
    idle: document.querySelector('main')?.classList.contains('page-idle'),
  }))
  assert.deepEqual(afterReducedSwipe, { page: 'story', idle: true })

  // 表情抽屉与消息入场动画降级
  await page.getByRole('button', { name: '故事', exact: true }).click()
  await page.evaluate(() => {
    fixture.messagesByCard.second = [{ id: 'rm-1', direction: 'character', content: '降级消息', occurredAt: new Date().toISOString(), status: 'delivered' }]
  })
  await page.locator('header .status').click()
  await page.locator('header .status.online').waitFor()
  await page.locator('.message').first().waitFor()
  assert.equal(await page.locator('.message').first().evaluate(el => getComputedStyle(el).animationName), 'none')
  await stickerBtn.click()
  await stickerDrawer.waitFor()
  assert.equal(await stickerDrawer.evaluate(el => getComputedStyle(el).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  assert.deepEqual(f.errors, [])
  console.log('PASS 9.7.4 (7): prefers-reduced-motion degrades wake card, space motion, onboarding, swipe/nav, sticker drawer and message-enter.')
  console.log('PASS Preview 9.7.4: all 7 key interaction scenarios verified.')
} finally {
  await f.close()
}
