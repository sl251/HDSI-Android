import { useEffect, useRef, type MutableRefObject } from 'react'
import type { ModelSettings, NativeBridge } from '../../../packages/contracts'
import type { WakeStageProps } from '../components/WakeStage'
import { stickerSyncPacks, type StickerLibrary } from '../sticker-state'
import type { useAppNavigation } from './useAppNavigation'
import type { useChatWorkspace } from './useChatWorkspace'
import type { RuntimeSession } from './useRuntimeSession'
import type { useSettingsPersistence } from './useSettingsPersistence'

export type AppAction = (task: () => Promise<unknown>, success?: string) => Promise<void>
export const mainConnection = (settings: ModelSettings) =>
  settings.providers.find(row => row.enabled && row.useForMain && row.endpoint && row.model)

interface StoryActionsOptions {
  bridge: NativeBridge
  native: boolean
  busy: boolean
  avatar: string
  characterName: string
  session: RuntimeSession
  navigation: Pick<ReturnType<typeof useAppNavigation>, 'page' | 'setPage' | 'setSwitcher' | 'openSpace' | 'showNotificationChat'>
  chat: Pick<ReturnType<typeof useChatWorkspace>, 'reading' | 'history' | 'delivery' | 'composerState'>
  stickersRef: MutableRefObject<StickerLibrary>
  persistence: ReturnType<typeof useSettingsPersistence>
  act: AppAction
  setNotice: (text: string) => void
}

export function useStoryActions({ bridge, native, busy, avatar, characterName, session, navigation, chat, stickersRef, persistence, act, setNotice }: StoryActionsOptions) {
  const { runtime, setRuntime, cards, selected, selectedRef, profileRevision, setStory, refreshCards } = session
  const { setPage, page, setSwitcher, openSpace, showNotificationChat } = navigation
  const { settings, settingsRef, settingsReady, persistSettings, setRestartNeeded, markLaunchedSettings, refreshLaunchNotice } = persistence
  const { reading, history, delivery, composerState: { composer } } = chat
  const focusAfterWake = useRef(false)
  const state = runtime?.state
  useEffect(() => {
    if (state === 'healthy' && focusAfterWake.current) {
      refreshLaunchNotice()
      if (page === 'chat') { composer.current?.focus(); focusAfterWake.current = false }
    }
    if (state === 'failed') focusAfterWake.current = false
  }, [state, page, composer, refreshLaunchNotice])

  const updateStatus = async (revision: number) => {
    const status = await bridge.status()
    if (revision === profileRevision.current) setRuntime(status)
  }
  const start = async (revision: number) => {
    if (revision !== profileRevision.current) return
    focusAfterWake.current = true
    markLaunchedSettings()
    await bridge.syncStickerLibrary({ packs: stickerSyncPacks(stickersRef.current) })
    if (revision !== profileRevision.current) return
    await bridge.start()
    await updateStatus(revision)
  }
  const active = cards.find(card => card.id === selected)
  const modelReady = !!mainConnection(settings)
  const wake = () => act(async () => {
    if (!active) { setSwitcher(true); return }
    if (!mainConnection(settingsRef.current)) { setPage('settings'); setNotice('为故事选择一个模型，就可以开始了。'); return }
    const revision = profileRevision.current
    await persistSettings()
    try { await start(revision) }
    catch (error) { if (revision === profileRevision.current) focusAfterWake.current = false; throw error }
  })
  const restart = () => act(async () => {
    const revision = profileRevision.current
    await persistSettings()
    if (revision !== profileRevision.current) return
    await bridge.stop()
    await updateStatus(revision)
    await start(revision)
  })
  const rest = () => act(async () => {
    const revision = profileRevision.current
    await bridge.stop()
    await updateStatus(revision)
  })
  const resetChatAndStory = (historyReplaced = false) => {
    history.resetHistory(historyReplaced)
    reading.clearPrepend()
    delivery.resetSend()
    setStory(null)
  }
  const storyChanged = async (historyReplaced = false) => {
    resetChatAndStory(historyReplaced)
    localStorage.removeItem(`hds-maintenance-${selected}`)
    reading.resetStoryPosition(selected)
    profileRevision.current++
    const revision = await refreshCards()
    if (revision === undefined || revision !== profileRevision.current) return
    await updateStatus(revision)
    if (revision === profileRevision.current) setRestartNeeded(false)
  }
  const switchCard = (id: string) => act(async () => {
    if (id === selectedRef.current) { setSwitcher(false); return }
    const before = profileRevision.current
    const resume = (await bridge.status()).state === 'healthy'
    if (before !== profileRevision.current) return
    reading.savePosition()
    const switching = ++profileRevision.current
    const previous = selectedRef.current
    selectedRef.current = ''
    try { await bridge.selectCard({ id }) }
    catch (error) {
      if (switching !== profileRevision.current) return
      selectedRef.current = previous
      throw error
    }
    if (switching !== profileRevision.current) return
    const revision = ++profileRevision.current
    resetChatAndStory()
    await refreshCards()
    if (revision !== profileRevision.current) return
    await updateStatus(revision)
    if (revision !== profileRevision.current) return
    setSwitcher(false)
    if (resume) { await persistSettings(); await start(revision) }
  })
  const openNotification = async (cardId: string, stopped: () => boolean) => {
    const before = profileRevision.current
    const library = await bridge.cards().catch(error => {
      if (!stopped() && before === profileRevision.current) throw error
    })
    if (!library || stopped() || before !== profileRevision.current) return
    if (!library.cards.some(card => card.id === cardId)) { setNotice('这个角色已不在角色库中。'); return }
    await switchCard(cardId)
    if (stopped() || selectedRef.current !== cardId) return
    const revision = profileRevision.current
    const current = () => !stopped() && revision === profileRevision.current && selectedRef.current === cardId
    reading.prepareNotification(cardId)
    showNotificationChat()
    try {
      const status = await bridge.status()
      if (!current()) return
      if (status.state === 'healthy') await history.refreshHistory(revision)
      if (current()) reading.scrollAfterNotification(current)
    } catch (error) { if (current()) throw error }
  }

  const transitioning = ['installing', 'starting', 'stopping'].includes(state || '')
  const runtimeLabel = !native ? '预览' : state === 'healthy' ? '在线' : state === 'installing' ? '准备核心中' : state === 'starting' ? '正在唤醒…' : state === 'stopping' ? '正在保存…' : state === 'failed' ? '唤醒失败' : '已休眠'
  const triggerPrimaryWake = () => {
    if (!active) { setSwitcher(true); return }
    if (!modelReady) { openSpace('models'); setNotice('为故事选择一个模型，就可以开始了。'); return }
    void wake()
  }
  const wakeProps: WakeStageProps = {
    active, cardCount: cards.length, avatar, characterName, modelReady, runtime, transitioning, runtimeLabel, triggerPrimaryWake,
    wakeActionLabel: !active ? '选择角色' : !modelReady ? '连接故事模型' : state === 'failed' ? '重试唤醒' : '唤醒',
    chatWakeDisabled: busy || (!!active && modelReady && (!native || !settingsReady)), cancelInstall: () => act(() => bridge.cancelInstall()),
  }
  const wakeStatusNote = state === 'installing' ? '首次准备约 1 分钟，请稍候…' : state === 'starting' ? '正在唤醒本地核心…' : ''
  return { wake, restart, rest, switchCard, storyChanged, openNotification, wakeProps, wakeStatusNote }
}
