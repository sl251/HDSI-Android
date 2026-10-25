import { experienceRuntime } from './experience-runtime'
import { historyQuery } from './message-history'
import type { ExperienceSettings, MediaJob } from '../packages/contracts/experience'
import { weatherStatus } from '../upstream/hds-interlude/src/weather'
import { Context, Bot, h, type Universal } from 'koishi'
import { HTTP } from '@cordisjs/plugin-http'
import { Server } from '@koishijs/plugin-server'
import { SQLiteDriver } from '@minatojs/driver-sqlite'
import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import * as HDS from '../upstream/hds-interlude/src/index'
import { cardPrompt, type Card } from '../packages/card-format'
import { effectiveRetrievalConfig } from './retrieval-config'
import { mobileModelConfig } from './model-config'
import type { ModelOptions, ModelProvider } from '../packages/contracts'
import { messageImages, visionProjection, visionRouteReason, normalizeVisionProjection } from '../packages/contracts'
import { personaDefaults, personaEditPatch } from './persona'
import { QQRuntime } from './qq'
import { imageStore } from './media'
import { localStickerConfig, stickerFileForSource, emptyStickerSystemPrompt, oneBotStickerDelivery } from './stickers'
import { mobileVoicePrompt } from './voice-decision'
import { mapMobileConfig, normalizeMobileConfig, mobileSchema, embeddingProviders, type MobileConfig } from './mobile-config'
import { localVoiceCapability, localVoiceDelivery, oneBotVoiceDelivery, type VoiceBridgeConfig } from './voice'
import { messageAudio } from '../packages/contracts/voice'
import { BackgroundBudget } from './background-budget'
import { retrievalDiagnosticRecorder, MessageDiagnostics, runMessageDiagnostics, diagnosticEvent, diagnosticError, diagnosticCall, hasMessageDiagnostics, withDeliveryDiagnostics } from './message-diagnostics'
import { inspectPreset } from './preset'
import { messagePush, serializeMessagePush, messagesSinceQuery, type PushRow } from './message-push'
export { messagePush, serializeMessagePush, messagesSinceQuery } from './message-push'
export { mobileSchema } from './mobile-config'
export { normalizeMobileConfig, mapMobileConfig } from './mobile-config'
export { mobilePreset, inspectPreset } from './preset'

type SendOptions = Universal.SendOptions
interface MobileMessage { id: string; direction: string; content: string; occurredAt: Date; status: string; images: string[]; audio: Record<string, unknown> }
interface MobileRequest { id: string; content: string; status: string; occurredAt: Date }
declare module 'koishi' { interface Tables { mobile_message: MobileMessage; mobile_request: MobileRequest } }

export type HostConfig = { experience?: Partial<ExperienceSettings>; voiceBridge?: VoiceBridgeConfig; mobileConfig?: MobileConfig; card: Card; endpoint: string; model: string; apiKey?: string; providers?: ModelProvider[]; modelOptions?: Partial<ModelOptions>; userName: string; userProfile: string; autoAdvance: boolean; token: string; port: number; dataDir: string; qqDir?: string }
export async function startHost(input: HostConfig) {
  if (!input.card?.name || !input.model || !input.endpoint || !input.token || input.token.length < 32) throw new Error('Missing valid host configuration')
  const endpoint = new URL(input.endpoint)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid model endpoint')
  mkdirSync(input.dataDir, { recursive: true })
  const diagnostics = new MessageDiagnostics(join(input.dataDir, 'message-diagnostics.json'))
  // Old slots cannot be mapped to today's connection order after a restart.
  const historicalDiagnosticIds = new Set(diagnostics.list().events.map(event => event.id))
  if (input.qqDir) mkdirSync(input.qqDir, { recursive: true })
  const restoreMarker = join(input.dataDir, 'restore-held.json')
  let restoreHeld = existsSync(restoreMarker)
  let storyPaused = true
  const app = new Context({ prefix: ['interlude.'] })
  app.baseDir = input.dataDir
  app.plugin(HTTP)
  // Reuse HostConfig.port below. port: 0 installs the router without opening
  // another listener; only sticker GETs are forwarded to its Koa handler.
  app.plugin(Server, { host: '127.0.0.1', port: 0 })
  app.plugin(SQLiteDriver, { path: join(input.dataDir, 'hds.sqlite') })
  app.model.extend('mobile_message', { id: 'string(64)', direction: 'string(16)', content: 'text', occurredAt: 'timestamp', status: 'string(32)', images: { type: 'json', initial: [] }, audio: { type: 'json', initial: {} } }, { primary: 'id', indexes: [['occurredAt', 'id']] })
  app.model.extend('mobile_request', { id: 'string(64)', content: 'text', status: 'string(32)', occurredAt: 'timestamp' }, { primary: 'id' })
  const preserveAudio = (audio: ReturnType<typeof messageAudio>) => { if (!audio || !input.voiceBridge?.directory) return; const dir = join(input.dataDir, 'voice-media'); mkdirSync(dir, { recursive: true }); const source = join(input.voiceBridge.directory, `${audio.audioId}.wav`), target = join(dir, `${audio.audioId}.wav`); if (!existsSync(target) && existsSync(source)) copyFileSync(source, target) }
  class LocalBot extends Bot<Context> {
    private lastMessageTime = 0
    private disposed = false
    constructor(ctx: Context) { super(ctx, {}, 'mobile-local'); this.user = { id: 'local-role', name: input.card.name } }
    async start() { this.online() }
    async dispose() { if (this.disposed) return; this.disposed = true; await super.dispose() }
    async sendMessage(channelId: string, content: unknown, _referrer?: unknown, options?: SendOptions & { mobileTraceEntry?: number; mobileVoice?: { willingness: number } }) {
      const deliver = () => diagnosticCall('delivery', () => this.deliverLocal(channelId, content, options))
      return withDeliveryDiagnostics(diagnostics, options?.mobileTraceEntry ? [options.mobileTraceEntry] : [], () =>
        hasMessageDiagnostics() ? deliver() : runMessageDiagnostics(diagnostics, [randomUUID()], deliver))
    }
    private async deliverLocal(channelId: string, content: unknown, options?: SendOptions & { mobileTraceEntry?: number; mobileVoice?: { willingness: number } }) {
      if (restoreHeld || storyPaused) throw new Error('故事已暂停，请先明确恢复运行')
      if (!['private:local-user', 'local-user'].includes(channelId)) throw new Error('Local transport target is not authorized')
      const elements = h.parse(String(content))
      const rows: { content: string; images: string[]; audio?: { audioId: string; duration: number } }[] = []
      let text = ''
      const flush = () => { if (text) { rows.push({ content: text, images: [] }); text = '' } }
      for (const element of elements) {
        if (element.type !== 'img' && element.type !== 'image') {
          text += element.type === 'text' ? element.attrs.content : element.toString()
          continue
        }
        flush()
        const file = await stickerFileForSource(String(element.attrs.src ?? ''), stickerConfig.directory, async assetId =>
          (await app.database.get('interlude_sticker', { assetId, status: 'active' }))[0])
        // Unknown media must never leak its URL/markup into a message or push.
        if (!file) throw new Error('Local sticker is unavailable')
        rows.push({ content: '', images: [media.registerSticker(readFileSync(file)).id] })
      }
      flush()
      if (!rows.length) rows.push({ content: '', images: [] })
      const ids: string[] = []
      for (const row of rows) {
        if (row.content.trim()) {
          diagnosticEvent('voice', 'started')
          row.audio = await localVoiceDelivery(input.voiceBridge, row.content, options?.mobileVoice?.willingness,
          `按照角色的性格自然朗读，不增加台词。角色：${input.card.name}。性格：${input.card.personality || input.card.description || ''}`.slice(0, 3000), randomUUID(), value => { diagnosticEvent('voice', value.status, { reason: value.reason, elapsedMs: value.elapsedMs }) })
        }
        preserveAudio(row.audio)
        const id = experience.takeStream(row.content) ?? randomUUID(), occurredAt = new Date(Math.max(Date.now(), this.lastMessageTime + 1))
        this.lastMessageTime = occurredAt.getTime()
        if (restoreHeld || storyPaused) throw new Error('故事已暂停，请先明确恢复运行')
        await app.database.create('mobile_message', { id, direction: 'character', ...row, occurredAt, status: 'delivered' })
        experience.deliveredStream(id)
        diagnosticEvent('delivery', 'delivered', { messageId: id, mode: row.audio ? 'voice' : row.images.length ? 'sticker' : 'text' })
        process.stdout.write(serializeMessagePush({ id, ...row, occurredAt }))
        ids.push(id)
      }
      return ids
    }
    async createDirectChannel(userId: string) { return { id: `private:${userId}`, type: 1 } }
  }
  let bot!: LocalBot
  app.plugin(ctx => { bot = new LocalBot(ctx) })
  const mobile = normalizeMobileConfig(input.mobileConfig)
  const budget = new BackgroundBudget(join(input.qqDir ?? input.dataDir, 'background-budget.json'), mobile.backgroundLimit)
  const stickerConfig = localStickerConfig(input.dataDir)
  const mapped = mapMobileConfig(mobile, input.autoAdvance)
  const model = mobileModelConfig(input)
  const retrieval = effectiveRetrievalConfig({ ...model, ...mapped.model } as any)
  // The upstream schema fills nested defaults, but declares its input as the
  // fully populated output. Keep that mismatch at the validation boundary.
  const parseConfig = HDS.Config as (value: unknown) => ReturnType<typeof HDS.Config>
  const config = parseConfig({
    stickers: { ...stickerConfig, deliveryMode: 'http', deliveryBaseUrl: `http://127.0.0.1:${input.port}` },
    ...mapped,
    storyDefaults: personaDefaults(input.card, input.userProfile),
    model: retrieval.model,
    logging: { level: 'info', verbosity: 'standard', colors: false, kaomoji: false, logMessageContent: false, logScriptPreview: false },
    qzone: { enabled: false }, browser: { enabled: false },
    onebot: { enabled: true, botAccounts: [], userAccounts: [], groupChats: [], ignoreSelfMessages: true },
  })
  config.model.mobileEmbeddingIdentity = true
  config.model.mobileVoiceCapabilities = () => localVoiceCapability(input.voiceBridge)
  ;(config.model as any).mobileStickerDelivery = oneBotStickerDelivery
  Object.assign(config.model, { mobileDiagnostics: diagnostics })
  const diagnosticProviderLabels = config.model.providers.map(provider => provider.label?.trim().slice(0, 80))
  const voiceTasks = new Set<Promise<unknown>>()
  const drainVoice = async () => { while (voiceTasks.size) await Promise.allSettled([...voiceTasks]) }
  ;(config.model as any).mobileOneBotVoiceDelivery = async (bot: Bot, channelId: string, content: string, willingness: unknown, sendText: () => Promise<unknown>) => {
    if (bot?.platform !== 'onebot' || !input.voiceBridge) return sendText()
    const task = oneBotVoiceDelivery(input.voiceBridge, { platform: bot.platform, sendMessage: bot.sendMessage.bind(bot) }, channelId, content, willingness,
      `按照角色的性格自然朗读，不增加台词。角色：${input.card.name}。性格：${input.card.personality || input.card.description || ''}`.slice(0, 3000), sendText)
    voiceTasks.add(task)
    // Keep the upstream delivery executor occupied until the chosen transport
    // settles; its existing execution key prevents concurrent repair sends.
    try { return await task } finally { voiceTasks.delete(task) }
  }
  config.model.mobileRetrievalRecorder = () => retrievalDiagnosticRecorder(diagnostics, config.model.providers)
  for (const [task, status] of Object.entries(retrieval.status)) {
    if (status.desired && !status.effective) diagnostics.retrieval([], task, 'fallback', { reason: status.reason }, diagnostics.epoch)
  }
  config.model.mobileBeforeRequest = budget.beforeRequest
  config.model.mobileSystemPrompt = (prompt, request) => mobileVoicePrompt(request.stickerCatalog?.length ? prompt : emptyStickerSystemPrompt(prompt), request.chatCapabilities?.voice)
  const activeVision = visionProjection(input)
  const media = imageStore(input.dataDir)
  const experience = experienceRuntime({ directory: input.dataDir, paused: true, identity: `${input.card.name}: ${input.card.description}`.slice(0, 1800), settings: input.experience, audioDirectory: input.voiceBridge?.directory,
    getImage: media.get, saveImage: media.registerSticker, diagnostics,
    wake: async () => app.interlude.mobileObserveFeed(current),
    deliver: async job => {
      if (job.kind !== 'image' || job.purpose !== 'chat') return
      if (!job.imageId) throw new Error('图片结果尚未保存')
      if ((await app.database.get('mobile_message', { id: job.id })).length) return
      if (restoreHeld || storyPaused) throw new Error('故事已暂停，请先明确恢复运行')
      const row = { id: job.id, direction: 'character', content: job.caption || '', images: [job.imageId], occurredAt: new Date(), status: 'delivered' }
      await app.database.create('mobile_message', row)
      process.stdout.write(serializeMessagePush(row))
    },
  })
  config.model.mobileStream = event => experience.stream(event)
  config.model.mobileDecisionCommitted = (raw, entryId, local) => experience.committed(raw, entryId, local)
  let promptTrace: string[] = []
  config.model.mobileCardPrompt = request => {
    const localContext = request.groupContext || request.participant && request.participant.platform !== 'mobile-local' ? '' : experience.context()
    if (input.card.format === 'hds') { promptTrace = ['HDS 原生 storyDefaults 映射']; return { before: '', after: localContext } }
    const history = request.recentEntries.filter(entry => entry.kind === 'user-message' || entry.kind === 'character-message').map(entry => entry.content)
    if (request.userMessage) history.push(request.userMessage)
    const compiled = cardPrompt(input.card, input.userName || '我', history)
    promptTrace = compiled.trace
    return { ...compiled, after: compiled.after + localContext }
  }
  app.plugin({ ...HDS, inject: { database: { required: true }, http: { required: true }, puppeteer: { required: false }, server: { required: false } } }, config)
  await app.start()
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('HDS initialization timed out')), 30000)
    const check = () => { if (app.interlude && app.database) { clearTimeout(deadline); resolve() } else setTimeout(check, 100) }
    check()
  })
  const session = (id: string = randomUUID(), content = '', images: string[] = []) => {
    const value = bot.session({ type: 'message', timestamp: Date.now(), user: { id: 'local-user', name: input.userName || '我' }, channel: { id: 'private:local-user', type: 1 }, message: { id, elements: [h.text(content), ...images.map(image => h.image(image))] } })
    // Management RPC calls the HDS service directly, so the local adapter supplies
    // the same receipt-producing send operation normally attached by Koishi middleware.
    return Object.assign(value, { username: input.userName || '我', send: (fragment: unknown, options?: SendOptions) => bot.sendMessage('private:local-user', fragment, undefined, options) })
  }
  // A dedicated profile owns this database; no QQ identity is fabricated.
  const current = session()
  let story = await app.interlude.findStory(current) ?? await app.interlude.createStory(current)
  if (restoreHeld) { await app.interlude.setDesktopRuntimePhase('paused'); story = await app.interlude.setStatus(story, 'paused') }
  storyPaused = restoreHeld || story.status !== 'active'
  experience.setPaused(storyPaused)
  const cardRevisionFile = join(input.dataDir, 'card-revision.json')
  const appliedRevision = existsSync(cardRevisionFile) ? JSON.parse(readFileSync(cardRevisionFile, 'utf8')).revision : 0
  if ((input.card.revision ?? 0) > appliedRevision) {
    const patch = personaEditPatch(input.card)
    if (input.card.hds && !input.userProfile.trim() && 'userProfile' in input.card.hds.storyDefaults) {
      patch.user = { ...story.setting.user, profile: String(input.card.hds.storyDefaults.userProfile) }
    }
    story = await app.interlude.updateSetting(story, patch)
    writeFileSync(`${cardRevisionFile}.tmp`, JSON.stringify({ revision: input.card.revision }))
    renameSync(`${cardRevisionFile}.tmp`, cardRevisionFile)
  }
  if (input.card.firstMessage) {
    const key = 'card-opening-v1'
    const old = await app.database.get('mobile_message', { id: key })
    if (!old.length) await app.database.create('mobile_message', { id: key, direction: 'character', content: input.card.firstMessage.replaceAll('{{char}}', input.card.name).replaceAll('{{user}}', input.userName || '我'), images: [], occurredAt: new Date(), status: 'card-opening' })
    await app.interlude.mobileRecordLocalOpening(story, current, input.card.firstMessage.replaceAll('{{char}}', input.card.name).replaceAll('{{user}}', input.userName || '我'))
  }
  let queue = Promise.resolve()
  let closing = false
  const jobFile = join(input.dataDir, 'maintenance-jobs.json')
  type Job = { id: string; kind: string; status: 'running' | 'done' | 'failed'; result?: unknown; error?: string }
  const jobs: Record<string, Job> = existsSync(jobFile) ? JSON.parse(readFileSync(jobFile, 'utf8')) : {}
  for (const job of Object.values(jobs)) if (job.status === 'running') { job.status = 'failed'; job.error = '核心重启中断了操作，请检查结果后重试' }
  const saveJobs = () => { writeFileSync(`${jobFile}.tmp`, JSON.stringify(jobs)); renameSync(`${jobFile}.tmp`, jobFile) }
  saveJobs()
  const work = new Set<Promise<void>>()
  const qq = input.qqDir ? new QQRuntime(app, input.qqDir, input.dataDir, app.interlude.config, async (account, users) => {
    const result = await app.interlude.addStoryEndpoint(story, 'onebot', account, 'qq')
    if (!result.ok) throw new Error(result.error || '无法绑定 QQ 与当前角色故事')
    for (const user of users) {
      // An endpoint projection, not an incoming message: enroll without inventing chat history.
      await app.interlude.ensureParticipant(story, bot.session({
        platform: 'onebot', selfId: account, user: { id: user.qq, name: user.label || user.qq },
        channel: { id: `private:${user.qq}`, type: 1 },
      }) as Parameters<typeof app.interlude.ensureParticipant>[1])
    }
  }) : undefined
  const dispatch = async (method: string, payload: Record<string, unknown>) => {
    if (closing) throw new Error('核心正在关闭，请稍后再试')
    if (method === 'diagnostics.messages') {
      const result = diagnostics.list(typeof payload.messageId === 'string' ? payload.messageId : undefined)
      return { ...result, events: result.events.map(event => {
        const label = !historicalDiagnosticIds.has(event.id) && event.providerSlot ? diagnosticProviderLabels[event.providerSlot - 1] : undefined
        return label ? { ...event, providerLabel: label } : event
      }) }
    }
    if (method === 'experience.configure') return experience.configure(payload)
    if (method === 'experience.snapshot') return experience.snapshot()
    if (method === 'feed.mutate') return experience.mutate(payload)
    if (method === 'media.create') {
      const kind = payload.kind === 'stt' ? 'stt' : 'image'
      const purpose = String(payload.purpose)
      if (!(kind === 'stt' ? ['voice', 'dictation'] : ['chat', 'feed', 'preview', 'avatar']).includes(purpose)) throw new Error('媒体用途无效')
      const character = purpose === 'avatar' ? (await app.interlude.findStory(current))?.setting.character : undefined
      const prompt = purpose === 'avatar' ? `为${character?.name || input.card.name}绘制头像。依据角色人设：${(character?.profile || input.card.description).slice(0, 1800)}。单人头肩肖像，面部清晰，居中构图，简洁背景，适合方形裁切，不加文字、水印或边框。` : payload.prompt as string
      return experience.jobs.create({ id: String(payload.id), kind, purpose: purpose as MediaJob['purpose'], prompt, caption: payload.caption as string, audioId: payload.audioId as string, duration: payload.duration as number })
    }
    if (method === 'media.retry') { experience.jobs.retry(String(payload.id)); return { accepted: true } }
    if (method === 'weather.status') return weatherStatus()
    if (method === 'turn.retry') {
      const retryRun = async () => {
      const failed = experience.failedTurn(String(payload.messageId))
      const latest = (await app.database.get('mobile_message', { direction: 'user' }, { sort: { occurredAt: 'desc' }, limit: 1 }))[0] as any
      if (!latest || !failed.sourceIds.includes(latest.id)) throw new Error('已有更新消息，不能重放旧回复；请继续当前对话')
      const rows = await app.database.get('mobile_message', { id: { $in: failed.sourceIds } }, { sort: { occurredAt: 'asc' } }) as any[]
      await app.interlude.mobileRetryLocal(session(latest.id, rows.map(row => row.content).join('\n'), rows.flatMap(row => messageImages(row.images)).slice(0, 3).map(id => media.get(id))))
      experience.clearFailed(failed.id)
      return { accepted: true }
      }
      const result = queue.then(retryRun); queue = result.then(() => {}, () => {}); return result
    }
    if (method === 'diagnostics.clear') { diagnostics.clear(); return { cleared: true } }
    if (method.startsWith('qq.')) { if (!qq) throw new Error('QQ 本机目录未配置'); return qq.dispatch(method, payload) }
    if (method === 'images.upload') return { id: media.save(payload.dataUri).id }
    if (method === 'images.get') return { dataUri: media.get(String(payload.id)) }
    if (method === 'memory.facts') return app.interlude.adminFacts(story.id, 100)
    if (method === 'memory.factSources') {
      const id = Number(payload.id)
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('无效事实编号')
      const fact = (await app.database.get('interlude_fact', { id, storyId: story.id }))[0]
      if (!fact) throw new Error('未找到当前故事的事实')
      const ids = (fact.sourceEntryIds ?? []).slice(0, 40)
      return ids.length ? (await app.database.get('interlude_script_entry', { storyId: story.id, id: { $in: ids } })).filter(entry => entry.kind !== 'redacted').map(entry => ({ content: entry.content, occurredAt: entry.occurredAt })) : []
    }
    if (method === 'maintenance.status') { const job = jobs[String(payload.requestId)]; if (!job) throw new Error('未找到维护任务'); return job }
    if (method === 'maintenance.start') {
      const id = String(payload.requestId ?? ''), kind = String(payload.kind ?? '')
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || !['compact', 'fact-add', 'fact-forget', 'overlay-clear', 'intent-cancel'].includes(kind)) throw new Error('无效维护任务')
      if (jobs[id]) return jobs[id]
      if (Object.values(jobs).some(job => job.status === 'running')) throw new Error('已有维护任务正在进行')
      const job: Job = jobs[id] = { id, kind, status: 'running' }
      // Bound completed task history; in-flight work is retained until shutdown drains it.
      for (const old of Object.keys(jobs).slice(0, -50)) if (jobs[old].status !== 'running') delete jobs[old]
      saveJobs()
      const task = Promise.resolve().then(async () => {
        const currentStory = await app.interlude.findStory(current)
        if (!currentStory) throw new Error('故事已变更')
        if (kind === 'compact') return budget.runManual(() => app.interlude.compactStory(currentStory))
        if (kind === 'overlay-clear') {
          const target = String(payload.target || '')
          if (!['character', 'perspective', 'relationship', 'world', 'all'].includes(target) || payload.confirm !== true) throw new Error('请确认要清理的人设演化范围')
          return app.interlude.clearSettingOverlay(currentStory, target as 'all')
        }
        if (kind === 'intent-cancel') {
          const intentId = Number(payload.id)
          if (!Number.isSafeInteger(intentId) || intentId <= 0 || payload.confirm !== true) throw new Error('请确认要取消的待办')
          if (!await app.interlude.cancelAdminIntent(currentStory.id, intentId)) throw new Error('待办已执行或取消，请刷新')
          return true
        }
        const scope = String(payload.scope || 'event')
        if (!['character', 'world', 'relationship', 'event', 'promise'].includes(scope)) throw new Error('无效事实类型')
        const factId = Number(payload.id)
        if (kind === 'fact-forget' && (!Number.isSafeInteger(factId) || factId <= 0)) throw new Error('无效事实编号')
        return app.interlude.mobileManageFact(currentStory, kind === 'fact-add' ? 'add' : 'forget', scope as 'event', String(payload.content ?? ''), factId)
      }).then(result => { job.status = 'done'; job.result = result }, error => { job.status = 'failed'; job.error = error instanceof Error ? error.message : '维护失败' }).finally(() => { saveJobs(); work.delete(task) })
      work.add(task)
      return job
    }
    if (method === 'preset.sync') return inspectPreset(app, String(payload.code ?? ''), normalizeMobileConfig(payload.current as MobileConfig ?? mobile), typeof payload.fingerprint === 'string' ? payload.fingerprint : undefined)
    if (method === 'preset.syncStatus') {
      const lifeRestartRequired = payload.current !== undefined && JSON.stringify(normalizeMobileConfig(payload.current as MobileConfig)) !== JSON.stringify(mobile)
      const desiredVision = payload.currentVision === undefined ? undefined : 'candidates' in (payload.currentVision as object)
        ? normalizeVisionProjection(payload.currentVision as ReturnType<typeof visionProjection>) : visionProjection(payload.currentVision as Parameters<typeof visionProjection>[0])
      const visionRestartRequired = desiredVision !== undefined && JSON.stringify(desiredVision) !== JSON.stringify(activeVision)
      return { restartRequired: lifeRestartRequired || visionRestartRequired, visionRestartRequired, activeVision, reasons: [...(lifeRestartRequired ? ['mobile-config-changed'] : []), ...(visionRestartRequired ? ['vision-config-changed'] : [])] }
    }
    if (method === 'config.status') return { retrievalTargets: retrieval.targets, retrieval: retrieval.status, sections: Object.fromEntries(mobileSchema().sections.map(section => [section.key, Object.fromEntries(section.fields.map(field => [field.key, (['embedding', 'rerank'].includes(section.key) ? (config.model as any)[section.key] : (config as any)[section.key])?.[field.key]]))])), budget: budget.status() }
    if (method === 'health') return { budget: budget.status(), hds: HDS.version, storyId: story.id, platform: bot.platform, sqlite: true }
    if (method === 'messages.since') {
      const query = messagesSinceQuery(payload.since)
      const limit = Math.max(1, Math.min(200, Math.floor(Number(payload.limit) || 200)))
      const rows = await app.database.get('mobile_message', query, { limit, sort: { occurredAt: 'asc', id: 'asc' } }) as PushRow[]
      // A timestamp cursor must include ALL messages at the page boundary, even
      // when several sends land in one millisecond. Otherwise strict > loses ties.
      if (rows.length === limit) {
        const boundary = rows[rows.length - 1].occurredAt
        const ties = await app.database.get('mobile_message', { direction: 'character', occurredAt: new Date(boundary) }, { sort: { id: 'asc' } }) as PushRow[]
        const ids = new Set(rows.map(row => row.id))
        rows.push(...ties.filter(row => !ids.has(row.id)))
      }
      return rows.map(messagePush)
    }
    if (method === 'messages.history') {
      const { query, limit } = historyQuery(payload)
      return (await app.database.get('mobile_message', query, { limit, sort: { occurredAt: 'desc', id: 'desc' } })).reverse().map(row => ({ ...row, occurredAt: new Date((row as { occurredAt: Date | string }).occurredAt).toISOString(), images: messageImages((row as { images?: unknown }).images), audio: messageAudio((row as { audio?: unknown }).audio), replyState: experience.replyState((row as { id: string }).id) }))
    }
    if (method === 'story.snapshot') { const active = await app.interlude.findStory(current); return { story: active, schedulingStatus: await app.interlude.adminSchedulingStatus(story.id), entries: await app.interlude.recentEntries(story.id, 80), facts: await app.interlude.adminFacts(story.id, 100), memories: await app.interlude.memories(story.id, 100), intents: await app.interlude.adminPendingIntents(story.id, 100), overlay: await app.interlude.adminOverlayStatus(story.id), promptTrace } }
    if (method === 'story.applySetting') {
      const active = await app.interlude.findStory(current)
      if (!active) throw new Error('未找到当前故事')
      story = await app.interlude.updateSetting(active, payload)
      return story.setting
    }
    if (method === 'story.pause' || method === 'story.resume') {
      const paused = method.endsWith('pause')
      if (paused) { storyPaused = true; experience.setPaused(true) }
      story = await app.interlude.setStatus(story, paused ? 'paused' : 'active')
      if (!paused && restoreHeld) { await app.interlude.setDesktopRuntimePhase('running'); unlinkSync(restoreMarker); restoreHeld = false }
      storyPaused = paused; experience.setPaused(paused)
      return { status: paused ? 'paused' : 'active' }
    }
    if (method === 'messages.sendLocal') {
      const id = String(payload.requestId ?? '')
      const content = String(payload.content ?? '').trim()
      const imageIds = payload.images === undefined ? [] : payload.images
      if (!Array.isArray(imageIds) || imageIds.length > 3 || !imageIds.every(value => typeof value === 'string')) throw new Error('最多附加 3 张图片')
      const images = (imageIds as string[]).map(value => media.get(value))
      if (images.length && !config.model.vision?.enabled) throw new Error('请在模型设置中开启主模型识图，并选择支持图片的模型；重启后生效')
      if (images.length) { const reason = visionRouteReason(activeVision); if (reason) throw new Error(reason) }
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || (!content && !images.length) || content.length > 12000) throw new Error('Invalid requestId or message')
      const audio = messageAudio(payload.audio)
      if (payload.audio && (!audio || !input.voiceBridge?.directory || !existsSync(join(input.voiceBridge.directory, `${audio.audioId}.wav`)))) throw new Error('录音不存在或格式无效')
      preserveAudio(audio)
      const signature = audio ? JSON.stringify({ content, images: imageIds, audio }) : images.length ? JSON.stringify({ content, images: imageIds }) : content
      const run = async () => {
        const old = (await app.database.get('mobile_request', { id }))[0] as { content: string; status: string } | undefined
        if (old && old.content !== signature) throw new Error('requestId conflicts with another message')
        if (old?.status === 'accepted') { diagnosticEvent('submission', 'accepted', { reason: 'duplicate' }); return { requestId: id, accepted: true, duplicate: true } }
        diagnosticEvent('submission', 'queued')
        if (!old) await app.database.create('mobile_request', { id, content: signature, status: 'receiving', occurredAt: new Date() })
        const accepted = await app.interlude.receive(session(id, content, images))
        if (!accepted) throw Object.assign(new Error('故事未接受消息；如果已暂停，请先在见闻恢复故事'), { code: 'HDS_NOT_ACCEPTED' })
        const visible = await app.database.get('mobile_message', { id })
        if (!visible.length) await app.database.create('mobile_message', { id, direction: 'user', content, images: imageIds, audio, occurredAt: new Date(), status: 'accepted' })
        await app.database.set('mobile_request', { id }, { status: 'accepted' })
        diagnosticEvent('submission', 'accepted')
        return { requestId: id, accepted: true }
      }
      const result = queue.then(() => runMessageDiagnostics(diagnostics, [id], async () => {
        try { return await run() } catch (error) { diagnosticEvent('submission', 'failed', { reason: diagnosticError(error) }); throw error }
      }))
      queue = result.then(() => {}, () => {})
      return result
    }
    throw new Error('Unknown or disallowed method')
  }
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url?.startsWith('/hds-interlude/sticker/')) {
      app.server._http.emit('request', request, response)
      return
    }
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    const auth = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${input.token}`)
    if (request.headers.host !== `127.0.0.1:${input.port}` || request.headers.origin || auth.length !== expected.length || !timingSafeEqual(auth, expected)) { response.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' })); return }
    if (request.method !== 'POST' || request.url !== '/rpc') { response.writeHead(404).end('{}'); return }
    try {
      let body = '', bytes = 0
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new Error('Request exceeds 1 MiB'); body += chunk.toString('utf8') }
      const data = JSON.parse(body)
      response.end(JSON.stringify({ data: await dispatch(data.method, data.payload ?? {}) }))
    } catch (error) { response.writeHead(400).end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request failed' })) }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(input.port, '127.0.0.1', () => resolve()) })
  let shutdown: Promise<void> | undefined
  const stop = () => shutdown ??= (async () => { closing = true; await experience.stop(); await new Promise<void>(resolve => server.close(() => resolve())); await qq?.close(); await queue; await Promise.allSettled([...work]); await bot.dispose(); await app.interlude.mobileDrainBeforeStop(); await drainVoice(); await app.stop() })()
  return { app, bot, server, stop, dispatch, qq, drainVoice }
}

if (process.env.HDS_MOBILE_MAIN === '1') {
  const lines = createInterface({ input: process.stdin, terminal: false })
  lines.once('line', async line => {
    try {
      // Verify the actual syscall; never hide a broken runtime by overriding cwd().
      if (process.cwd() !== '/opt/hds') throw new Error('Unexpected guest working directory')
      console.log('HDS runtime check: Node cwd OK; initializing Koishi / SQLite')
      const host = await startHost(JSON.parse(line))
      console.log('HDS_MOBILE_READY')
      const shutdown = async () => { await host.stop(); await new Promise<void>(resolve => process.stdout.write('HDS_MOBILE_CLEAN_STOP\n', () => resolve())); process.exit(0) }
      lines.on('line', command => { if (command === 'STOP') void shutdown() })
      process.on('SIGTERM', () => void shutdown())
      process.on('SIGINT', () => void shutdown())
    } catch (error) { console.error('HDS startup failed:', error instanceof Error ? error.message : 'unknown'); process.exit(1) }
  })
}
