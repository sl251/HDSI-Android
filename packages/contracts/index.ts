import { messageAudio, type MessageAudio, type VoiceState, type VoiceBinding, type Voice } from './voice'
import type { ExperienceSettings } from './experience'
export * from './experience'
export * from './voice'
import type { Card } from '../card-format'
import type { DiagnosticEvent } from './diagnostics'
/** Local UI navigation uses this contract; it does not create a native IPC channel. */
export type DiagnosticsMessageFocus = { type: 'diagnostics.message.focus'; messageId: string }
export const diagnosticsMessageFocus = (messageId: string): DiagnosticsMessageFocus => ({ type: 'diagnostics.message.focus', messageId })
export type DiagnosticMessageEvent = DiagnosticEvent & { providerLabel?: string }
export type DiagnosticMessagesResult = { events: DiagnosticMessageEvent[]; storageAvailable: boolean }
export type SavedCard = { id: string; card: Card; importedAt: string }
export type RuntimeStatus = { state: string; installed: boolean; environmentState: 'missing' | 'ready' | 'update-required' | 'repair-required'; running: boolean; cleanupPending: boolean; progress: string; error: string; diagnostic: Record<string, unknown>; logs: string[]; device: { model: string; android: string; sdk: number; abi: string; pageSize: number; availableBytes: number; build: string; webview: string }; version: string; hds: string }
export type ModelProvider = {
  id: string; preset: string; label: string; endpoint: string; model: string; modelsEndpoint?: string;
  protocol: 'chat-completions' | 'anthropic-messages'; enabled: boolean; credentialPresent: boolean;
  useForMain: boolean; useForCompaction: boolean; useForAlter: boolean; useForEmbedding?: boolean; useForWorldSeeding?: boolean;
  imageInput?: 'unknown' | 'supported' | 'unsupported';
  deepseekThinking?: 'inherit' | 'disabled' | 'enabled'; apiKey?: string; clearKey?: boolean;
}
export type ModelOptions = {
  mainStreamingMode: 'off' | 'experimental'; mainResponseFormat: 'json-object' | 'prompt-only';
  mainTemperature: number; mainMaxTokens: number; mainTimeout: number;
  maxAttemptsPerProvider: number; mobileTurnDeadlineMs: number; cooldownMinutes: number;
  mainPayloadOrder: 'cache-first' | 'legacy'; failoverEnabled: boolean; failoverStrategy: 'priority' | 'round-robin'; visionEnabled?: boolean; visionProviderId?: string;
}
export type MobileConfig = { sections?: Record<string, Record<string, unknown>>; backgroundLimit?: number }
export type ModelSettings = { mobileConfig?: MobileConfig; providers: ModelProvider[]; modelOptions: ModelOptions; userName: string; userProfile: string; autoAdvance: boolean }
export type ImageAttachment = { id: string; dataUri: string }
export type Message = { id: string; direction: 'user' | 'character'; content: string; occurredAt: string; status: string; images?: string[]; audio?: MessageAudio; replyState?: string }
/** SQLite JSON columns from older records may contain {} instead of an array. */
export function messageImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)))].slice(0, 3)
}
export type CharacterAvatar = { cardId: string; path?: string; revision?: number }
export type Appearance = { palette?: 'sky' | 'sage' | 'rose' | 'lavender' | 'amber'; font: 'default' | 'sans' | 'serif' | 'custom'; fontSize: number; backgroundOpacity: number; panelOpacity: number; backgroundBlur: number; backgroundData?: string; fontData?: string; fontName?: string; backgroundPath?: string; backgroundRevision?: number; fontPath?: string; fontRevision?: number; theme: 'system' | 'light' | 'dark' }
export type QQUserAccount = { qq: string; label: string; personId: string; profile: string; relationship: string; enabled: boolean }
export type QQWillingnessPreset = 'off' | 'quiet' | 'reserved' | 'normal' | 'active' | 'eager' | 'auto' | 'custom'
export type QQWillingness = { enabled: boolean; maxScore: number; threshold: number; probabilityAmplifier: number; decayHalfLifeSeconds: number; replyCost: number; baseGain: number; quoteGain: number; keywordGain: number }
export type QQGroupRule = {
  groupId: string; label: string; enabled: boolean; purpose: string; characterRole: string;
  responseMode: 'mention-only' | 'always'; contextLimit: number; debounceSeconds: number; cooldownSeconds: number;
  historicalImageLimit: number; willingnessPreset: QQWillingnessPreset; keywords: string[];
  willingness?: QQWillingness; willingnessAuto?: { busy?: string; idle?: string; asleep?: string };
}
export type QQPolicy = { enabled: boolean; users: QQUserAccount[]; groups: QQGroupRule[] }
export const newQQUser = (): QQUserAccount => ({ qq: '', label: '', personId: '', profile: '', relationship: '', enabled: true })
export const newQQGroup = (): QQGroupRule => ({ groupId: '', label: '', enabled: true, purpose: '', characterRole: '', responseMode: 'mention-only', contextLimit: 20, debounceSeconds: 1, cooldownSeconds: 60, historicalImageLimit: 3, willingnessPreset: 'off', keywords: [] })
export const newQQWillingness = (): QQWillingness => ({ enabled: false, maxScore: 1, threshold: 0.24, probabilityAmplifier: 1.3, decayHalfLifeSeconds: 180, replyCost: 0.55, baseGain: 0.12, quoteGain: 0.12, keywordGain: 0.18 })
export type DownloadProgress = { component: string; receivedBytes: number; totalBytes?: number; bytesPerSecond: number }
export type QQRecovery = { state: 'idle' | 'cleaning' | 'backoff' | 'restarting' | 'quick-login' | 'waiting-qr' | 'gave-up'; attempts: number; nextRetryAt: number; reason: string }
export type QQStatus = { phase: string; installed: boolean; running: boolean; loggedIn: boolean; online: boolean; progress: string; download?: DownloadProgress; error: string; account: string; nickname: string; qr: string; policy: QQPolicy; logs: string[]; recovery?: QQRecovery }
export type QQConversation = { id: string; name: string; last: string; time: number; unread: number }
export type QQMessage = { id: string; conversation: string; sender: string; name: string; content: string; time: number; outgoing: boolean }
export type MessageNotificationSettings = { enabled: boolean; permission: 'prompt' | 'granted' | 'denied'; available: boolean; mode?: 'popup' | 'normal' | 'silent'; preview?: boolean; foreground?: boolean; quietEnabled?: boolean; quietStart?: number; quietEnd?: number }
export type NativeBridge = {
  powerSettings?(): Promise<{ mode: 'continuous' | 'balanced' }>;
  savePowerSettings?(options: { mode: 'continuous' | 'balanced' }): Promise<{ mode: 'continuous' | 'balanced' }>;
  addListener?(event: 'messageReceived', listener: (value: { cardId: string }) => void): Promise<{ remove(): Promise<void> }>;
  addListener?(event: 'replyStream', listener: (value: { cardId: string; id: string; content?: string; status: string; sourceIds: string[]; occurredAt: string; delivered?: boolean }) => void): Promise<{ remove(): Promise<void> }>;
  experienceSettings(): Promise<ExperienceSettings>;
  saveExperience(options: ExperienceSettings & { cardId: string }): Promise<ExperienceSettings>;
  voiceState(): Promise<VoiceState>;
  saveVoiceSettings(options: { cooldown?: number; defaultVoiceId?: string; apiKey?: string; clearKey?: boolean; cardId?: string; binding?: VoiceBinding }): Promise<VoiceState>;
  saveVoice(options: Partial<Voice> & { name: string }): Promise<VoiceState>;
  deleteVoice(options: { id: string }): Promise<VoiceState>;
  voiceAudio(options: { audioId: string }): Promise<{ dataUri: string }>;
  previewVoice(options: { voiceId?: string; draft?: Pick<Voice, 'type' | 'value'> }): Promise<Partial<MessageAudio>>;
  pickVoiceAudio(): Promise<Partial<MessageAudio> & { cancelled?: boolean }>;
  startVoiceRecording(): Promise<void>;
  stopVoiceRecording(): Promise<MessageAudio>;
  cancelVoiceRecording(): Promise<void>;

  notificationSettings(): Promise<MessageNotificationSettings>;
  setMessageNotifications(options: { enabled: boolean } & Partial<Pick<MessageNotificationSettings, 'mode' | 'preview' | 'foreground' | 'quietEnabled' | 'quietStart' | 'quietEnd'>>): Promise<MessageNotificationSettings>;
  openNotificationSettings(): Promise<void>;
  notificationLaunch(): Promise<{ cardId?: string }>;
  characterAvatar(options: { cardId: string }): Promise<CharacterAvatar>;
  saveCharacterAvatar(options: { cardId: string; dataUri?: string; imageId?: string; clear?: boolean }): Promise<CharacterAvatar>;
  appearance(): Promise<Appearance>;
  saveAppearance(options: Appearance & { removeBackground?: boolean; removeFont?: boolean }): Promise<void>;
  pickAppearanceAsset(options: { kind: 'background' | 'font' }): Promise<Appearance & { cancelled?: boolean }>;
  pickImage(options?: { limit?: number; source?: 'camera' | 'gallery' }): Promise<{ cancelled: boolean; dataUri?: string; images?: { dataUri: string }[]; errors?: { index: number; message: string }[]; truncated?: boolean }>;
  pickStickers(options: { directory: boolean }): Promise<{ cancelled: boolean; name?: string; assets?: { id: string; path: string; size: number; mime: string }[]; skipped?: number }>;
  stickerImage(options: { id: string }): Promise<{ dataUri: string }>;
  syncStickerLibrary(options: { packs: { id: string; name: string; ids: string[]; pool?: 'user' | 'character' }[] }): Promise<void>;
  pruneStickers(options: { keep: string[] }): Promise<void>;
  exportStory(): Promise<{ cancelled: boolean }>;
  restoreStory(options: { cardId: string }): Promise<{ cancelled: boolean }>;
  restorePreviousStory(options: { cardId: string }): Promise<void>;
  resetStory(options: { cardId: string }): Promise<{ backup: string }>;
  status(): Promise<RuntimeStatus>;
  install(): Promise<void>;
  cancelInstall(): Promise<void>;
  diagnostics(options?: { probe?: boolean }): Promise<Record<string, unknown>>;
  copyDiagnostics(): Promise<void>;
  saveDiagnostics(): Promise<{ cancelled: boolean }>;
  saveMessageDiagnostics(options?: { messageId?: string }): Promise<{ cancelled: boolean }>;
  saveQQQr(options: { base64: string }): Promise<{ cancelled: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  settings(): Promise<ModelSettings & { activeCard: string }>;
  saveSettings(options: ModelSettings): Promise<void>;
  pickCard(): Promise<{ base64: string; name: string }>;
  exportCharacter(options: { filename: string; mime: string; content: string }): Promise<{ cancelled: boolean; name?: string }>;
  cards(): Promise<{ cards: SavedCard[] }>;
  saveCard(options: { card: Card; base64: string }): Promise<SavedCard>;
  selectCard(options: { id: string }): Promise<void>;
  updateCard(options: { id: string; card: Card }): Promise<SavedCard>;
  deleteCard(options: { id: string }): Promise<void>;
  rpc(options: { method: string; payload?: Record<string, unknown> }): Promise<{ data: unknown }>;
}

/** Non-secret route identity shared by the UI and host. Never project credentials/query strings. */
export type VisionProjection = {
  enabled: boolean; mode: 'native' | 'sidecar'; providerId: string;
  failoverEnabled: boolean; strategy: string;
  candidates: { id: string; endpoint: string; protocol: string; model: string; enabled: boolean; imageInput: 'unknown' | 'supported' | 'unsupported' }[];
}
export function visionProjection(input: { providers?: ModelProvider[]; modelOptions?: Partial<ModelOptions>; endpoint?: string; model?: string }): VisionProjection {
  const options = input.modelOptions ?? {}
  const providerId = options.visionProviderId || ''
  const rows = input.providers ?? [{ id: 'legacy-primary', endpoint: input.endpoint || '', model: input.model || '', enabled: true, useForMain: true } as ModelProvider]
  const candidates = rows.filter(row => providerId ? row.id === providerId : row.enabled && row.useForMain)
  return { enabled: options.visionEnabled === true, mode: providerId ? 'sidecar' : 'native', providerId,
    failoverEnabled: options.failoverEnabled ?? false, strategy: options.failoverStrategy ?? 'priority',
    candidates: candidates.map(row => {
      const protocol = row.protocol || 'chat-completions'
      const url = new URL(row.endpoint.trim())
      let path = url.pathname.replace(/\/+$/, '')
      const suffix = protocol === 'anthropic-messages' ? 'messages' : 'chat/completions'
      if (!path) path = '/v1/' + suffix
      else if (/\/v[0-9]+(?:beta[0-9]*)?$/.test(path)) path += '/' + suffix
      else path = path.replace(/\/(?:chat\/completions|messages)$/, '/' + suffix)
      const imageInput = row.imageInput ?? 'unknown'
      if (!['unknown', 'supported', 'unsupported'].includes(imageInput)) throw new Error('图片能力声明无效')
      return { id: row.id, endpoint: url.origin + path, protocol, model: row.model.trim(), enabled: row.enabled !== false, imageInput }
    }) }
}
export function visionRouteReason(route: VisionProjection): string | undefined {
  if (!route.enabled) return '请开启图片理解，重启后生效'
  if (!route.candidates.length || route.candidates.some(row => !row.enabled)) return '识图连接已移除或停用'
  if (route.candidates.some(row => row.imageInput === 'unsupported')) return '识图路线含不支持图片的模型，请选择独立识图模型'
  // 未声明（unknown）不再拦截：旧配置没有该字段，无法确认时按可发送处理，避免升级后误拦
}
export function imageEntryReason(input: { native: boolean; healthy: boolean; busy: boolean; sending: boolean; count: number; enabled: boolean }): string | undefined {
  if (!input.native) return '浏览器预览无法选择本机图片'
  if (!input.healthy) return '请先唤醒核心再添加图片'
  if (input.busy || input.sending) return '正在处理，请稍候再添加图片'
  if (input.count >= 3) return '最多 3 张图片，请先移除一张'
  if (!input.enabled) return '请到「空间 → 任务分工」开启图片理解，再把照片发来'
}

/** Share one read, and read again after a mutation that overlapped it. Revision keys isolate profiles. */
export function refreshCoordinator<T>(read: (revision: number) => Promise<T>, apply: (value: T, revision: number) => void) {
  const flights = new Map<number, { promise: Promise<void>; dirty: boolean }>()
  return (revision: number, changed = false): Promise<void> => {
    const running = flights.get(revision)
    if (running) { running.dirty ||= changed; return running.promise }
    const flight = { dirty: false, promise: Promise.resolve() }
    flights.set(revision, flight)
    flight.promise = (async () => {
      do { flight.dirty = false; const value = await read(revision); if (!flight.dirty) apply(value, revision) } while (flight.dirty)
    })().finally(() => { if (flights.get(revision) === flight) flights.delete(revision) })
    return flight.promise
  }
}
export function mergeMessages(previous: Message[], incoming: Message[]): Message[] {
  const old = new Map(previous.map(row => [row.id, row]))
  const next = incoming.map(row => {
    const normalized = { ...row, images: messageImages(row.images), audio: messageAudio(row.audio) }
    const before = old.get(row.id)
    return before && before.replyState === normalized.replyState && JSON.stringify(messageAudio(before.audio)) === JSON.stringify(normalized.audio) && before.content === normalized.content && before.status === normalized.status && before.direction === normalized.direction && before.occurredAt === normalized.occurredAt && JSON.stringify(messageImages(before.images)) === JSON.stringify(normalized.images) ? before : normalized
  })
  return next.length === previous.length && next.every((row, index) => row === previous[index]) ? previous : next
}
/** Read receipts are a local view; never add a read status to stored messages. */
export function messageStatusLabel(message: Pick<Message, 'direction' | 'status'> & Partial<Pick<Message, 'occurredAt'>>, lastCharacterReplyTs = 0): string {
  if (message.status === 'card-opening') return '角色卡开场白 · 本地已展示'
  if (message.direction === 'user' && message.status === 'accepted') return '核心已接收'
  return message.status === 'failed' ? '未送达·点击重试' : ''
}

export type SchedulingStatus = { requestId: string; outcome: 'registered' | 'rejected'; reasonCode: string; intentId?: number; dueAt?: string }

/** Re-normalize a projected RPC value, discarding unknown properties and preserving candidate order. */
export function normalizeVisionProjection(value: VisionProjection): VisionProjection {
  if (!value || !Array.isArray(value.candidates) || value.candidates.length > 12 || !['native', 'sidecar'].includes(value.mode) || (value.mode === 'sidecar') !== !!value.providerId) throw new Error('识图状态格式无效')
  return visionProjection({ providers: value.candidates.map(row => ({ ...row, useForMain: true } as ModelProvider)), modelOptions: { visionEnabled: value.enabled, visionProviderId: value.providerId, failoverEnabled: value.failoverEnabled, failoverStrategy: value.strategy as ModelOptions['failoverStrategy'] } })
}

/** Native explicit RPC rejection is distinct from an interrupted transport. */
export function localRequestFailure(error: unknown): 'failed' | 'unknown' {
  const value = error as { code?: unknown; message?: unknown } | null
  if (['IllegalArgumentException', 'RPC_REJECTED'].includes(String(value?.code))) return 'failed'
  return /未接受|请|无效|Invalid|conflict|最多/.test(String(value?.message ?? error)) ? 'failed' : 'unknown'
}
