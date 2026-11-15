import './preview-demo'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { fromBase64, parseCard, type Card } from '../../packages/card-format'
import type { DiagnosticsMessageFocus, QQConversation, SchedulingStatus, Message, ModelSettings, NativeBridge, RuntimeStatus, SavedCard } from '../../packages/contracts'
import { messageImages, imageEntryReason, visionProjection, visionRouteReason, refreshCoordinator, mergeMessages, localRequestFailure } from '../../packages/contracts'
import './style.css'
import { useExperience, ExperiencePanel } from './Experience'
import { Feed } from './Feed'
import { MediaJobNotice } from './MediaJobNotice'
import { AvatarSettings, useCharacterAvatar } from './CharacterAvatar'
import { MediaComposer } from './MediaComposer'
import { outbox } from './outbox'
import { NotificationBanner } from './NotificationBanner'
import { WeatherStatus } from './WeatherStatus'
import { HistorySearch } from './HistorySearch'
import { QuickStart } from './QuickStart'
import { PowerSettings } from './PowerSettings'
import { appendHistory, historyCursor, historyPageSize, recentHistory } from './history-state'
import { Onboarding, onboardingStorageKey, type OnboardingTarget } from './Onboarding'
import { RetrievalSettings } from './RetrievalSettings'
import { ModelCenter, defaultOptions, newProvider } from './ModelCenter'
import { CardEditor } from './CardEditor'
import { StorySettingEditor } from './StorySettingEditor'
import { CharacterExportModal } from './CharacterExportModal'
import { Inbox } from './Inbox'
import { parsePersona } from '../../packages/persona-format'
import { prepareCharacterImport, type CharacterImport } from './character-import'
import { CharacterImportModal } from './CharacterImportModal'
import { AppearanceSettings, useAppearance } from './AppearanceSettings'
import { StoredImage } from './StoredImage'
import { MemoryTools, type Fact } from './MemoryTools'
import { StoryManagement } from './StoryManagement'
import { BackgroundImage } from './BackgroundImage'
import { LifeSettings } from './LifeSettings'
import { MessageDiagnostics } from './MessageDiagnostics'
import { MessageFailureHint, useMessageActivity } from './MessageFailureHint'
import { MessageStatus, TypingBubble } from './MessageStatus'
import { createReplyWatermarks } from './message-state'
import { NotificationSettings } from './NotificationSettings'
import { settingEffects, settingEffectLabels } from './setting-effects'
import { createDraftStore, composerEnter, type Draft } from './composer-state'
import { clipboardJpeg } from './clipboard-image'
import { MessageContent } from './MessageContent'
import { VoiceBubble, VoiceSettings, useVoices } from './Voice'
import { messageAudio } from '../../packages/contracts/voice'
import { StickerDrawer, StickerManager, stickerSource } from './Stickers'
import { readLibrary, stickerImportReason, stickerEntryVisible, stickerSyncPacks, stickerMessageKey, libraryBytes, useSticker, type StickerLibrary, type StickerAsset } from './sticker-state'
import { SettingsSubpageHeader } from './SettingsSubpageHeader'
import { dispatchBackOverlay } from './back-stack'

const effectCaption = (key: keyof typeof settingEffects) => settingEffectLabels[settingEffects[key].timing]

const bridge = registerPlugin<NativeBridge>('HdsRuntime')
const spaceEntries = [
  { key: 'world', label: '角色与故事', caption: '角色库、修改人设、故事设定与记忆', title: '角色与故事' },
  { key: 'avatar', label: '角色形象与视觉', caption: '头像生成、固定外观、参考图与自主生图', title: '角色形象与视觉' },
  { key: 'visual', label: '角色视觉档案', caption: '固定外观、参考图与自主生图', title: '角色形象与视觉' },
  { key: 'chat', label: '聊天与输入', caption: '回车发送、流式回复、消息合并与表情包', title: '聊天与输入' },
  { key: 'voice', label: '角色语音与音色', caption: '角色说话的音色、合成与用量', title: '角色语音与音色' },
  { key: 'life', label: '持续生活', caption: '主动联系、情绪天气与后台运行', title: '持续生活' },
  { key: 'models', label: '模型与任务分工', caption: '服务连接、模型指派、检索与高级节奏', title: '模型与任务分工' },
  { key: 'tasks', label: '任务分工', caption: '对话、记忆、图片识别与检索', title: '模型与任务分工' },
  { key: 'advanced', label: '高级设置', caption: '后台预算、生成参数与世界节奏', title: '模型与任务分工' },
  { key: 'media', label: '语音识别与生图', caption: '独立服务、免费渠道与模型', title: '语音识别与生图' },
  { key: 'appearance', label: '界面个性化与通知', caption: '壁纸、字体、阅读样式与消息提醒', title: '界面个性化与通知' },
  { key: 'notifications', label: '消息通知', caption: '回复提醒与系统权限', title: '界面个性化与通知' },
  { key: 'system', label: '备份、诊断与帮助', caption: '存档、消息诊断、组件维护与引导', title: '备份、诊断与帮助' },
] as const
type SpacePage = typeof spaceEntries[number]['key']

const spaceSections: { title: string; keys: readonly SpacePage[]; includeInbox?: boolean }[] = [
  { title: '角色与叙事', keys: ['world', 'avatar'] },
  { title: '对话与日常', keys: ['chat', 'voice', 'life'], includeInbox: true },
  { title: '模型与多模态', keys: ['models', 'media'] },
  { title: '外观与系统', keys: ['appearance', 'system'] },
]
type Page = 'feed' | 'chat' | 'inbox' | 'cards' | 'story' | 'settings'
const tabs = ['chat', 'story', 'feed', 'settings'] as const
type Tab = typeof tabs[number]
const labels: Record<Page, string> = { feed: '动态', chat: '故事', inbox: '信箱', cards: '角色', story: '见闻', settings: '空间' }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
function Icon({ name }: { name: Page | 'arrow' | 'plus' }) {
  const paths = { feed: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l3 3m6 6 3 3M6 18l3-3m6-6 3-3', inbox: 'M3 5h18v14H3V5Zm0 0 9 8 9-8', chat: 'M5 4h14v12H9l-4 4V4Z', cards: 'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6M21 20v-2a7 7 0 0 0-4-6', story: 'M5 5h14M5 12h10M5 19h14', settings: 'M4 7h16M4 17h16M9 4v6M15 14v6', arrow: 'M5 12h14M13 6l6 6-6 6', plus: 'M12 5v14M5 12h14' }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
const MessageRow = React.memo(function MessageRow({ message, userName, characterName, lastCharacterReplyTs, onRetry, retryDisabled, sticker, entrance, failureReason, onDiagnosticFocus, avatar }: { sticker?: StickerAsset; avatar?: string; entrance?: number; message: Message; userName: string; characterName: string; lastCharacterReplyTs: number; onRetry: (message: Message) => void; retryDisabled: boolean; failureReason?: string; onDiagnosticFocus: (message: DiagnosticsMessageFocus) => void }) {
  const opening = message.status === 'card-opening'
  const characterSticker = message.direction === 'character' && !message.content.trim() && messageImages(message.images).length > 0
  const isSticker = !!sticker || characterSticker
  return <article data-read-anchor={`message-${message.id}`} style={entrance === undefined ? undefined : { '--i': entrance } as React.CSSProperties} className={`message${isSticker ? ' sticker-message' : ''}${entrance === undefined ? '' : ' message-enter'} ${message.direction === 'character' ? `character-reply${avatar ? ' has-avatar' : ''}` : message.direction}`}>
    {message.direction === "character" && avatar && <img className="character-avatar chat-avatar" src={avatar} alt={`${characterName}的头像`} />}
    {opening && <MessageStatus message={message} />}
    <div className="message-label">{message.direction === 'user' ? userName : characterName}<time>{new Date(message.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
    <div className={isSticker ? "sticker-body" : "bubble"}>{!isSticker && (messageAudio(message.audio) ? <VoiceBubble audio={messageAudio(message.audio)!} content={message.content} bridge={bridge} /> : message.direction === 'character' ? <MessageContent message={message} /> : message.content)}{sticker ? <StoredImage id={messageImages(message.images)[0]} bridge={bridge} source={stickerSource(sticker)} /> : messageImages(message.images).map(id => <StoredImage key={id} id={id} bridge={bridge} />)}</div>
    {message.replyState === 'failed' && message.direction === 'user' && <button className="message-retry" disabled={retryDisabled} onClick={() => onRetry(message)}>回复失败 · 重试回复</button>}
    {message.status === 'unknown' && <button className="message-retry" disabled={retryDisabled} onClick={() => onRetry(message)}>发送结果待确认 · 安全重试</button>}
    {!opening && <MessageStatus message={message} lastCharacterReplyTs={lastCharacterReplyTs} onRetry={() => onRetry(message)} disabled={retryDisabled} />}
    {message.direction === 'user' && failureReason && <MessageFailureHint messageId={message.id} reason={failureReason} focus={onDiagnosticFocus} />}
  </article>
})
function App() {
  const [page, updatePage] = useState<Page>('chat')
  const [onboardingOpen, setOnboardingOpen] = useState(() => { try { return localStorage.getItem(onboardingStorageKey) === null } catch { return true } })
  const [quickStartOpen, setQuickStartOpen] = useState(() => { try { return !localStorage.getItem('hds.quickstart.v1') && !localStorage.getItem(onboardingStorageKey) } catch { return true } })
  const [testedConnection, setTestedConnection] = useState('')
  const appShell = useRef<HTMLDivElement>(null)
  const [onboardingTargets] = useState(() => Object.fromEntries(['welcome', 'library', 'models', 'chat', 'story', 'help'].map(key => [key, React.createRef<HTMLElement>()])) as Record<OnboardingTarget, React.RefObject<HTMLElement>>)
  const guideOrigin = useRef<{ page: Page; space: SpacePage | null }>({ page: 'chat', space: null })
  const [pageMotion, setPageMotion] = useState<{ phase: 'idle' | 'exit' | 'enter' | 'edge'; direction: number }>({ phase: 'idle', direction: 0 })
  const [spaceMotion, setSpaceMotion] = useState<'none' | 'forward' | 'back'>('none')
  const pageTimer = useRef<ReturnType<typeof setTimeout>>()
  const pageFrames = useRef<number[]>([])
  const touchStart = useRef<{ x: number; y: number; id: number; page: Page } | null>(null)
  const [spacePage, setSpacePage] = useState<SpacePage | null>(null)
  const [worldTab, setWorldTab] = useState<'story' | 'library'>('story')
  const [systemTab, setSystemTab] = useState<'backup' | 'diagnostics'>('backup')
  const [messageDiagnostic, setMessageDiagnostic] = useState<string | null>(null)
  const focusMessageDiagnostic = useCallback((message: DiagnosticsMessageFocus) => setMessageDiagnostic(message.messageId), [])
  const [settingEditor, setSettingEditor] = useState(false)
  const [inboxSource, setInboxSource] = useState<'tab' | 'space'>('tab')
  const previousTab = useRef<Page>('chat')
  const inboxBack = useRef<(() => boolean) | null>(null)
  const [inboxUnread, setInboxUnread] = useState(0)
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [cards, setCards] = useState<SavedCard[]>([])
  const [selected, setSelected] = useState('')
  useEffect(() => setMessageDiagnostic(null), [selected])
  const selectedRef = useRef(selected)
  const openNotification = useRef<(cardId: string) => Promise<void>>(async () => {})
  const replyWatermarks = useRef(createReplyWatermarks())
  const lastCharacterReplyTs = replyWatermarks.current.get(selected)
  const [settings, setSettings] = useState<ModelSettings>({ providers: [newProvider()], modelOptions: defaultOptions, userName: '我', userProfile: '', autoAdvance: false })
  const [messages, setMessages] = useState<Message[]>([])
  const [historySearch, setHistorySearch] = useState(false), [hasOlder, setHasOlder] = useState(false), [loadingOlder, setLoadingOlder] = useState(false)
  const prependAnchor = useRef<{ id: string; top: number }>()
  const [story, setStory] = useState<{ story?: { status: string; setting?: { character?: { name?: string } }; state?: { alterSystem?: { emotionalOffset?: { description: string; direction: string } | null } } }; schedulingStatus?: SchedulingStatus[]; entries: { id: number; content: string; occurredAt: string; kind: string }[]; facts: Fact[]; memories: { id: number; content: string; summary?: string }[]; intents?: { id: number; summary: string; notBefore?: string; type?: string; payload?: { kind?: string } }[]; overlay?: { state: Record<string, unknown> }; promptTrace: string[] } | null>(null)
  const draftStore = useRef(createDraftStore(localStorage))
  const draftCache = useRef(new Map<string, Draft>())
  const [, redrawDraft] = useState(0)
  const getDraft = (id: string) => {
    if (!draftCache.current.has(id)) draftCache.current.set(id, draftStore.current.read(id))
    return draftCache.current.get(id)!
  }
  const { content: draft, attachments, audio: draftAudio } = getDraft(selected)
  const updateDraft = (patch: Partial<Draft>, id = selectedRef.current) => {
    if (!id) return
    const next = { ...getDraft(id), ...patch }
    draftCache.current.set(id, next)
    try { draftStore.current.write(id, next) } catch { setNotice('本机草稿空间不足，当前输入仍保留，请发送后清理存储。') }
    redrawDraft(value => value + 1)
  }
  const setDraft = (content: string) => updateDraft({ content })
  const setAttachments = (value: Draft['attachments'] | ((current: Draft['attachments']) => Draft['attachments'])) => updateDraft({ attachments: typeof value === 'function' ? value(getDraft(selectedRef.current).attachments) : value })
  const composing = useRef(false)
  const sendLock = useRef(false)
  const [stickers, setStickers] = useState(() => readLibrary(localStorage))
  const stickersRef = useRef(stickers)
  const saveStickers = (value: StickerLibrary) => {
    localStorage.setItem('hds-stickers-v1', JSON.stringify(value))
    stickersRef.current = value; setStickers(value)
  }
  const [mediaDrawer, setMediaDrawer] = useState(false), [voiceBar, setVoiceBar] = useState(false), [voiceRecording, setVoiceRecording] = useState(false), [voiceCancel, setVoiceCancel] = useState(false)
  const voiceHold = useRef({ active: false, startedAt: 0, startY: 0, cancel: false, recorderStarted: false })
  const stopInlineVoice = async (cancel = false) => {
    const wasStarted = voiceHold.current.recorderStarted
    voiceHold.current.active = false; voiceHold.current.recorderStarted = false; setVoiceRecording(false); setVoiceCancel(false)
    if (!wasStarted) return
    try {
      if (cancel) await bridge.cancelVoiceRecording()
      else { const audio = await bridge.stopVoiceRecording(); updateDraft({ audio }) }
    } catch (error) { setNotice(errorText(error)) }
  }
  const startInlineVoice = async (y: number) => {
    if (voiceHold.current.recorderStarted) { await stopInlineVoice(false); return }
    voiceHold.current = { active: true, startedAt: Date.now(), startY: y, cancel: false, recorderStarted: false }
    setVoiceCancel(false); setVoiceRecording(true)
    try {
      await bridge.startVoiceRecording()
      voiceHold.current.recorderStarted = true
      if (!voiceHold.current.active) await stopInlineVoice(voiceHold.current.cancel)
    } catch (error) { voiceHold.current.active = false; setVoiceRecording(false); setNotice(errorText(error)) }
  }
  const outgoing = useRef(outbox(localStorage))
  const [outgoingRows, setOutgoingRows] = useState<Message[]>([])
  useEffect(() => { setOutgoingRows(outgoing.current.read(selected)); setMediaDrawer(false); setVoiceRecording(false); setVoiceCancel(false) }, [selected])
  const [stickerDrawer, setStickerDrawer] = useState(false)
  const [stickerManager, setStickerManager] = useState(false)
  const stickerManagerBack = useRef<(() => void) | undefined>()
  useEffect(() => { composing.current = false; setStickerDrawer(false) }, [selected, page])
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'failed' | 'unknown' | 'accepted'>('idle')
  const [retryTarget, setRetryTarget] = useState<Message | null>(null)
  const [newMessages, setNewMessages] = useState(0)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<{ card: Card; base64: string } | null>(null)
  const [importChoices, setImportChoices] = useState<{ card: Card; base64: string }[]>([])
  const [editingCard, setEditingCard] = useState<SavedCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedCard | null>(null)
  const [newName, setNewName] = useState('')
  const [newProfile, setNewProfile] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [importCodeOpen, setImportCodeOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportCardId, setExportCardId] = useState('')
  const openCardExport = (id: string) => { setExportCardId(id); setExportOpen(true) }
  const [detail, updateDetail] = useState<'story' | 'memory' | 'mind'>('story')
  const [switcher, setSwitcher] = useState(false)
  const [saveState, setSaveState] = useState('设置自动保存')
  const [saveError, setSaveError] = useState('')
  const [restartNeeded, setRestartNeeded] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  const focusAfterWake = useRef(false)
  const launchedSettings = useRef('')
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const savedSettings = useRef('')
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const profileRevision = useRef(0)
  const imageLock = useRef(false)
  const pending = useRef<{ requestId: string; content: string; images?: string[]; audio?: Message['audio'] } | null>(null)
  const sendRef = useRef<(message?: Message) => Promise<void>>(async () => {})
  const retryMessage = useCallback((message: Message) => { void sendRef.current(message) }, [])
  const active = cards.find(card => card.id === selected)
  const characterName = story?.story?.setting?.character?.name || active?.card.name || ''
  const native = Capacitor.isNativePlatform()
  const experience = useExperience(bridge, native, selected, runtime?.state === 'healthy')
  const scopedBridge = React.useMemo(() => new Proxy(bridge, { get(target, property) { if (property === 'rpc') return (request: Parameters<NativeBridge['rpc']>[0]) => { if (selectedRef.current !== selected) return Promise.reject(new Error('故事已切换，请回到原故事继续')); return target.rpc({ ...request, payload: { ...request.payload, expectedCardId: selected } }) }; return Reflect.get(target, property) } }), [selected])
  const displayMessages = [...messages, ...outgoingRows.filter(row => !messages.some(m => m.id === row.id))].sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  const pendingInHistory = displayMessages.some(row => row.id === pending.current?.requestId && ['failed', 'unknown'].includes(row.status || ''))
  const voices = useVoices(bridge, native)
  const avatar = useCharacterAvatar(bridge, native, selected, profileRevision.current)
  const appearance = useAppearance(bridge, native, setNotice)
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null)
  const navigation = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const switcherAnchorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!switcher) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!switcherAnchorRef.current?.contains(event.target as Node)) setSwitcher(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSwitcher(false) }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [switcher])
  // 点击表情抽屉和表情按钮以外的任何区域自动收起表情抽屉
  useEffect(() => {
    if (!stickerDrawer) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.sticker-drawer, .sticker-entry')) return
      setStickerDrawer(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setStickerDrawer(false) }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [stickerDrawer])
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let baseline = viewport.height
    const resize = () => {
      const editing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      if (!editing) baseline = viewport.height
      appShell.current?.classList.toggle('keyboard-open', innerWidth < 768 && editing && baseline - viewport.height > 150)
    }
    viewport.addEventListener('resize', resize); document.addEventListener('focusout', resize)
    return () => { viewport.removeEventListener('resize', resize); document.removeEventListener('focusout', resize) }
  }, [])
  const scroll = useRef<HTMLDivElement>(null)
  const pageRef = useRef(page)
  pageRef.current = page
  const storyLifetimes = useRef(new Map<string, number>())
  const positions = useRef(new Map<string, { y: number; anchor?: string; offset?: number; drawers: boolean[] }>())
  const nearBottom = useRef(true)
  const forceBottom = useRef(false)
  const userMoved = useRef(false)
  const restored = useRef('')
  const locationKey = `${selected}:${storyLifetimes.current.get(selected) ?? 0}:${page}:${page === 'story' ? detail : page === 'settings' ? spacePage ?? '' : ''}`
  const savePosition = () => {
    const anchor = [...document.querySelectorAll<HTMLElement>('[data-read-anchor]')].find(element => element.getBoundingClientRect().bottom > 0)
    positions.current.set(locationKey, { y: window.scrollY, anchor: anchor?.dataset.readAnchor, offset: anchor?.getBoundingClientRect().top, drawers: [...document.querySelectorAll<HTMLDetailsElement>('.memory-drawer')].map(element => element.open) })
  }
  const cancelPageMotion = () => { clearTimeout(pageTimer.current); pageFrames.current.forEach(cancelAnimationFrame); pageFrames.current = [] }
  useEffect(() => () => { clearTimeout(pageTimer.current); pageFrames.current.forEach(cancelAnimationFrame) }, [])
  const setPage = (next: Page, direction = 0) => {
    cancelPageMotion()
    if (next === page) { setPageMotion({ phase: 'idle', direction: 0 }); return }
    savePosition()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPageMotion({ phase: 'idle', direction: 0 }); updatePage(next); return }
    const enter = () => {
      setPageMotion({ phase: 'enter', direction }); updatePage(next)
      pageFrames.current.push(requestAnimationFrame(() => {
        pageFrames.current.push(requestAnimationFrame(() => setPageMotion({ phase: 'idle', direction })))
      }))
    }
    // Clicks keep the existing immediate navigation semantics, then fade in.
    if (!direction) { enter(); return }
    setPageMotion({ phase: 'exit', direction })
    pageTimer.current = setTimeout(enter, 90)
  }
  const openInbox = (source: 'tab' | 'space', direction = 0) => {
    if (page !== 'inbox') previousTab.current = page === 'cards' ? 'chat' : page
    setInboxSource(source); setPage('inbox', direction)
  }
  const openSpace = (next: typeof spacePage, direction?: number) => {
    if (page === 'settings') savePosition()
    if (next === 'world' && spacePage !== 'world') setWorldTab('story')
    if (next === 'system' && spacePage !== 'system') setSystemTab('backup')
    if (page === 'settings' && next !== spacePage) {
      const resolved = direction ?? (next ? 1 : -1)
      setSpaceMotion(matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : resolved >= 0 ? 'forward' : 'back')
    } else {
      setSpaceMotion('none')
    }
    setSpacePage(next)
    setPage('settings', page === 'settings' ? 0 : (direction ?? 0))
  }
  const selectTab = (next: Tab, direction = 0) => next === 'settings' ? openSpace(null, direction) : setPage(next, direction)
  const prepareOnboarding = (target: OnboardingTarget) => {
    setSwitcher(false)
    cancelPageMotion(); setPageMotion({ phase: 'idle', direction: 0 }); touchStart.current = null
    if (target === 'library') updatePage('cards')
    else if (target === 'models' || target === 'help') { setSpacePage(null); updatePage('settings') }
    else if (target === 'story') { updateDetail('story'); updatePage('story') }
    else updatePage('chat')
  }
  const closeOnboarding = () => {
    try { localStorage.setItem(onboardingStorageKey, '1') } catch { setNotice('本机存储暂不可用，下次打开时可能再次显示引导。') }
    cancelPageMotion(); setPageMotion({ phase: 'idle', direction: 0 }); setOnboardingOpen(false)
    setSpacePage(guideOrigin.current.space); updatePage(guideOrigin.current.page)
  }
  const startOnboarding = () => { savePosition(); guideOrigin.current = { page, space: spacePage }; setOnboardingOpen(true) }
  const beginSwipe = (event: React.TouchEvent<HTMLElement>) => {
    touchStart.current = null
    if (onboardingOpen || pageMotion.phase !== 'idle' || event.touches.length !== 1 || !tabs.includes(page as Tab)) return
    const target = event.target as HTMLElement
    if (target.closest('.modal-backdrop, .sticker-drawer, .composer-wrap, .select-field, .select-popover, .character-dropdown, input, textarea, select, audio, [contenteditable="true"]') || document.querySelector('[aria-modal="true"], .image-viewer')) return
    const touch = event.touches[0]
    // Leave the screen edges to the system's back gesture.
    if (touch.clientX <= 24 || touch.clientX >= innerWidth - 24) return
    touchStart.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier, page }
  }
  const endSwipe = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchStart.current; touchStart.current = null
    if (!start || start.page !== page || event.touches.length) return
    const touch = Array.from(event.changedTouches).find(value => value.identifier === start.id)
    if (!touch) return
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
    const direction = dx < 0 ? 1 : -1
    const next = tabs[tabs.indexOf(page as Tab) + direction]
    if (next) selectTab(next, direction)
    else if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelPageMotion(); setPageMotion({ phase: 'edge', direction: -direction })
      pageTimer.current = setTimeout(() => setPageMotion({ phase: 'idle', direction: -direction }), 100)
    }
  }
  useEffect(() => {
    const handleBack = () => {
      if (onboardingOpen) { closeOnboarding(); return true }
      if (dispatchBackOverlay()) return true
      if (historySearch) { setHistorySearch(false); return true }
      if (stickerManager) { stickerManagerBack.current?.(); return true }
      if (stickerDrawer) { setStickerDrawer(false); return true }
      if (mediaDrawer) { setMediaDrawer(false); return true }
      if (exportOpen) { if (!busy) setExportOpen(false); return true }
      if (importCodeOpen) { if (!busy) setImportCodeOpen(false); return true }
      if (messageDiagnostic !== null) { setMessageDiagnostic(null); return true }
      if (settingEditor) { setSettingEditor(false); return true }
      if (page === 'inbox') {
        if (inboxBack.current?.()) return true
        if (inboxSource === 'space') openSpace(null, -1)
        else setPage(previousTab.current === 'inbox' ? 'chat' : previousTab.current)
        return true
      }
      if (switcher) { setSwitcher(false); return true }
      if (page === 'settings' && spacePage) { openSpace(null, -1); return true }
      if (page === 'cards') { setPage('chat'); return true }
      return false
    }
    const target = window as Window & { hdsHandleBack?: () => boolean }
    target.hdsHandleBack = handleBack
    return () => { delete target.hdsHandleBack }
  })
  const setDetail = (next: typeof detail) => { savePosition(); updateDetail(next) }
  const toLatest = () => { forceBottom.current = true; nearBottom.current = true; userMoved.current = false; setNewMessages(0); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
  useEffect(() => {
    const onScroll = () => { if (pageRef.current !== 'chat') return; nearBottom.current = document.documentElement.scrollHeight - innerHeight - scrollY < 96; if (nearBottom.current) setNewMessages(0) }
    const moved = () => { userMoved.current = true; forceBottom.current = false }
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('wheel', moved, { passive: true }); window.addEventListener('touchstart', moved, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('wheel', moved); window.removeEventListener('touchstart', moved) }
  }, [])
  useLayoutEffect(() => {
    if (onboardingOpen) return
    if ((page === 'story' && !story) || (page === 'chat' && !messages.length)) return
    if (restored.current === locationKey) return
    restored.current = locationKey; userMoved.current = false
    const saved = positions.current.get(locationKey)
    const restore = () => {
      if (userMoved.current) return
      if (saved) {
        document.querySelectorAll<HTMLDetailsElement>('.memory-drawer').forEach((element, index) => { element.open = saved.drawers[index] ?? false })
        const anchor = [...document.querySelectorAll<HTMLElement>('[data-read-anchor]')].find(element => element.dataset.readAnchor === saved.anchor)
        window.scrollTo(0, anchor && saved.offset !== undefined ? scrollY + anchor.getBoundingClientRect().top - saved.offset : saved.y)
      } else window.scrollTo(0, page === 'chat' || (page === 'story' && detail === 'story') ? document.documentElement.scrollHeight : 0)
      if (page === 'chat') nearBottom.current = document.documentElement.scrollHeight - innerHeight - scrollY < 96
    }
    restore(); const frame = requestAnimationFrame(restore)
    const observer = new ResizeObserver(restore); const main = document.querySelector('main'); if (main) observer.observe(main)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [locationKey, !!story, !!messages.length, onboardingOpen])
  useLayoutEffect(() => {
    if (page !== 'chat' || onboardingOpen) return
    const follow = () => { if (nearBottom.current || forceBottom.current) { window.scrollTo(0, document.documentElement.scrollHeight); forceBottom.current = false } }
    follow(); const observer = new ResizeObserver(follow); const list = document.querySelector('.messages'); if (list) observer.observe(list)
    return () => observer.disconnect()
  }, [page, messages, onboardingOpen])
  useLayoutEffect(() => {
    const element = composer.current
    if (!element) return
    const resize = () => { element.style.height = 'auto'; element.style.height = `${Math.max(42, Math.min(150, element.scrollHeight))}px`; element.style.overflowY = element.scrollHeight > 150 ? 'auto' : 'hidden' }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft, selected, page, voiceBar, appearance.value.fontSize])
  const act = async (task: () => Promise<unknown>, success?: string) => {
    setBusy(true); setNotice('')
    try { await task(); if (success) setNotice(success) } catch (error) { setNotice(errorText(error)) } finally { setBusy(false) }
  }
  const refreshCards = async () => { const data = await bridge.cards(); setCards(data.cards); const prefs = await bridge.settings(); selectedRef.current = prefs.activeCard; setSelected(prefs.activeCard) }
  const storyChanged = async (historyReplaced = false) => {
    messagesRef.current = []
    setHistorySearch(false); setHasOlder(false); setLoadingOlder(false); prependAnchor.current = undefined
    localStorage.removeItem(`hds-maintenance-${selected}`)
    if (historyReplaced) replyWatermarks.current.clear(selected)
    for (const key of positions.current.keys()) if (key.startsWith(`${selected}:`)) positions.current.delete(key)
    storyLifetimes.current.set(selected, (storyLifetimes.current.get(selected) ?? 0) + 1); restored.current = ''; profileRevision.current++; pending.current = null; setRetryTarget(null); setRequestState('idle'); setMessages([]); setStory(null)
    await refreshCards(); setRuntime(await bridge.status()); setRestartNeeded(false)
  }
  const storyReads = useRef(refreshCoordinator(async () => (await bridge.rpc({ method: 'story.snapshot' })).data as typeof story, (value, revision) => { if (revision === profileRevision.current) setStory(value) }))
  const refreshStory = () => storyReads.current(profileRevision.current, true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const historyReads = useRef(refreshCoordinator(async () => {
    const cardId = selectedRef.current
    return { cardId, ...await recentHistory(messagesRef.current, async before => (await bridge.rpc({ method: 'messages.history', payload: { limit: historyPageSize, expectedCardId: cardId, ...(before ? { before } : {}) } })).data as Message[]) }
  }, ({ cardId, rows: value, replace, hasOlder: older }, revision) => {
    if (revision !== profileRevision.current || !cardId || cardId !== selectedRef.current) return
    replyWatermarks.current.observe(cardId, value)
    try { outgoing.current.remove(cardId, value.map(row => row.id)); setOutgoingRows(outgoing.current.read(cardId)) } catch { /* Retain the durable queue when storage is temporarily unavailable. */ }
    const request = pending.current
    if (request && value.some(row => row.id === request.requestId && row.status === 'accepted')) {
      pending.current = null; setRetryTarget(null); setRequestState('accepted')
      if (!stickersRef.current.messages[stickerMessageKey(cardId, request.requestId)] && getDraft(cardId).content.trim() === request.content && JSON.stringify(getDraft(cardId).attachments.map(image => image.id)) === JSON.stringify(request.images ?? [])) { updateDraft({ content: '', attachments: [], audio: undefined }, cardId) }
    }
    const previous = replace ? [] : messagesRef.current
    if (!previous.length) setHasOlder(older)
    const next = appendHistory(previous, value)
    if (previous.length && !nearBottom.current) { const ids = new Set(previous.map(row => row.id)); const count = next.filter(row => !ids.has(row.id)).length; if (count) setNewMessages(current => current + count) }
    messagesRef.current = next; setMessages(next)
  }))
  const refreshHistory = () => historyReads.current(profileRevision.current)
  const loadOlder = async () => {
    if (loadingOlder || !messagesRef.current.length) return
    const revision = profileRevision.current, first = messagesRef.current[0]
    setLoadingOlder(true)
    try {
      const rows = (await scopedBridge.rpc({ method: 'messages.history', payload: { limit: historyPageSize, before: historyCursor(first) } })).data as Message[]
      if (revision !== profileRevision.current) return
      const anchor = [...document.querySelectorAll<HTMLElement>('[data-read-anchor]')].find(element => element.dataset.readAnchor === `message-${first.id}`)
      if (anchor) prependAnchor.current = { id: first.id, top: anchor.getBoundingClientRect().top }
      forceBottom.current = false; nearBottom.current = false; userMoved.current = true
      const next = appendHistory(messagesRef.current, rows); messagesRef.current = next; setMessages(next); setHasOlder(rows.length === historyPageSize)
    } catch (error) { if (revision === profileRevision.current) setNotice(errorText(error)) }
    finally { if (revision === profileRevision.current) setLoadingOlder(false) }
  }
  useLayoutEffect(() => {
    const anchor = prependAnchor.current; if (!anchor) return
    prependAnchor.current = undefined
    const element = [...document.querySelectorAll<HTMLElement>('[data-read-anchor]')].find(row => row.dataset.readAnchor === `message-${anchor.id}`)
    if (element) window.scrollBy({ top: element.getBoundingClientRect().top - anchor.top, behavior: 'instant' })
  }, [messages, hasOlder])
  useEffect(() => {
    if (!native) { setNotice('浏览器预览模式：原生运行与存储不可用，不显示模拟成功结果。'); return }
    void Promise.all([bridge.settings(), bridge.cards()]).then(([prefs, library]) => { savedSettings.current = JSON.stringify(prefs); setSettings(prefs); setSettingsReady(true); selectedRef.current = prefs.activeCard; setSelected(prefs.activeCard); setCards(library.cards) }).catch(error => setNotice(errorText(error)))
    let stopped = false, polling = false, lastHistory = 0
    const poll = async () => {
      if (polling || stopped || document.hidden) return
      polling = true
      try {
        let status = await bridge.status()
        if (stopped) return
        if (savedSettings.current) {
          const launch = await bridge.notificationLaunch()
          if (launch.cardId) { await openNotification.current(launch.cardId); status = await bridge.status() }
        }
        setRuntime(status)
        if (status.state === 'healthy' && (lastHistory === 0 || !messagesRef.current.length || Date.now() - lastHistory >= 15000)) {
          lastHistory = Date.now()
          await refreshHistory()
        }
      } catch (error) { if (!stopped) setNotice(errorText(error)) } finally { polling = false }
    }
    const visible = () => { if (!document.hidden) { lastHistory = 0; void poll() } }
    const listener = bridge.addListener?.('messageReceived', event => { if (!stopped && !document.hidden && event.cardId === selectedRef.current) void refreshHistory().catch(error => setNotice(errorText(error))) }).catch(() => undefined)
    document.addEventListener('visibilitychange', visible)
    void poll(); const interval = setInterval(() => void poll(), 3000)
    return () => { stopped = true; clearInterval(interval); document.removeEventListener('visibilitychange', visible); void listener?.then(handle => handle?.remove()) }
  }, [native])
  useEffect(() => {
    if (page !== 'story' || runtime?.state !== 'healthy') return
    let cancelled = false, loading = false
    const refresh = async () => {
      if (loading || document.hidden) return
      loading = true
      try { await storyReads.current(profileRevision.current) }
      catch (error) { if (!cancelled) setNotice(errorText(error)) }
      finally { loading = false }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [page, runtime?.state, selected])
  useEffect(() => {
    if (!native || runtime?.state !== 'healthy') { setInboxUnread(0); return }
    let cancelled = false, running = false
    const poll = async () => {
      if (running || document.hidden) return
      running = true
      try {
        const result = await bridge.rpc({ method: 'qq.conversations' })
        if (!cancelled) setInboxUnread((result.data as QQConversation[]).reduce((total, row) => total + row.unread, 0))
      } catch { if (!cancelled) setInboxUnread(0) }
      finally { running = false }
    }
    void poll(); const timer = setInterval(() => void poll(), 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [native, runtime?.state])
  const persistSettings = () => {
    const next = saveQueue.current.catch(() => {}).then(async () => {
      if (!native || !settingsReady) return
      const snapshot = settingsRef.current
      const fingerprint = JSON.stringify(snapshot)
      if (fingerprint === savedSettings.current) return
      setSaveState('正在保存…'); setSaveError('')
      try {
        await bridge.saveSettings(snapshot)
        const saved = await bridge.settings()
        savedSettings.current = fingerprint
        // Do not overwrite edits made while native encrypted storage was writing.
        if (settingsRef.current === snapshot) {
          const merged = { ...saved, providers: snapshot.providers.map(row => saved.providers.find(item => item.id === row.id) ?? row) }
          savedSettings.current = JSON.stringify(merged)
          settingsRef.current = merged; setSettings(merged)
        }
        setSaveState('已自动保存')
        if (runtimeRef.current?.running) setRestartNeeded(true)
      } catch (error) { setSaveState('尚未保存'); setSaveError(errorText(error)); throw error }
    })
    saveQueue.current = next
    return next
  }
  useEffect(() => {
    if (!native || !settingsReady || JSON.stringify(settings) === savedSettings.current) return
    setSaveState('等待保存')
    const timer = setTimeout(() => {
      const element = document.activeElement
      if (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type !== 'checkbox')) return
      void persistSettings().catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [settings, native, settingsReady])
  useEffect(() => {
    if (runtime?.state === 'healthy' && focusAfterWake.current) {
      setRestartNeeded(!!launchedSettings.current && JSON.stringify(settingsRef.current) !== launchedSettings.current)
      if (page === 'chat') { composer.current?.focus(); focusAfterWake.current = false }
    }
    if (runtime?.state === 'failed') focusAfterWake.current = false
  }, [runtime?.state, page])
  useEffect(() => {
    if (!native || !settingsReady || runtime?.state !== 'healthy') return
    const revision = profileRevision.current
    let cancelled = false
    void Promise.resolve().then(() => bridge.rpc({ method: 'preset.syncStatus', payload: { currentVision: visionProjection(settingsRef.current) } })).then(result => {
      if (!cancelled && revision === profileRevision.current && (result.data as { visionRestartRequired?: boolean }).visionRestartRequired) setRestartNeeded(true)
    }).catch(() => { if (!cancelled && revision === profileRevision.current) setNotice('无法核对核心识图配置，选图前会重新检查。') })
    return () => { cancelled = true }
  }, [native, settingsReady, runtime?.state, selected])
  const wake = () => act(async () => {
    if (!active) { setSwitcher(true); return }
    if (!settingsRef.current.providers.some(row => row.enabled && row.useForMain && row.endpoint && row.model)) { setPage('settings'); setNotice('为故事选择一个模型，就可以开始了。'); return }
    await persistSettings()
    focusAfterWake.current = true
    try { launchedSettings.current = JSON.stringify(settingsRef.current); await bridge.syncStickerLibrary({ packs: stickerSyncPacks(stickersRef.current) }); await bridge.start(); setRuntime(await bridge.status()) }
    catch (error) { focusAfterWake.current = false; throw error }
  })
  const restart = () => act(async () => {
    await persistSettings()
    await bridge.stop(); setRuntime(await bridge.status())
    focusAfterWake.current = true
    launchedSettings.current = JSON.stringify(settingsRef.current); await bridge.syncStickerLibrary({ packs: stickerSyncPacks(stickersRef.current) }); await bridge.start(); setRuntime(await bridge.status())
  })
  const switchCard = (id: string) => act(async () => {
    if (id === selectedRef.current) { setSwitcher(false); return }
    const resume = (await bridge.status()).state === 'healthy'
    savePosition(); profileRevision.current++; selectedRef.current = ''
    try { await bridge.selectCard({ id }) } catch (error) { selectedRef.current = selected; throw error }
    profileRevision.current++
    messagesRef.current = []; setHasOlder(false); setLoadingOlder(false); setHistorySearch(false); prependAnchor.current = undefined
    pending.current = null; setRetryTarget(null); setRequestState('idle'); setMessages([]); setStory(null)
    await refreshCards(); setRuntime(await bridge.status()); setSwitcher(false)
    if (resume) { await persistSettings(); focusAfterWake.current = true; launchedSettings.current = JSON.stringify(settingsRef.current); await bridge.syncStickerLibrary({ packs: stickerSyncPacks(stickersRef.current) }); await bridge.start(); setRuntime(await bridge.status()) }
  })
  openNotification.current = async (cardId: string) => {
    if (!(await bridge.cards()).cards.some(card => card.id === cardId)) { setNotice('这个角色已不在角色库中。'); return }
    await switchCard(cardId)
    if (selectedRef.current !== cardId) return
    // A notification explicitly asks for the latest reply, including when the
    // same conversation was previously left scrolled into older history.
    for (const key of positions.current.keys()) if (key.startsWith(`${cardId}:`)) positions.current.delete(key)
    restored.current = ''; nearBottom.current = true; forceBottom.current = true; userMoved.current = false
    cancelPageMotion(); setPageMotion({ phase: 'idle', direction: 0 })
    setNewMessages(0); setSwitcher(false); updatePage('chat')
    if ((await bridge.status()).state === 'healthy') await refreshHistory()
    requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight))
  }
  useEffect(() => {
    document.documentElement.classList.toggle('native-insets', native)
    const navEl = navigation.current
    const headerEl = headerRef.current
    // 同步顶部状态栏与底部导航栏真实高度，保证见闻页切换栏与输入框精确对齐
    const syncChromeMetrics = () => {
      if (navEl) document.documentElement.style.setProperty('--nav-height', `${navEl.getBoundingClientRect().height}px`)
      if (headerEl) document.documentElement.style.setProperty('--header-height', `${Math.ceil(headerEl.getBoundingClientRect().height)}px`)
    }
    syncChromeMetrics()
    const observer = new ResizeObserver(syncChromeMetrics)
    if (navEl) observer.observe(navEl)
    if (headerEl) observer.observe(headerEl)
    return () => observer.disconnect()
  }, [native])
  const importCard = () => act(async () => {
    const file = await bridge.pickCard()
    const original = fromBase64(file.base64)
    const choices = parsePersona(original).map(card => prepareCharacterImport(card, original))
    if (choices.length === 1) setPreview(choices[0]); else setImportChoices(choices)
  })
  const saveImportedCard = async (input: CharacterImport, useNow = false) => {
    const saved = await bridge.saveCard({ card: input.card, base64: input.base64 })
    const duplicate = cards.some(row => row.id === saved.id)
    setCards(rows => rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved])
    // Persistence has succeeded: publish the library entry even if switching fails.
    await refreshCards()
    if ((useNow || !selectedRef.current) && selectedRef.current !== saved.id) {
      try { await bridge.selectCard({ id: saved.id }); await storyChanged() }
      catch (error) { throw new Error(`「${saved.card.name}」已保存到角色库，切换未完成：${errorText(error)}。可稍后从角色库选择。`) }
    }
    setNotice(duplicate ? `「${saved.card.name}」已在角色库中，保留已有编辑与故事。` : `「${saved.card.name}」已加入角色库。`)
  }
  const savePreview = (useNow: boolean) => act(async () => {
    if (!preview) return
    await saveImportedCard(preview, useNow); setPreview(null)
  })
  const send = async (retry?: Message, sticker?: { packId: string; asset: StickerAsset }) => {
    if (retry?.replyState === 'failed') {
      if (sendLock.current || busy || runtime?.state !== 'healthy') return
      sendLock.current = true; setSending(true)
      try { await scopedBridge.rpc({ method: 'turn.retry', payload: { messageId: retry.id } }); await refreshHistory(); await experience.refresh() } catch (error) { setNotice(errorText(error)) } finally { sendLock.current = false; setSending(false) }
      return
    }
    const content = sticker ? '' : retry ? retry.content : draft.trim() || (draftAudio ? '[语音消息]' : '')
    const audio = sticker ? undefined : retry ? messageAudio(retry.audio) : draftAudio
    const imageIds = sticker ? [] : retry ? messageImages(retry.images) : attachments.map(image => image.id)
    if ((!sticker && !content && !imageIds.length) || sendLock.current || busy || runtime?.state !== 'healthy') return
    const submittingDraft = !sticker && (!retry || (pending.current?.requestId === retry.id && !retryTarget))
    sendLock.current = true
    const request = retry ? { requestId: retry.id, content, images: imageIds, audio } : !sticker && pending.current?.audio?.audioId === audio?.audioId && pending.current?.content === content && JSON.stringify(pending.current.images || []) === JSON.stringify(imageIds) ? pending.current : { requestId: crypto.randomUUID(), content, images: imageIds, audio }
    if (sticker) pending.current = null
    else { pending.current = request; setRetryTarget(retry ?? null) }
    setSending(true); setRequestState('sending'); setNotice(''); setStickerDrawer(false)
    const revision = profileRevision.current
    const cardId = selectedRef.current
    try {
      if (imageIds.length || sticker) {
        await persistSettings(); const version = JSON.stringify(settingsRef.current); await checkVision()
        if (revision !== profileRevision.current || runtimeRef.current?.state !== 'healthy' || version !== JSON.stringify(settingsRef.current)) throw new Error('设置或运行状态已更改，请检查后重试')
      }
      if (sticker) {
        const image = await bridge.stickerImage({ id: sticker.asset.id })
        const upload = await bridge.rpc({ method: 'images.upload', payload: { dataUri: image.dataUri } })
        if (revision !== profileRevision.current) return
        request.images = [(upload.data as { id: string }).id]
        const library = useSticker(stickersRef.current, sticker.packId, sticker.asset.id)
        saveStickers({ ...library, messages: { ...library.messages, [stickerMessageKey(cardId, request.requestId)]: sticker.asset } })
      }
      pending.current = request
      setRetryTarget(sticker ? { id: request.requestId, content: '', images: request.images, direction: 'user', occurredAt: new Date().toISOString(), status: 'failed' } : retry ?? null)
      const localRow: Message = { id: request.requestId, content, images: request.images, audio, direction: 'user', occurredAt: retry?.occurredAt ?? new Date().toISOString(), status: 'sending' }
      outgoing.current.put(cardId, localRow); setOutgoingRows(outgoing.current.read(cardId).map(row => row.id === localRow.id ? localRow : row))
      await scopedBridge.rpc({ method: 'messages.sendLocal', payload: request })
      outgoing.current.remove(cardId, [request.requestId])
      // A notification may select another card while the RPC is in flight.
      // Clear the acknowledged card's matching draft before the UI revision guard.
      const sentDraft = getDraft(cardId)
      if (submittingDraft && (sentDraft.content.trim() === content || (!sentDraft.content.trim() && sentDraft.audio?.audioId === audio?.audioId)) && JSON.stringify(sentDraft.attachments.map(image => image.id)) === JSON.stringify(imageIds)) updateDraft({ content: '', attachments: [], audio: undefined }, cardId)
      if (revision !== profileRevision.current) return
      forceBottom.current = true; setRequestState('accepted')
      pending.current = null; setRetryTarget(null); await historyReads.current(revision, true)
    } catch (error) {
      const stored = outgoing.current.read(cardId).find(row => row.id === request.requestId)
      if (stored) { try { outgoing.current.put(cardId, { ...stored, status: localRequestFailure(error) }) } catch {} }
      if (revision === profileRevision.current) { setOutgoingRows(outgoing.current.read(cardId)) }
      if (revision === profileRevision.current) {
        if (messagesRef.current.some(row => row.id === request.requestId && row.status === 'accepted')) { setRequestState('accepted'); setRetryTarget(null); setNotice('') }
        else if (sticker && !pending.current) { setRequestState('idle'); setNotice(`${errorText(error)}；请重新点击表情发送。`) }
        else { setRequestState(localRequestFailure(error)); setNotice(`${errorText(error)}；草稿已保留，可以重试。`) }
      }
    } finally { sendLock.current = false; setSending(false) }
  }
  sendRef.current = send
  const checkVision = async () => {
    const desired = settingsRef.current
    const result = await bridge.rpc({ method: 'preset.syncStatus', payload: { currentVision: visionProjection(desired) } })
    const status = result.data as { visionRestartRequired?: boolean; activeVision?: ReturnType<typeof visionProjection> }
    if (status.visionRestartRequired !== false || !status.activeVision) throw new Error('识图配置尚未生效，请先重启核心；无法查询时请稍后重试')
    const reason = visionRouteReason(status.activeVision)
    if (reason) throw new Error(reason)
  }
  const attachmentReason = imageEntryReason({ native, healthy: runtime?.state === 'healthy', busy, sending, count: attachments.length, enabled: settings.modelOptions.visionEnabled === true })
  const pickImage = async (pasted?: File[], source: 'gallery' | 'camera' = 'gallery') => {
    if (imageLock.current) return
    if (attachmentReason) { setNotice(attachmentReason); if (!settingsRef.current.modelOptions.visionEnabled) setPage('settings'); return }
    imageLock.current = true
    const revision = profileRevision.current
    const fingerprint = JSON.stringify(settingsRef.current)
    // Saving may replace secrets/public rows; capture the post-save version for subsequent checks.
    let savedFingerprint = fingerprint
    const stillCurrent = () => revision === profileRevision.current && runtimeRef.current?.state === 'healthy' && JSON.stringify(settingsRef.current) === savedFingerprint
    setBusy(true); setNotice('')
    try {
      const original = settingsRef.current
      await persistSettings()
      if (revision !== profileRevision.current || runtimeRef.current?.state !== 'healthy') return
      // A concurrent edit must not open the picker for a different route.
      if (settingsRef.current !== original && savedSettings.current !== JSON.stringify(settingsRef.current)) return
      savedFingerprint = JSON.stringify(settingsRef.current)
      await checkVision()
      if (!stillCurrent()) return
      const result = pasted ? { cancelled: false, images: await Promise.all(pasted.slice(0, 3 - attachments.length).map(async file => ({ dataUri: await clipboardJpeg(file) }))), truncated: pasted.length > 3 - attachments.length } : await bridge.pickImage({ limit: 3 - attachments.length, source })
      if (result.cancelled || !stillCurrent()) return
      const images = result.images ?? (result.dataUri ? [{ dataUri: result.dataUri }] : [])
      const errors = (result.errors ?? []).map(error => `第 ${error.index + 1} 张：${error.message}`)
      for (const image of images.slice(0, 3 - attachments.length)) {
        if (!stillCurrent()) return
        try {
          const upload = await bridge.rpc({ method: 'images.upload', payload: { dataUri: image.dataUri } })
          if (!stillCurrent()) return
          const id = (upload.data as { id: string }).id
          setAttachments(current => current.some(item => item.id === id) ? current : [...current, { id, dataUri: image.dataUri }].slice(0, 3))
        } catch { errors.push('图片上传失败，已成功的图片仍保留') }
      }
      if (!images.length && !errors.length) errors.push('图库未返回图片，请重新选择')
      if (result.truncated || images.length > 3 - attachments.length) errors.push('已按剩余名额截取图片，最多 3 张')
      if (errors.length) setNotice(errors.join('；'))
    } catch (error) { if (revision === profileRevision.current) setNotice(errorText(error)) }
    finally { imageLock.current = false; setBusy(false) }
  }
  const transitioning = ['installing', 'starting', 'stopping'].includes(runtime?.state || '')
  const healthy = runtime?.state === 'healthy'
  const { failures: messageFailures, typing } = useMessageActivity(bridge, native && healthy && page === 'chat', `${selected}:${profileRevision.current}`, settings.modelOptions.mobileTurnDeadlineMs ?? 240000)
  const modelReady = settings.providers.some(row => row.enabled && row.useForMain && row.endpoint && row.model)
  const primaryConnection = settings.providers.find(row => row.enabled && row.useForMain && row.endpoint && row.model)
  // Kept only in component memory; API keys never enter a completion marker.
  const connectionFingerprint = JSON.stringify(primaryConnection)
  const closeQuickStart = () => { setQuickStartOpen(false); try { localStorage.setItem('hds.quickstart.v1', '1') } catch { /* Optional preference. */ } }
  const testQuickStart = () => act(async () => {
    await persistSettings()
    const row = settingsRef.current.providers.find(item => item.enabled && item.useForMain && item.endpoint && item.model)
    if (!row) throw new Error('请先填写聊天模型连接')
    await bridge.rpc({ method: 'models.test', payload: { ...row } })
    setTestedConnection(JSON.stringify(row)); setNotice('聊天连接测试通过，可以唤醒故事了。')
  })
  const firstConversationComplete = messages.some(row => row.direction === 'user' && row.status === 'accepted') && messages.some(row => row.direction === 'character' && row.status === 'delivered')
  useEffect(() => { if (quickStartOpen && firstConversationComplete) closeQuickStart() }, [quickStartOpen, firstConversationComplete])
  const runtimeLabel = !native ? '预览' : healthy ? '在线' : runtime?.state === 'installing' ? '准备核心中' : runtime?.state === 'starting' ? '正在唤醒…' : runtime?.state === 'stopping' ? '正在保存…' : runtime?.state === 'failed' ? '唤醒失败' : '已休眠'
  const wakeActionLabel = !active ? '选择角色' : !modelReady ? '连接故事模型' : runtime?.state === 'failed' ? '重试唤醒' : '唤醒'
  const triggerPrimaryWake = () => {
    if (!active) { setSwitcher(true); return }
    if (!modelReady) { openSpace('models'); setNotice('为故事选择一个模型，就可以开始了。'); return }
    void wake()
  }
  const chatWakeDisabled = busy || (!!active && modelReady && (!native || !settingsReady))
  // 抽取简短人设或开场白微摘录，避免唤醒前舞台显得空旷
  const wakeQuoteSource = (active?.card.firstMessage || active?.card.description || active?.card.personality || '').replace(/\s+/g, ' ').trim()
  const wakeQuoteText = wakeQuoteSource ? `${wakeQuoteSource.slice(0, 68)}${wakeQuoteSource.length > 68 ? '…' : ''}` : ''
  const wakeStatusNote = runtime?.state === 'installing' ? '首次准备约 1 分钟，请稍候…' : runtime?.state === 'starting' ? '正在唤醒本地核心…' : ''
  const wakePanel = <div className={`wake-panel ${transitioning ? 'waking' : ''}`} role="status"><div><b>{active?.card.name || '故事'} · {runtimeLabel}</b>{wakeStatusNote && <p>{wakeStatusNote}</p>}</div>{transitioning ? <progress aria-label={runtimeLabel} /> : <button className="primary wake-button" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>{wakeActionLabel}<Icon name="arrow" /></button>}{runtime?.state === 'installing' && <button className="text-button" onClick={() => act(() => bridge.cancelInstall())}>取消准备</button>}{runtime?.error && <p className="error">{runtime.error}</p>}</div>

  // 共享角色库视图，同时服务顶栏下拉直达与空间“角色与故事”分段视图
  const renderCharacterLibrary = (attachGuideRef = false) => <>
    <section className="settings-group cards-import-panel" ref={attachGuideRef ? onboardingTargets.library as React.RefObject<HTMLElement> : undefined}>
      <div className="actions"><button className="primary" disabled={!native || busy} onClick={importCard}><Icon name="plus" />导入角色卡</button><button className="secondary" disabled={!native || busy} onClick={() => setCreateOpen(true)}>手动创建</button><button className="secondary" disabled={!native || busy} onClick={() => { setImportCodeOpen(true) }}>用导入码导入</button><button className="secondary" disabled={!native || busy || !selected} onClick={() => openCardExport(selected)}>导出</button></div>
    </section>
    <div className="card-list">{cards.map((saved, index) => <article className={`character ${saved.id === selected ? 'chosen' : ''}`} key={saved.id}><div className="character-number">{String(index + 1).padStart(2, '0')}</div><div className="character-body"><div className="character-title"><h2>{saved.card.name}</h2>{saved.id === selected && <span className="tag">当前角色</span>}</div><p>{saved.card.description || saved.card.personality || '尚未填写角色描述'}</p><span className="caption">{saved.card.format.toUpperCase()} · {saved.card.lorebook ? '含世界书' : '独立人设'} · {new Date(saved.importedAt).toLocaleDateString('zh-CN')}</span><div className="card-actions"><button disabled={busy || sending || transitioning || saved.id === selected} onClick={() => switchCard(saved.id)}>{saved.id === selected ? '正在使用' : '使用这个角色'}</button><button onClick={() => setPreview({ card: saved.card, base64: '' })}>查看人设</button><button disabled={busy} onClick={() => setEditingCard(saved)}>编辑</button><button disabled={busy} onClick={() => openCardExport(saved.id)}>导出角色卡</button><button disabled={busy} className="danger" onClick={() => setDeleteTarget(saved)}>删除</button></div></div></article>)}</div>
    {!cards.length && <div className="quiet-empty">角色库还很安静。<br />为第一段故事选一个主角吧。</div>}
  </>

  const spaceDetailGroup =
    spacePage === 'avatar' || spacePage === 'visual' ? 'visual-group'
    : spacePage === 'models' || spacePage === 'tasks' || spacePage === 'advanced' ? 'models-group'
    : spacePage === 'appearance' || spacePage === 'notifications' ? 'appearance-group'
    : spacePage

  // 二级设置页顶部分段胶囊映射表
  const renderSpaceSubtabs = (items: { key: string; label: string; active: boolean; select: () => void }[], ariaLabel: string) => (
    <div className="space-subtabs" role="tablist" aria-label={ariaLabel}>
      {items.map(item => (
        <button key={item.key} type="button" role="tab" aria-selected={item.active} className={item.active ? 'is-active' : ''} onClick={item.select}>
          {item.label}
        </button>
      ))}
    </div>
  )
  return <>
    {appearance.value.backgroundData && <BackgroundImage source={appearance.value.backgroundData} opacity={appearance.value.backgroundOpacity} blur={appearance.value.backgroundBlur} failed={() => setNotice('背景图片无法显示，请在界面设置中重新选择图片。')} />}
    <div className={`app${appearance.value.backgroundData ? ' has-photo-bg' : ''}`} ref={appShell}><NotificationBanner bridge={bridge} native={native} cardId={selected} messages={messages} reading={page === 'chat'} name={characterName} open={() => setPage('chat')} />
    <header ref={headerRef}>
      <div className="header-leading" ref={switcherAnchorRef}>
        <button
          type="button"
          className={`character-switch header-character-switch${switcher ? ' is-open' : ''}`}
          aria-label="切换角色或故事"
          aria-expanded={switcher}
          aria-haspopup="dialog"
          aria-controls="header-character-dropdown"
          onClick={() => setSwitcher(open => !open)}
        >
          <span className="header-char-avatar" aria-hidden="true" data-initial={avatar.source ? undefined : (characterName || '此').slice(0, 1)}>
            {avatar.source && <img src={avatar.source} alt="" />}
          </span>
          <span className="header-char-name">{characterName || '此刻之外'}</span>
          <span className="header-char-chevron" aria-hidden="true">⌄</span>
        </button>
        {switcher && (
          <div id="header-character-dropdown" className="character-dropdown" role="dialog" aria-label="选择角色或故事">
            <div className="character-dropdown-list">
              {cards.map(saved => (
                <button
                  type="button"
                  className={`story-choice character-dropdown-item${saved.id === selected ? ' active' : ''}`}
                  disabled={busy || sending || transitioning}
                  key={saved.id}
                  onClick={() => switchCard(saved.id)}
                >
                  <span className="story-choice-main">
                    <span
                      className="story-choice-avatar"
                      aria-hidden="true"
                      data-initial={saved.id === selected && avatar.source ? undefined : saved.card.name.slice(0, 1)}
                    >
                      {saved.id === selected && avatar.source && <img src={avatar.source} alt="" />}
                    </span>
                    <span className="character-dropdown-name">{saved.card.name}</span>
                  </span>
                  <small>{saved.id === selected ? '当前故事' : '继续故事 →'}</small>
                </button>
              ))}
              {!cards.length && <p className="character-dropdown-empty">还没有角色，先导入或创建一个吧。</p>}
            </div>
            <div className="character-dropdown-divider" aria-hidden="true" />
            <button
              type="button"
              className="character-dropdown-library"
              aria-label="导入、创建与管理角色"
              onClick={() => { setSwitcher(false); setPage('cards') }}
            >
              <span className="character-dropdown-library-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="12" height="16" rx="3" />
                  <path d="M16 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9" />
                  <circle cx="10" cy="10" r="2" />
                  <path d="M7.5 15.5a3.5 3.5 0 0 1 5 0" />
                </svg>
              </span>
              <span className="character-dropdown-library-copy">
                <strong>人格与角色库</strong>
                <small>导入 · 创建 · 修改人设</small>
              </span>
              <span className="character-dropdown-library-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
      <div className="header-actions" ref={onboardingTargets.welcome as React.RefObject<HTMLDivElement>}>
        {page === 'chat' && (
          <button type="button" className="header-chat-settings" aria-label="聊天设置" title="聊天设置" onClick={() => openSpace('chat')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="header-chat-settings-label">聊天设置</span>
          </button>
        )}
        <button
          className={`status ${runtime?.state === 'healthy' ? 'online' : ''}`}
          disabled={busy || sending || transitioning || (native && !settingsReady)}
          title={healthy ? '点击进入休眠' : native ? '点击唤醒角色' : undefined}
          onClick={() => healthy ? void act(async () => { await bridge.stop(); setRuntime(await bridge.status()) }, '故事暂时歇息，经历都已留存。') : native ? void wake() : openSpace(null)}
        ><i />{runtimeLabel}</button>
      </div>
    </header>
    <main className={`accordion page-transition page-${pageMotion.phase}`} style={{ '--page-offset': `${pageMotion.direction * 24}px`, '--page-duration': '180ms' } as React.CSSProperties} key={page} data-page={page} onTouchStart={beginSwipe} onTouchMove={event => { if (event.touches.length !== 1) touchStart.current = null }} onTouchEnd={endSwipe} onTouchCancel={() => { touchStart.current = null }} onBlurCapture={() => { void persistSettings().catch(() => {}) }}>
      {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      {restartNeeded && <div className="restart-banner" role="status"><div><b>新配置已就绪</b><span>重启后生效，剧情与记忆会保留。</span></div><button disabled={busy || sending || transitioning} onClick={restart}>立即重启生效</button></div>}
      {page === 'chat' && quickStartOpen && !onboardingOpen && !firstConversationComplete && <QuickStart character={active?.card.name} configured={modelReady} tested={testedConnection === connectionFingerprint} running={healthy} busy={!native || busy || sending || transitioning || !settingsReady} select={() => setPage('cards')} configure={() => openSpace('models')} test={() => void testQuickStart()} wake={() => void wake()} compose={() => { toLatest(); composer.current?.focus() }} close={closeQuickStart} />}
      {page === 'inbox' && <Inbox bridge={bridge} healthy={runtime?.state === 'healthy'} native={native} configure={() => openSpace(null)} onRootBack={inboxSource === 'space' ? () => openSpace(null, -1) : undefined} backHandler={inboxBack} onUnread={setInboxUnread} />}
      {page === 'feed' && (experience.settings.feedEnabled ? <Feed avatar={avatar.source} cardId={selected} key={selected} bridge={scopedBridge} snapshot={experience.snapshot} refresh={experience.refresh} healthy={healthy} name={characterName} onWake={triggerPrimaryWake} /> : <div className="quiet-empty">动态已关闭。<button onClick={() => openSpace('chat')}>前往设置</button></div>)}
      {page === 'feed' && <div className="feed-job-dock"><MediaJobNotice jobs={experience.snapshot.jobs.filter(job => job.purpose === 'feed')} bridge={scopedBridge} healthy={healthy} refresh={experience.refresh} diagnose={setMessageDiagnostic} /></div>}
      {page === 'chat' && <>
        {healthy && <div className="history-toolbar"><button className="text-button" onClick={() => setHistorySearch(true)}>查找聊天记录</button>{hasOlder && <button className="secondary" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? '正在读取…' : '加载更早消息'}</button>}</div>}
        <div className="chat-stage">
          {!displayMessages.length && !experience.snapshot.streams.length && requestState !== 'sending' && !typing ? (
            healthy ? (
              <div className="chat-empty-spacer" aria-hidden="true" />
            ) : (
              <div className="chat-wake-stage" role="status">
                {transitioning ? (
                  <div className="wake-progress-inline">
                    <span className="wake-core-orb is-pulsing" aria-hidden="true">
                      <svg className="wake-orbit-svg" viewBox="0 0 44 44" fill="none">
                        <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="1.4" strokeDasharray="18 12" opacity="0.65" />
                      </svg>
                      <svg className="wake-spark-svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.5L14.2 9.8L21.5 12L14.2 14.2L12 21.5L9.8 14.2L2.5 12L9.8 9.8L12 2.5Z" />
                      </svg>
                    </span>
                    <progress aria-label={runtimeLabel} />
                    <span className="wake-progress-label">{runtimeLabel}</span>
                    {runtime?.state === 'installing' && <small>首次准备约 1 分钟，请稍候…</small>}
                    {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={() => act(() => bridge.cancelInstall())}>取消准备</button>}
                  </div>
                ) : (
                  <div className="wake-glass-card">
                    <div className="wake-card-meta">
                      <span className="wake-card-pill"><i aria-hidden="true" />{runtimeLabel}</span>
                      <span className="wake-card-tag">{active ? `共 ${cards.length} 位角色 · 本地记忆` : '故事准备'}</span>
                    </div>
                    <div className="wake-card-identity">
                      <span className="wake-card-avatar" aria-hidden="true" data-initial={avatar.source ? undefined : (characterName || '此').slice(0, 1)}>
                        {avatar.source && <img src={avatar.source} alt="" />}
                      </span>
                      <div className="wake-card-copy">
                        <h2>{characterName || '等候一位主角'}</h2>
                        <p className={`wake-card-quote${wakeQuoteText ? '' : ' is-placeholder'}`}>
                          {wakeQuoteText ? `“${wakeQuoteText}”` : !active ? '挑一位角色，或写下属于你们的设定。' : '核心在本地静候，轻触唤醒即可延续你们的故事。'}
                        </p>
                      </div>
                    </div>
                    <div className="wake-card-readiness" aria-hidden="true">
                      <span className={`wake-chip${active ? ' is-ready' : ''}`}>{active ? '角色就绪' : '待选主角'}</span>
                      <span className={`wake-chip${modelReady ? ' is-ready' : ''}`}>{modelReady ? '模型已连' : '待连模型'}</span>
                      <span className="wake-chip is-ready">本地隐私</span>
                    </div>
                    <div className="wake-hero">
                      <span className="wake-aura-glow" aria-hidden="true" />
                      <button
                        type="button"
                        className={`wake-cta${runtime?.state === 'failed' ? ' is-retry' : ''}`}
                        aria-label={wakeActionLabel}
                        disabled={chatWakeDisabled}
                        onClick={triggerPrimaryWake}
                      >
                        <span className="wake-core-orb" aria-hidden="true">
                          <svg className="wake-orbit-svg" viewBox="0 0 44 44" fill="none">
                            <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="1.4" strokeDasharray="16 10 4 10" opacity="0.72" />
                          </svg>
                          <svg className="wake-spark-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.5L14.2 9.8L21.5 12L14.2 14.2L12 21.5L9.8 14.2L2.5 12L9.8 9.8L12 2.5Z" />
                          </svg>
                        </span>
                        <span className="wake-cta-copy" aria-hidden="true">
                          <strong className="wake-cta-title">{wakeActionLabel}</strong>
                          <small className="wake-cta-sub">{!active ? '先选择一位主角' : !modelReady ? '前往连接对话模型' : runtime?.state === 'failed' ? '连接未完成 · 点击重试' : '轻触唤醒故事核心'}</small>
                        </span>
                        <span className="wake-cta-wave" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                      </button>
                    </div>
                  </div>
                )}
                {runtime?.error && <p className="error wake-inline-error">{runtime.error}</p>}
              </div>
            )
          ) : (
            <div className="chat-thread-area">
              <div className="messages">{displayMessages.map((message, index) => <MessageRow avatar={avatar.source} entrance={index >= messages.length - 6 ? Math.max(0, index - Math.max(0, messages.length - 6)) : undefined} sticker={message.direction === 'user' ? stickers.messages[stickerMessageKey(selected, message.id)] : undefined} key={message.id} message={message} failureReason={messageFailures?.get(message.id)} onDiagnosticFocus={focusMessageDiagnostic} userName={settings.userName} characterName={characterName} lastCharacterReplyTs={lastCharacterReplyTs} onRetry={retryMessage} retryDisabled={sending || busy || !healthy || message.direction !== 'user'} />)}{experience.snapshot.streams.filter(row => !messages.some(m => m.id === row.id)).map(row => <article className={`message character-reply stream-reply${avatar.source ? " has-avatar" : ""}`} key={row.id}>{avatar.source && <img className="character-avatar chat-avatar" src={avatar.source} alt={`${characterName}的头像`} />}<div className="message-label">{characterName}</div><div className="bubble">{row.content}<span className={row.status === 'streaming' ? 'stream-caret' : ''} /></div><small>{row.status === 'streaming' ? '正在输入…' : '回复中断 · 可在原消息下重试'}</small></article>)}<TypingBubble requestState={requestState} typing={typing && !experience.snapshot.streams.some(row => row.status === 'streaming')} characterName={characterName} /><div ref={scroll} /></div>
              {newMessages > 0 && <button className="new-messages" onClick={toLatest}>有 {newMessages} 条新消息 · 回到最新</button>}
              {requestState === 'unknown' && !pendingInHistory && <p role="status">发送结果未知，请保留原内容安全重试。<button disabled={sending || busy || !healthy} onClick={() => void send(retryTarget ?? undefined)}>重试发送</button></p>}
              {requestState === 'failed' && !pendingInHistory && <div role="status"><MessageStatus message={{ direction: 'user', status: 'failed' }} disabled={sending || busy || !healthy} onRetry={() => void send(retryTarget ?? undefined)} /></div>}
              {active && !healthy && (
                <div className="wake-inline-bar" role="status">
                  <span className="wake-inline-status">{runtimeLabel}</span>
                  {transitioning ? (
                    <progress aria-label={runtimeLabel} />
                  ) : (
                    <button type="button" className="primary wake-pill" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>
                      {wakeActionLabel}
                    </button>
                  )}
                  {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={() => act(() => bridge.cancelInstall())}>取消准备</button>}
                  {runtime?.error && <small className="error">{runtime.error}</small>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="composer-wrap" ref={onboardingTargets.chat as React.RefObject<HTMLDivElement>}><MediaJobNotice jobs={experience.snapshot.jobs.filter(job => job.purpose === 'chat')} bridge={scopedBridge} healthy={healthy} refresh={experience.refresh} diagnose={setMessageDiagnostic} />{mediaDrawer && <MediaComposer onVoiceMode={() => setVoiceBar(true)} onVisual={() => { setMediaDrawer(false); openSpace('visual') }} key={selected} bridge={scopedBridge} healthy={healthy} snapshot={experience.snapshot} refresh={experience.refresh} onPick={source => void pickImage(undefined, source)} close={() => setMediaDrawer(false)} onTranscript={(text, audio) => { const current = getDraft(selected); updateDraft({ content: [current.content, text].filter(Boolean).join("\n"), audio }); composer.current?.focus() }} />}{draftAudio && <div className="draft-audio"><VoiceBubble bridge={bridge} audio={draftAudio} content={draft} /><div className="draft-audio-actions"><button type="button" className="primary-pill" disabled={!native || runtime?.state !== 'healthy' || sending || busy} onClick={() => void send()}>发送语音</button><button type="button" onClick={() => updateDraft({ audio: undefined })}>移除语音</button></div></div>}{stickerDrawer && stickerEntryVisible(stickers) && <StickerDrawer library={stickers} disabled={sending || busy || !healthy} close={() => setStickerDrawer(false)} send={(packId, asset) => void send(undefined, { packId, asset })} />}{attachments.length > 0 && <div className="attachment-tray">{attachments.map(image => <div key={image.id}><img src={image.dataUri} alt="待发送图片" /><button aria-label="移除图片" disabled={sending || busy} onClick={() => setAttachments(current => current.filter(item => item.id !== image.id))}>×</button></div>)}</div>}<form className={`composer${voiceBar ? ' voice-mode' : ''}`} onSubmit={event => { event.preventDefault(); if (!composing.current) void send() }}>{voiceBar ? <><button type="button" className="voice-mode-button" aria-label="切换到键盘输入" disabled={busy || sending || voiceRecording} onClick={() => { setVoiceBar(false); setTimeout(() => composer.current?.focus(), 20) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M10 9h.01M14 9h.01M17 9h.01M7 12h.01M10 12h.01M14 12h.01M17 12h.01M8 15h8" strokeLinecap="round" /></svg></button><button type="button" className={`composer-hold-to-talk${voiceRecording ? ' recording' : ''}${voiceCancel ? ' cancelling' : ''}`} disabled={!healthy || busy || sending} onContextMenu={e => e.preventDefault()} onPointerDown={e => { if (busy || sending || !healthy) return; e.currentTarget.setPointerCapture(e.pointerId); void startInlineVoice(e.clientY) }} onPointerMove={e => { if (!voiceHold.current.active) return; const cancel = voiceHold.current.startY - e.clientY > 48; voiceHold.current.cancel = cancel; setVoiceCancel(cancel) }} onPointerUp={() => { if (!voiceHold.current.active) return; if (voiceHold.current.cancel || Date.now() - voiceHold.current.startedAt >= 180) void stopInlineVoice(voiceHold.current.cancel) }} onPointerCancel={() => { if (voiceHold.current.active) void stopInlineVoice(true) }}>{voiceRecording ? (voiceCancel ? '松开手指，取消发送' : '松开 结束 · 上滑取消') : '按住 说话'}</button><button type="button" className="sticker-entry" aria-label="打开表情包" aria-expanded={stickerDrawer} disabled={busy || sending || voiceRecording} onClick={() => { if (stickerEntryVisible(stickers)) setStickerDrawer(value => !value); else setStickerManager(true) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5q3.5 3.5 7 0M9 9.5v1.5M15 9.5v1.5" strokeLinecap="round" /></svg></button><button type="button" className="attach-button" aria-label="添加图片或语音" aria-expanded={mediaDrawer} disabled={busy || sending || voiceRecording} onClick={() => { setStickerDrawer(false); setMediaDrawer(value => !value) }}>＋</button></> : <><button type="button" className="attach-button" aria-label="添加图片或语音" aria-expanded={mediaDrawer} disabled={busy || sending} onClick={() => { composer.current?.blur(); setStickerDrawer(false); setMediaDrawer(value => !value) }}>＋</button>{stickerEntryVisible(stickers) && <button type="button" className="sticker-entry" aria-label="打开表情包" aria-expanded={stickerDrawer} disabled={busy || sending} onClick={() => { composer.current?.blur(); setStickerDrawer(value => !value) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5q3.5 3.5 7 0M9 9.5v1.5M15 9.5v1.5" strokeLinecap="round" /></svg></button>}<textarea ref={composer} disabled={sending} rows={1} value={draft} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={event => { const action = composerEnter({ key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode }, composing.current, experience.settings.enterBehavior); if (action === 'send') { event.preventDefault(); void send() } }} onPaste={event => { const images = [...event.clipboardData.items].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file !== null); if (images.length) { event.preventDefault(); void pickImage(images) } }} onChange={event => setDraft(event.target.value)} placeholder="发消息…" maxLength={12000} aria-label="消息内容" /><button className="send" disabled={!native || runtime?.state !== 'healthy' || sending || busy || (!draft.trim() && !attachments.length && !draftAudio)} aria-label="发送消息"><Icon name="arrow" /></button></>}</form>{healthy && attachmentReason && <p id="image-entry-hint" className="composer-hint">{attachmentReason}</p>}</div>
      </>}
      {page === 'cards' && <>
        <SettingsSubpageHeader
          title="人格与角色库"
          backLabel="返回故事"
          onBack={() => setPage('chat')}
        />
        {renderCharacterLibrary(true)}
      </>}
      {page === 'story' && <>
        <div className="tabs" ref={onboardingTargets.story as React.RefObject<HTMLDivElement>}><button className={detail === 'story' ? 'active' : ''} onClick={() => setDetail('story')}>故事时间线</button><button className={detail === 'memory' ? 'active' : ''} onClick={() => setDetail('memory')}>长期记忆</button><button className={detail === 'mind' ? 'active' : ''} onClick={() => setDetail('mind')}>此刻心绪</button></div>
        {runtime?.state !== 'healthy' ? wakePanel : <>
          <div className="inline-actions"><button onClick={() => { openSpace('world'); setSettingEditor(true) }}>修改故事设定</button><button onClick={toLatest}>回到最新</button><button onClick={() => act(async () => { await refreshStory() })}>刷新</button><button onClick={() => act(async () => { await bridge.rpc({ method: story?.story?.status === 'paused' ? 'story.resume' : 'story.pause' }); await refreshStory() }, '故事状态已更新。')}>{story?.story?.status === 'paused' ? '恢复故事' : '暂停故事'}</button></div>
          {detail === 'story' ? <div className="timeline">{story?.entries.filter(entry => entry.kind === 'script' || entry.kind === 'setup').map(entry => <article key={entry.id} data-read-anchor={`entry-${entry.id}`}><time>{new Date(entry.occurredAt).toLocaleString('zh-CN')}</time><p>{entry.content}</p></article>)}{!story?.entries.some(entry => entry.kind === 'script') && <p className="quiet-empty">还没有生成生活剧本。对话后可在这里查看。</p>}</div> : detail === 'mind' ? <div className="mind-card"><span className="eyebrow">INNER WEATHER</span><h2>{active?.card.name || '角色'}的心绪</h2><p>{story?.story?.state?.alterSystem?.emotionalOffset?.description || '心绪还没有留下记录。随着故事继续，这里会记下细微的变化。'}</p></div> : <div className="timeline"><MemoryTools key={selected} cardId={selected} bridge={bridge} facts={story?.facts || []} intents={story?.intents || []} schedulingStatus={story?.schedulingStatus || []} paused={story?.story?.status === 'paused'} overlay={story?.overlay?.state || {}} busy={busy} act={act} refresh={refreshStory} />{story?.memories.map(memory => <article key={`memory-${memory.id}`} data-read-anchor={`memory-${memory.id}`}><span className="eyebrow">压缩记忆 #{memory.id}</span><p>{memory.summary || memory.content}</p></article>)}{!story?.facts.length && !story?.memories.length && <p className="quiet-empty">经历积累后，记忆会在这里出现。</p>}</div>}
        </>}
      </>}
      {page === 'settings' && <>
        {spacePage && (
          <SettingsSubpageHeader
            title={spaceEntries.find(item => item.key === spacePage)?.title || spaceEntries.find(item => item.key === spacePage)?.label || '设置'}
            onBack={() => openSpace(null, -1)}
          />
        )}
        {!spacePage ? <div key="space-home" className={`space-home${spaceMotion === 'back' ? ' space-enter-back' : ''}`}>
          <section className="space-wake">
            <div className="space-wake-head">
              <div className="space-wake-identity">
                <span className="space-wake-avatar" aria-hidden="true" data-initial={avatar.source ? undefined : (characterName || '此').slice(0, 1)}>
                  {avatar.source && <img src={avatar.source} alt="" />}
                </span>
                <div>
                  <b>{active?.card.name || '未选定角色'}</b>
                  <small>{!active ? '请在下方“角色与故事”选定主角' : !modelReady ? '尚未配置主对话模型连接' : healthy ? '本地核心运行中，随时响应对话' : '本地核心已休眠，经历与记忆完好留存'}</small>
                </div>
              </div>
              <span className={`tag${healthy ? ' is-online' : ''}`}>{runtimeLabel}</span>
            </div>
            {transitioning ? (
              <div className="space-wake-progress" role="status">
                <progress aria-label={runtimeLabel} />
                {wakeStatusNote && <p className="caption">{wakeStatusNote}</p>}
                {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={() => act(() => bridge.cancelInstall())}>取消准备</button>}
              </div>
            ) : healthy ? (
              <button type="button" className="secondary wide space-wake-action" disabled={busy || sending} onClick={() => act(async () => { await bridge.stop(); setRuntime(await bridge.status()) }, '故事暂时歇息，经历都已留存。')}>让故事休息一下</button>
            ) : (
              <button type="button" className="primary wide wake-button space-wake-action" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>{wakeActionLabel}<Icon name="arrow" /></button>
            )}
            {runtime?.error && <p className="error">{runtime.error}</p>}
          </section>
          {spaceSections.map(section => (
            <section className="space-group" key={section.title}>
              <span className="space-section-label">{section.title}</span>
              <div className="space-grid">
                {section.keys.map(key => {
                  const item = spaceEntries.find(entry => entry.key === key)!
                  const guideRef = key === 'models' ? onboardingTargets.models : key === 'system' ? onboardingTargets.help : undefined
                  return (
                    <button
                      ref={guideRef as React.RefObject<HTMLButtonElement> | undefined}
                      className="settings-entry"
                      key={item.key}
                      onClick={() => openSpace(item.key, 1)}
                    >
                      <span>{item.label}<small>{item.caption}</small></span>
                    </button>
                  )
                })}
                {section.includeInbox && (
                  <button className="settings-entry" onClick={() => openInbox('space', 1)}>
                    <span>外部连接与信箱<small>来信、QQ 接入与会话管理{inboxUnread > 0 ? ` · ${inboxUnread} 条未读` : ''}</small></span>
                  </button>
                )}
              </div>
            </section>
          ))}
        </div> : <div key={`space-${spaceDetailGroup}`} className={`space-detail${spaceMotion === 'forward' ? ' space-enter-forward' : ''}`} data-settings-category={spacePage}>
          {spacePage === 'world' && renderSpaceSubtabs([
            { key: 'story', label: '角色与叙事', active: worldTab === 'story', select: () => setWorldTab('story') },
            { key: 'library', label: '人格与角色库', active: worldTab === 'library', select: () => setWorldTab('library') },
          ], '角色与故事分页')}
          {(spacePage === 'avatar' || spacePage === 'visual') && renderSpaceSubtabs([
            { key: 'avatar', label: '角色头像', active: spacePage === 'avatar', select: () => setSpacePage('avatar') },
            { key: 'visual', label: '视觉档案与生图', active: spacePage === 'visual', select: () => setSpacePage('visual') },
          ], '角色形象与视觉分页')}
          {(spacePage === 'models' || spacePage === 'tasks' || spacePage === 'advanced') && renderSpaceSubtabs([
            { key: 'models', label: '模型连接', active: spacePage === 'models', select: () => setSpacePage('models') },
            { key: 'tasks', label: '任务分工', active: spacePage === 'tasks', select: () => setSpacePage('tasks') },
            { key: 'advanced', label: '高级与节奏', active: spacePage === 'advanced', select: () => setSpacePage('advanced') },
          ], '模型与任务分工分页')}
          {(spacePage === 'appearance' || spacePage === 'notifications') && renderSpaceSubtabs([
            { key: 'appearance', label: '界面与壁纸', active: spacePage === 'appearance', select: () => setSpacePage('appearance') },
            { key: 'notifications', label: '消息通知', active: spacePage === 'notifications', select: () => setSpacePage('notifications') },
          ], '界面个性化与通知分页')}
          {spacePage === 'system' && renderSpaceSubtabs([
            { key: 'backup', label: '存档与设备', active: systemTab === 'backup', select: () => setSystemTab('backup') },
            { key: 'diagnostics', label: '诊断与帮助', active: systemTab === 'diagnostics', select: () => setSystemTab('diagnostics') },
          ], '备份、诊断与帮助分页')}
          {(!native || saveError || !['chat', 'media', 'visual'].includes(spacePage) || saveState !== '设置自动保存') && (
            <div className="save-status" role="status"><span>{native ? saveState : '界面预览 · 设置不会保存'}</span>{saveError && <><p className="error">{saveError}</p><button className="text-button" disabled={busy} onClick={() => void persistSettings().catch(() => {})}>重试保存</button></>}</div>
          )}
          {spacePage === 'avatar' && <AvatarSettings key={selected} avatar={avatar} bridge={scopedBridge} cardId={selected} name={characterName} native={native} healthy={healthy} imageEnabled={experience.settings.image.enabled} snapshot={experience.snapshot} refresh={experience.refresh} />}
          {(['chat', 'media', 'visual'] as string[]).includes(spacePage) && <ExperiencePanel cardId={selected} jobs={experience.snapshot.jobs} refreshJobs={experience.refresh} diagnose={setMessageDiagnostic} characterName={characterName} key={`${selected}:${spacePage}`} value={experience.settings} save={async value => { await persistSettings(); await experience.save(value) }} bridge={scopedBridge} native={native} healthy={healthy} mode={spacePage as 'chat' | 'media' | 'visual'}>
          {spacePage === 'chat' && <label className="toggle"><input type="checkbox" checked={settings.modelOptions.mainStreamingMode === 'experimental'} onChange={e => setSettings(previous => ({ ...previous, modelOptions: { ...previous.modelOptions, mainStreamingMode: e.target.checked ? 'experimental' : 'off', ...(e.target.checked ? { mainResponseFormat: 'json-object' as const } : {}) } }))} />流式输出 · 回复边生成边显示</label>}
          {spacePage === 'chat' && <label>连续消息合并等待（秒）<input type="number" min={0} max={30} step={0.5} value={Number(settings.mobileConfig?.sections?.runtime?.userMessageDebounceSeconds ?? 1)} onChange={e => setSettings(previous => ({ ...previous, mobileConfig: { ...previous.mobileConfig, sections: { ...previous.mobileConfig?.sections, runtime: { ...previous.mobileConfig?.sections?.runtime, userMessageDebounceSeconds: Number(e.target.value) } } } }))} /><small>等你连续说完再回复；保存后重启核心生效。</small></label>}
          </ExperiencePanel>}
          {spacePage === 'chat' && <button className="settings-entry" onClick={() => setStickerManager(true)}><span>表情包管理<small>我的表情与角色表情 · 独立素材池</small></span></button>}
          {spacePage === 'life' && <WeatherStatus bridge={scopedBridge} healthy={healthy} />}
          {spacePage === 'life' && <PowerSettings bridge={bridge} notify={setNotice} />}
          {spacePage === 'appearance' && <AppearanceSettings appearance={appearance} native={native} busy={busy} act={act} />}
          {spacePage === 'notifications' && <NotificationSettings bridge={bridge} native={native} notify={setNotice} />}
          {spacePage === 'voice' && <VoiceSettings bridge={bridge} state={voices.state} accept={voices.accept} cardId={selected} name={active?.card.name || ""} native={native} notify={setNotice} />}
          {(spacePage === 'models' || spacePage === 'tasks' || spacePage === 'advanced') && <ModelCenter key={spacePage} mode={spacePage === 'advanced' ? 'advanced' : spacePage === 'tasks' ? 'tasks' : 'connections'} onNavigate={openSpace} settings={settings} setSettings={setSettings} native={native} busy={busy || sending} bridge={bridge} act={act} notify={setNotice}>
            {spacePage === 'tasks' && <RetrievalSettings settings={settings} setSettings={setSettings} bridge={bridge} native={native} healthy={healthy} busy={busy || sending} saveState={saveState} saveError={saveError} />}
          </ModelCenter>}
          {spacePage === 'life' && <><label className="toggle"><input type="checkbox" checked={settings.autoAdvance} onChange={event => setSettings({ ...settings, autoAdvance: event.target.checked })} /><div><b>持续生活与主动联系</b><p>默认关闭。开启后核心可在后台调用模型，产生 API 费用。保存后重启生效。</p></div></label></>}
          {spacePage === 'world' && (worldTab === 'library' ? renderCharacterLibrary(false) : <>
            <button className="settings-entry" disabled={!native || !healthy || busy} onClick={() => setSettingEditor(true)}><span>修改故事设定<small>主角、世界、关系、视角与时区</small></span></button>
            <section className="settings-group world-identity-card"><details><summary><span><b>故事与身份</b><small>你的称呼与人设 · {effectCaption('identity')}</small></span></summary><label>你的称呼<input value={settings.userName} onChange={event => setSettings({ ...settings, userName: event.target.value })} maxLength={128} /></label><label>你的故事人设<textarea rows={3} value={settings.userProfile} onChange={event => setSettings({ ...settings, userProfile: event.target.value })} maxLength={12000} placeholder="你在这个世界中的身份、与角色的关系…" /></label><p className="caption">离开输入框时自动保存；仅用于新故事，已有故事会保留原设定。</p></details></section>
            <button className="settings-entry" onClick={() => { setDetail('memory'); setPage('story') }}><span>记忆与故事<small>维护事实与故事中的经历</small></span></button>
            <StoryManagement scope="story" bridge={bridge} cardId={selected} name={active?.card.name || ""} native={native} healthy={healthy} busy={busy || sending || transitioning} act={act} changed={storyChanged} notify={setNotice} />
          </>)}
          {(spacePage === 'life' || spacePage === 'advanced') && <LifeSettings openRetrieval={() => openSpace('tasks')} area={spacePage === 'life' ? 'daily' : 'advanced'} value={settings.mobileConfig} change={mobileConfig => setSettings(previous => ({ ...previous, mobileConfig }))} bridge={bridge} healthy={healthy} native={native} notify={setNotice} />}
          {spacePage === 'system' && (systemTab === 'diagnostics' ? <>
            <button className="settings-entry" onClick={() => setMessageDiagnostic('')}><span>消息诊断<small>聊天、生图、发图与检索的排查建议</small></span></button>
            <button className="settings-entry" onClick={() => { setQuickStartOpen(true); setPage('chat') }}><span>首次对话准备<small>检查角色、聊天连接与唤醒状态</small></span></button>
            <button className="settings-entry" onClick={startOnboarding}><span>重看新手引导<small>认识角色、模型连接与基本功能</small></span></button>
          </> : <>
            <StoryManagement scope="backup" bridge={bridge} cardId={selected} name={active?.card.name || ""} native={native} healthy={healthy} busy={busy || sending || transitioning} act={act} changed={storyChanged} notify={setNotice} />
          <section className="settings-group"><details><summary><span><b>核心维护与诊断</b><small>运行组件、设备信息与日志</small></span></summary><p className="caption">遇到运行问题时，可重新准备核心组件。角色与故事会保留。</p><button className="secondary" disabled={!native || busy || transitioning || healthy} onClick={() => act(async () => { await bridge.install(); setRuntime(await bridge.status()) })}>重新准备核心组件</button><h3>设备与诊断</h3><dl><div><dt>设备</dt><dd>{runtime?.device.model || '待原生读取'}</dd></div><div><dt>Android / API</dt><dd>{runtime ? `${runtime.device.android} / ${runtime.device.sdk}` : '—'}</dd></div><div><dt>ABI / 页大小</dt><dd>{runtime ? `${runtime.device.abi} / ${runtime.device.pageSize} B` : '—'}</dd></div><div><dt>表情包占用</dt><dd>{(libraryBytes(stickers) / 1024 ** 2).toFixed(2)} MiB（含已发送原件）</dd></div><div><dt>可用空间</dt><dd>{runtime ? `${(runtime.device.availableBytes / 1024 ** 3).toFixed(2)} GiB` : '—'}</dd></div><div><dt>应用 / HDS</dt><dd>{runtime?.version || '—'} / rc57</dd></div></dl><div className="actions"><button className="secondary" disabled={!native || busy} onClick={() => act(async () => setDiagnostic(await bridge.diagnostics({ probe: true })))}>查看安装诊断</button><button className="secondary" disabled={!native || busy} onClick={() => act(() => bridge.copyDiagnostics(), '安装诊断已复制，不含密钥、人设和聊天。')}>复制诊断</button><button className="secondary" disabled={!native || busy} onClick={() => act(async () => { const result = await bridge.saveDiagnostics(); setNotice(result.cancelled ? '已取消保存' : '安装诊断已保存。') })}>保存诊断</button></div>{diagnostic && <pre aria-label="安装诊断">{JSON.stringify(diagnostic, null, 2)}</pre>}<details><summary>查看运行日志</summary><pre role="log" aria-label="运行日志">{runtime?.logs.join('\n') || '暂无日志'}</pre></details><p className="caption">请反馈错误阶段、页大小与日志；分享前检查是否包含个人聊天内容。16 KB 页、后台存活与 QQ 能力均需真机验证。</p></details></section>
          </>)}
        </div>}
      </>}

    </main>
    <nav ref={navigation} aria-label="主导航" style={{ '--active-tab': tabs.indexOf(page === 'cards' ? 'chat' : page === 'inbox' ? 'settings' : page) } as React.CSSProperties}><span className="nav-indicator" aria-hidden="true" />{tabs.map(key => <button key={key} className={key === page || (key === 'chat' && page === 'cards') ? 'active' : ''} onClick={() => selectTab(key)} aria-current={key === page || (key === 'chat' && page === 'cards') ? 'page' : undefined} aria-label={labels[key]}><Icon name={key} /><span>{labels[key]}</span></button>)}</nav>
    {messageDiagnostic !== null && <MessageDiagnostics jobs={experience.snapshot.jobs} refreshJobs={experience.refresh} configureImages={() => { setMessageDiagnostic(null); openSpace('media') }} key={selected} bridge={scopedBridge} healthy={healthy} messageId={messageDiagnostic} messages={messages} close={() => setMessageDiagnostic(null)} />}
    {settingEditor && <StorySettingEditor key={selected} bridge={bridge} close={() => setSettingEditor(false)} saved={async () => { await refreshStory(); setNotice('故事设定已更新。') }} />}
    {stickerManager && <StickerManager back={stickerManagerBack} library={stickers} bridge={bridge} native={native} change={value => { saveStickers(value); if (runtimeRef.current?.state === 'healthy') setRestartNeeded(true) }} close={() => setStickerManager(false)} notify={setNotice} importReason={!settingsReady ? '正在读取模型设置，请稍候…' : stickerImportReason(settings)} beforeImport={async () => { const reason = stickerImportReason(settingsRef.current); if (reason) throw new Error(reason); await persistSettings() }} configureVision={() => { setStickerManager(false); openSpace('tasks') }} />}
    {editingCard && <CardEditor key={editingCard.id} saved={editingCard} busy={busy} close={() => setEditingCard(null)} save={async card => { setBusy(true); try { await bridge.updateCard({ id: editingCard.id, card }); setEditingCard(null); await refreshCards(); setNotice('人设已修改，剧情与记忆保留。重新启动 HDS 后生效。') } finally { setBusy(false) } }} />}
    {deleteTarget && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="删除角色确认"><h2>删除「{deleteTarget.card.name}」？</h2><p>将从角色库移除。已有剧情、记忆与原文件仍保留在本机，重新导入原文件可恢复。当前角色运行时会先停止 HDS。</p><div className="actions"><button className="secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>取消</button><button className="primary" disabled={busy} onClick={() => void act(async () => { const id = deleteTarget.id; await bridge.deleteCard({ id }); setDeleteTarget(null); if (selected === id) { setMessages([]); setStory(null) } await refreshCards() }, '角色已从库中移除，历史保留。')}>确认删除</button></div></section></div>}
    {importChoices.length > 0 && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="选择 HDS 人设"><div className="section-title"><h2>文件包含多个人设</h2><button aria-label="取消导入" onClick={() => setImportChoices([])}>×</button></div><p className="caption">选择要导入的 HDS 实例。</p>{importChoices.map((choice, index) => <button key={index} className="secondary wide" onClick={() => { setPreview(choice); setImportChoices([]) }}>{index + 1}. {choice.card.name}</button>)}</section></div>}
    {preview && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="角色卡预览"><div className="section-title"><span className="eyebrow">CHARACTER / {preview.card.format.toUpperCase()}</span><button aria-label="关闭" disabled={busy} onClick={() => setPreview(null)}>×</button></div><h1>{preview.card.name}</h1><p className="preview-text">{preview.card.description}</p>{preview.card.personality && <><h3>性格</h3><p className="preview-text">{preview.card.personality}</p></>}{preview.card.firstMessage && <><h3>开场白</h3><p className="preview-text">{preview.card.firstMessage}</p></>}<h3>兼容说明</h3><ul>{preview.card.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>{preview.base64 && <button className="primary wide" disabled={busy} onClick={() => void savePreview(true)}>保存并使用这个角色<Icon name="arrow" /></button>}{preview.base64 && <button className="secondary wide" disabled={busy} onClick={() => void savePreview(false)}>只保存到角色库</button>}</section></div>}
    {exportOpen && <CharacterExportModal bridge={bridge} native={native} cardId={exportCardId} ready={native && settingsReady && !!exportCardId} name={cards.find(row => row.id === exportCardId)?.card.name || ''} config={settings.mobileConfig} revision={() => exportCardId} busy={busy} working={setBusy} close={() => setExportOpen(false)} />}
    {importCodeOpen && <CharacterImportModal busy={busy} working={setBusy} save={input => saveImportedCard(input)} close={() => setImportCodeOpen(false)} />}
    {createOpen && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="创建角色"><div className="section-title"><h2>写下一个人</h2><button aria-label="关闭" onClick={() => setCreateOpen(false)}>×</button></div><label>角色名称<input value={newName} onChange={event => setNewName(event.target.value)} maxLength={128} /></label><label>角色描述<textarea rows={6} value={newProfile} onChange={event => setNewProfile(event.target.value)} maxLength={262144} placeholder="身份、性格、说话方式与生活背景…" /></label><button className="primary wide" disabled={!newName.trim() || !newProfile.trim()} onClick={() => { const raw = JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: newName.trim(), description: newProfile, personality: '', scenario: '', first_mes: '', mes_example: '', extensions: {} } }); const bytes = new TextEncoder().encode(raw); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); setPreview({ card: parseCard(bytes), base64: btoa(binary) }); setCreateOpen(false); setNewName(''); setNewProfile('') }}>预览角色<Icon name="arrow" /></button></section></div>}
  </div>{historySearch && <HistorySearch key={selected} bridge={scopedBridge} background={appShell} close={() => setHistorySearch(false)} />}{onboardingOpen && <Onboarding targets={onboardingTargets} background={appShell} prepare={prepareOnboarding} close={closeOnboarding} />}</>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

import './glass.css'
import './experience.css'
