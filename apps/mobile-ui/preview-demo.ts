// 仅在浏览器 URL 带有 ?demo=1 参数时启用交互式演示数据与快速主题切换栏，不影响任何原生运行与自动化测试。
const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'

if (isDemo && typeof window !== 'undefined' && !(window as unknown as { androidBridge?: unknown }).androidBridge) {
  localStorage.setItem('hds.onboarding.v1', '1')
  localStorage.setItem('hds.quickstart.v1', '1')

  const avatarSvg = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6b9cff"/><stop offset="100%" stop-color="#3b68d8"/></linearGradient></defs><rect width="120" height="120" rx="32" fill="url(#g)"/><circle cx="60" cy="46" r="20" fill="#fff" fill-opacity="0.92"/><path d="M28 102c6-20 22-30 32-30s26 10 32 30" fill="#fff" fill-opacity="0.92"/></svg>')}#`
  const postSvg = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#dfe7ff"/><stop offset="50%" stop-color="#f4f6fb"/><stop offset="100%" stop-color="#c9dcff"/></linearGradient></defs><rect width="360" height="360" rx="28" fill="url(#bg)"/><circle cx="265" cy="95" r="38" fill="#ffb86c" fill-opacity="0.75"/><path d="M0 260 Q95 210 185 250 T360 235 L360 360 L0 360 Z" fill="#7aa2f7" fill-opacity="0.45"/><path d="M0 290 Q130 245 240 285 T360 275 L360 360 L0 360 Z" fill="#3b68d8" fill-opacity="0.65"/></svg>')}#`

  const demoCards = [
    {
      id: 'demo-xinghe',
      importedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      card: {
        name: '星禾',
        description: '海边小镇的旧物修理师，安静敏锐，总是在午后泡一壶焙茶，把收音机和旧怀表修好。',
        personality: '温柔内敛、细腻真诚',
        scenario: '海边修理铺的午后日常',
        firstMessage: '今天的风吹过来有海盐的味道，你要进来坐坐吗？',
        format: 'v2',
        lorebook: true,
        warnings: [],
      },
    },
    {
      id: 'demo-linjian',
      importedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      card: {
        name: '林间',
        description: '独立书店与夜间电台主理人，喜欢收集雨声磁带与深夜来信。',
        personality: '随性豁达、带一点冷幽默',
        scenario: '雨夜电台与街角书店',
        firstMessage: '刚好在试一张老唱片，你来得正是时候。',
        format: 'v2',
        lorebook: false,
        warnings: [],
      },
    },
  ]

  const demoState = {
    activeCard: 'demo-xinghe',
    healthy: true,
    appearance: {
      font: 'default',
      fontSize: 14,
      backgroundOpacity: 35,
      panelOpacity: 88,
      backgroundBlur: 0,
      theme: 'light',
      palette: 'sky',
    },
    settings: {
      activeCard: 'demo-xinghe',
      userName: '我',
      userProfile: '住在隔壁街区的老朋友，偶尔带旧物来修理铺聊天。',
      autoAdvance: true,
      providers: [
        {
          id: 'p-main',
          preset: 'deepseek',
          label: 'DeepSeek 主模型',
          endpoint: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          protocol: 'chat-completions',
          enabled: true,
          credentialPresent: true,
          useForMain: true,
          useForCompaction: true,
          useForAlter: true,
          useForEmbedding: false,
          imageInput: 'supported',
        },
        {
          id: 'p-vision',
          preset: 'custom',
          label: 'Gemini 视觉与生图',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: 'gemini-2.5-flash',
          protocol: 'chat-completions',
          enabled: true,
          credentialPresent: true,
          useForMain: false,
          useForCompaction: false,
          useForAlter: false,
          useForEmbedding: true,
          imageInput: 'supported',
        },
      ],
      modelOptions: {
        mainStreamingMode: 'experimental',
        mainResponseFormat: 'json-object',
        mainTemperature: 0.8,
        mainMaxTokens: 4096,
        mainTimeout: 90000,
        maxAttemptsPerProvider: 2,
        mobileTurnDeadlineMs: 240000,
        cooldownMinutes: 5,
        mainPayloadOrder: 'cache-first',
        failoverEnabled: true,
        failoverStrategy: 'priority',
        visionEnabled: true,
      },
    },
    experience: {
      enterBehavior: 'send',
      feedEnabled: true,
      stt: { enabled: true, provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: 'whisper-1' },
      image: { enabled: true, provider: 'imagefree', endpoint: 'https://imagefree.net', model: '' },
      visual: {
        appearance: '亚麻色短发，琥珀色眼眸，常穿浅米色工装围裙',
        style: '日系清透水彩，柔和逆光，胶片颗粒感',
        outfit: '米白亚麻衬衫与深蓝工装背带裙',
        constraints: '保持温暖自然的生活场景',
        references: [],
        autonomous: true,
        cooldownMinutes: 30,
        ratio: '3:4',
      },
    },
    messages: [
      {
        id: 'm-1',
        direction: 'character',
        content: '午安。上午那台老式收音机的调频旋钮我已经校准好了，现在转起来很顺滑，没有杂音了。',
        occurredAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        status: 'delivered',
      },
      {
        id: 'm-2',
        direction: 'user',
        content: '太好了！辛苦星禾了，下午我带街角那家刚出炉的海盐可颂过来拿收音机。',
        occurredAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        status: 'accepted',
      },
      {
        id: 'm-3',
        direction: 'character',
        content: '<think>他记得我喜欢街角那家面包店的海盐可颂，先把工作台收拾干净，再泡一壶热焙茶等他过来吧。</think>好呀，我刚好把工作台收拾出来了，水也快烧开了。外头风有点大，你过来的时候慢一点。',
        occurredAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
        status: 'delivered',
      },
    ],
    posts: [
      {
        id: 'post-1',
        actor: 'character',
        content: '修好了一只停在四点十五分的旧怀表。听见齿轮重新咬合滴答作响的时候，窗外的阳光刚好落在桌角。',
        images: ['a'.repeat(64)],
        at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        likes: ['user'],
        comments: [
          { id: 'c-1', actor: 'user', content: '光线太好看了，等会儿见！' },
          { id: 'c-2', actor: 'character', replyTo: 'c-1', content: '嗯，茶已经泡好啦。' },
        ],
      },
      {
        id: 'post-2',
        actor: 'user',
        content: '路过海堤，今天的海面像镀了一层碎银。',
        images: [],
        at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        likes: ['character'],
        comments: [],
      },
    ],
  }

  localStorage.setItem('hds-lastCharacterReplyTs-demo-xinghe', String(Date.now()))

  const methods = [
    'addListener', 'removeListener', 'settings', 'cards', 'status', 'saveSettings', 'start', 'stop', 'selectCard',
    'rpc', 'cancelInstall', 'appearance', 'saveAppearance', 'pickAppearanceAsset', 'pickImage', 'pickStickers',
    'stickerImage', 'pruneStickers', 'syncStickerLibrary', 'exportStory', 'restoreStory', 'resetStory',
    'restorePreviousStory', 'notificationSettings', 'setMessageNotifications', 'openNotificationSettings',
    'notificationLaunch', 'saveMessageDiagnostics', 'voiceState', 'previewVoice', 'voiceAudio', 'pickVoiceAudio',
    'cancelVoiceRecording', 'experienceSettings', 'saveExperience', 'characterAvatar', 'saveCharacterAvatar',
  ]

  ;(window as unknown as Record<string, unknown>).androidBridge = {}
  ;(window as unknown as Record<string, unknown>).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    convertFileSrc: (p: string) => p,
    PluginHeaders: [{ name: 'HdsRuntime', methods: methods.map(name => ({ name, rtype: 'promise' })) }],
    nativePromise: async (_plugin: string, method: string, options: Record<string, unknown> = {}) => {
      if (method === 'addListener' || method === 'removeListener') return {}
      if (method === 'settings') return structuredClone(demoState.settings)
      if (method === 'saveSettings') { Object.assign(demoState.settings, options); return {} }
      if (method === 'cards') return { cards: demoCards }
      if (method === 'selectCard') { demoState.activeCard = String(options.id); demoState.settings.activeCard = String(options.id); return {} }
      if (method === 'status') {
        await new Promise(resolve => setTimeout(resolve, 15))
        return {
          state: demoState.healthy ? 'healthy' : 'stopped',
          installed: true,
          environmentState: 'ready',
          running: demoState.healthy,
          progress: '',
          error: '',
          logs: ['[19:40:01] HDS Interlude local runtime v0.1.0-preview.9.7.2 ready', '[19:40:02] SQLite driver connected · memory & vector index active'],
          device: { model: 'Pixel 9 Pro (FlClash UI Preview)', android: '15', sdk: 35, abi: 'arm64-v8a', pageSize: 16384, availableBytes: 64 * 1024 ** 3 },
          version: '0.1.0-preview.9.7.2',
        }
      }
      if (method === 'start') { demoState.healthy = true; return {} }
      if (method === 'stop') { demoState.healthy = false; return {} }
      if (method === 'appearance') return structuredClone(demoState.appearance)
      if (method === 'saveAppearance') { Object.assign(demoState.appearance, options); return {} }
      if (method === 'experienceSettings') return structuredClone(demoState.experience)
      if (method === 'saveExperience') { Object.assign(demoState.experience, options); return structuredClone(demoState.experience) }
      if (method === 'characterAvatar') return { cardId: options.cardId, path: avatarSvg, revision: 1 }
      if (method === 'notificationSettings') return { enabled: true, permission: 'granted', available: true }
      if (method === 'notificationLaunch') return {}
      if (method === 'voiceState') return { voices: [{ id: 'v1', name: '午后焙茶（温柔女声）', type: 'builtin', value: '茉莉' }], characters: { 'demo-xinghe': { enabled: true, voiceId: 'v1', threshold: 0.6 } }, defaultVoiceId: 'v1', cooldown: 5, credentialPresent: true }
      if (method === 'startVoiceRecording') return {}
      if (method === 'stopVoiceRecording') return { audioId: 'demo-voice-01', duration: 4 }
      if (method === 'cancelVoiceRecording') return {}
      if (method === 'voiceAudio') return { dataUri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=' }
      if (method === 'rpc') {
        const rpcMethod = String(options.method)
        const payload = (options.payload || {}) as Record<string, unknown>
        if (rpcMethod === 'messages.history') return { data: demoState.messages }
        if (rpcMethod === 'messages.sendLocal') {
          const userMsg = { id: String(payload.requestId), direction: 'user', content: String(payload.content || ''), images: payload.images as string[] | undefined, occurredAt: new Date().toISOString(), status: 'accepted' }
          const replyMsg = { id: `reply-${Date.now()}`, direction: 'character', content: '我听见啦。茶刚刚泡好，热气还在往上冒呢，等你推门进来。', occurredAt: new Date(Date.now() + 500).toISOString(), status: 'delivered' }
          demoState.messages = [...demoState.messages, userMsg, replyMsg]
          localStorage.setItem('hds-lastCharacterReplyTs-demo-xinghe', String(Date.now() + 600))
          return { data: { accepted: true } }
        }
        if (rpcMethod === 'experience.snapshot') return { data: { posts: demoState.posts, jobs: [], streams: [] } }
        if (rpcMethod === 'images.get') return { data: { dataUri: postSvg } }
        if (rpcMethod === 'story.snapshot') return {
          data: {
            story: {
              status: 'active',
              setting: { character: { name: demoCards.find(c => c.id === demoState.activeCard)?.card.name || '星禾' } },
              state: { alterSystem: { emotionalOffset: { description: '午后的阳光很安静，因为约定好了等会儿见面，她的心情比平时更加轻快明亮，连擦拭黄铜齿轮的动作都带着一点雀跃。', direction: 'warm' } } },
            },
            entries: [
              { id: 102, kind: 'script', occurredAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(), content: '星禾把修好的老式收音机摆在木柜最显眼的位置，又取出一只青瓷茶壶，注入热水温壶。窗外的海风拂过风铃，发出清脆的声响。' },
              { id: 101, kind: 'setup', occurredAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(), content: '海边小镇的午后，星禾在修理铺整理旧物，等待老朋友来取修好的收音机。' },
            ],
            facts: [
              { id: 1, scope: 'character', content: '喜欢街角面包店刚出炉的海盐可颂，配温热的焙茶。', confidence: 0.98 },
              { id: 2, scope: 'shared', content: '约定在今天下午来修理铺取修好的老式调频收音机。', confidence: 0.95 },
            ],
            memories: [
              { id: 12, summary: '上周一起在海堤散步时，捡到了几枚带着花纹的玻璃浮球，放在修理铺窗台当装饰。' },
            ],
            intents: [
              { id: 5, summary: '等他到店里后，一起试听修好的收音机里的下午爵士乐频道', type: 'promise', notBefore: new Date(Date.now() + 1800000).toISOString() },
            ],
            overlay: { state: { relationship: '默契升温 · 期待午后茶叙' } },
            promptTrace: [],
          },
        }
        if (rpcMethod === 'qq.conversations') return {
          data: [
            { id: 'private:2849102', name: '星禾 (QQ)', last: '收音机修好啦，下午见～', time: Date.now() - 600000, unread: 1 },
            { id: 'group:9481023', name: '海边小镇街坊群', last: '面包店老板：今天的海盐可颂刚出炉！', time: Date.now() - 1800000, unread: 2 },
          ],
        }
        if (rpcMethod === 'qq.status') return {
          data: {
            phase: 'online', installed: true, running: true, loggedIn: true, online: true,
            account: '2849102', nickname: '星禾的信箱', progress: 'NapCat 本地通道已连接', error: '', qr: '',
            policy: { enabled: true, users: [{ qq: '10086', label: '我', enabled: true, personId: 'user', profile: '', relationship: '挚友' }], groups: [] },
            logs: ['[NapCat] OneBot v11 local WebSocket online'],
          },
        }
        if (rpcMethod === 'qq.history') return {
          data: [
            { id: 'qq-1', name: '星禾', content: '收音机修好啦，下午见～', time: Date.now() - 600000, outgoing: false },
            { id: 'qq-2', name: '我', content: '收到，马上出门！', time: Date.now() - 300000, outgoing: true },
          ],
        }
        if (rpcMethod === 'preset.syncStatus') return { data: { visionRestartRequired: false, activeVision: { enabled: true, candidates: [{ enabled: true, imageInput: 'supported' }] } } }
        if (rpcMethod === 'diagnostics.messages') return { data: { events: [], storageAvailable: true } }
        if (rpcMethod === 'config.status') return { data: { budget: { used: 8, limit: 120, exhausted: false, resumesAt: null } } }
        return { data: {} }
      }
      return {}
    },
  }
}
export {}
