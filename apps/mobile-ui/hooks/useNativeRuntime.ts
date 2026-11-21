import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { refreshCoordinator, visionProjection, type NativeBridge, type QQConversation } from '../../../packages/contracts'
import type { Page } from '../navigation'
import type { StorySnapshot } from '../pages/StoryPage'
import type { useChatHistory } from './useChatHistory'
import type { RuntimeSession } from './useRuntimeSession'
import type { useSettingsPersistence } from './useSettingsPersistence'

interface NativeRuntimeOptions {
  bridge: NativeBridge
  native: boolean
  page: Page
  session: RuntimeSession
  history: Pick<ReturnType<typeof useChatHistory>, 'refreshHistory' | 'hasMessages'>
  persistence: Pick<ReturnType<typeof useSettingsPersistence>,
    'initializeSettings' | 'savedSettings' | 'settingsReady' | 'settingsRef' | 'setRestartNeeded'>
  openNotification: (id: string, stopped: () => boolean) => Promise<void>
  setNotice: (text: string) => void
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useNativeRuntime({ bridge, native, page, session, history, persistence, openNotification, setNotice }: NativeRuntimeOptions) {
  const { runtime, setRuntime, setCards, selected, selectedRef, profileRevision, selectProfile, setStory } = session
  const { initializeSettings, savedSettings, settingsReady, settingsRef, setRestartNeeded } = persistence
  const healthy = runtime?.state === 'healthy'
  const [inboxUnread, setInboxUnread] = useState(0)
  // A single subscription serves every page. Dispatch into the last committed view.
  const handlers = useRef({ history, openNotification })
  useLayoutEffect(() => { handlers.current = { history, openNotification } }, [history, openNotification])

  useEffect(() => {
    if (!native) { setNotice('浏览器预览模式：原生运行与存储不可用，不显示模拟成功结果。'); return }
    let stopped = false
    const revision = profileRevision.current
    const initialize = async () => {
      if (stopped) return
      try {
        const [prefs, library] = await Promise.all([bridge.settings(), bridge.cards()])
        if (stopped) return
        initializeSettings(prefs)
        if (revision !== profileRevision.current) return
        selectProfile(prefs.activeCard)
        setCards(library.cards)
      } catch (error) { if (!stopped) setNotice(errorText(error)) }
    }
    // Defer the first native call until StrictMode has released its trial subscription.
    void Promise.resolve().then(initialize)
    return () => { stopped = true }
  }, [bridge, native, initializeSettings, selectProfile, profileRevision, setCards, setNotice])

  useEffect(() => {
    if (!native) return
    let stopped = false, polling = false, lastHistory = 0
    const poll = async () => {
      if (stopped || polling || document.hidden) return
      polling = true
      let revision = profileRevision.current
      const current = () => !stopped && revision === profileRevision.current
      try {
        let status = await bridge.status()
        if (!current()) return
        if (savedSettings.current) {
          const launch = await bridge.notificationLaunch()
          if (!current()) return
          if (launch.cardId) {
            try { await handlers.current.openNotification(launch.cardId, () => stopped) }
            finally { revision = profileRevision.current }
            if (stopped) return
            status = await bridge.status()
            if (!current()) return
          }
        }
        setRuntime(status)
        if (status.state === 'healthy' && (lastHistory === 0 || !handlers.current.history.hasMessages() || Date.now() - lastHistory >= 15000)) {
          lastHistory = Date.now()
          await handlers.current.history.refreshHistory(revision)
        }
      } catch (error) { if (current()) setNotice(errorText(error)) }
      finally { polling = false }
    }
    const visible = () => { if (!document.hidden) { lastHistory = 0; void poll() } }
    const subscribe = () => {
      if (stopped) return
      return bridge.addListener?.('messageReceived', event => {
        if (stopped || document.hidden || event.cardId !== selectedRef.current) return
        const revision = profileRevision.current
        void handlers.current.history.refreshHistory(revision).catch(error => {
          if (!stopped && revision === profileRevision.current) setNotice(errorText(error))
        })
      })
    }
    const listener = Promise.resolve().then(subscribe).catch(() => undefined)
    document.addEventListener('visibilitychange', visible)
    void Promise.resolve().then(poll)
    const interval = setInterval(() => void poll(), 3000)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
      void listener.then(handle => handle?.remove()).catch(() => {})
    }
  }, [bridge, native, profileRevision, savedSettings, selectedRef, setNotice, setRuntime])

  const storyReads = useMemo(() => refreshCoordinator(async () => {
    const cardId = selectedRef.current
    const snapshot = (await bridge.rpc({ method: 'story.snapshot' })).data as StorySnapshot | null
    return { cardId, snapshot }
  }, ({ cardId, snapshot }, revision) => {
    if (revision === profileRevision.current && cardId === selectedRef.current) setStory(snapshot)
  }), [bridge, profileRevision, selectedRef, setStory])
  const refreshStory = useCallback(() => storyReads(profileRevision.current, true), [profileRevision, storyReads])
  useEffect(() => {
    if (page !== 'story' || !healthy) return
    let cancelled = false, loading = false
    const refresh = async () => {
      if (cancelled || loading || document.hidden || selectedRef.current !== selected) return
      const revision = profileRevision.current
      loading = true
      try { await storyReads(revision) }
      catch (error) { if (!cancelled && revision === profileRevision.current) setNotice(errorText(error)) }
      finally { loading = false }
    }
    void Promise.resolve().then(refresh)
    const timer = setInterval(() => void refresh(), 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [page, healthy, selected, selectedRef, profileRevision, storyReads, setNotice])

  useEffect(() => {
    if (!native || !healthy) { setInboxUnread(0); return }
    let cancelled = false, running = false
    const poll = async () => {
      if (cancelled || running || document.hidden) return
      const revision = profileRevision.current
      const current = () => !cancelled && revision === profileRevision.current
      running = true
      try {
        const result = await bridge.rpc({ method: 'qq.conversations' })
        if (current()) setInboxUnread((result.data as QQConversation[]).reduce((total, row) => total + row.unread, 0))
      } catch { if (current()) setInboxUnread(0) }
      finally { running = false }
    }
    void Promise.resolve().then(poll)
    const timer = setInterval(() => void poll(), 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [bridge, native, healthy, profileRevision])

  useEffect(() => {
    if (!native || !settingsReady || !healthy) return
    const revision = profileRevision.current
    let cancelled = false
    const current = () => !cancelled && revision === profileRevision.current
    const read = async () => {
      if (!current()) return
      try {
        const result = await bridge.rpc({ method: 'preset.syncStatus', payload: { currentVision: visionProjection(settingsRef.current) } })
        if (current() && (result.data as { visionRestartRequired?: boolean }).visionRestartRequired) setRestartNeeded(true)
      } catch { if (current()) setNotice('无法核对核心识图配置，选图前会重新检查。') }
    }
    void Promise.resolve().then(read)
    return () => { cancelled = true }
  }, [bridge, native, settingsReady, healthy, selected, profileRevision, settingsRef, setRestartNeeded, setNotice])

  return { refreshStory, inboxUnread, setInboxUnread }
}
