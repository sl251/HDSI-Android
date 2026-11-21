import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { onboardingStorageKey, type OnboardingTarget } from '../Onboarding'
import { tabs, type Page, type SpacePage, type StoryDetail, type Tab } from '../navigation'

interface AppNavigationOptions {
  savePosition: () => void
  notify: (notice: string) => void
}

type PageMotion = { phase: 'idle' | 'exit' | 'enter' | 'edge'; direction: number }

export function useAppNavigation({ savePosition, notify }: AppNavigationOptions) {
  const [page, updatePage] = useState<Page>('chat')
  const [detail, updateDetail] = useState<StoryDetail>('story')
  const [spacePage, setSpacePage] = useState<SpacePage | null>(null)
  const [worldTab, setWorldTab] = useState<'story' | 'library'>('story')
  const [systemTab, setSystemTab] = useState<'backup' | 'diagnostics'>('backup')
  const [switcher, setSwitcher] = useState(false)
  const switcherAnchorRef = useRef<HTMLDivElement>(null)
  const [inboxSource, setInboxSource] = useState<'tab' | 'space'>('tab')
  const previousTab = useRef<Page>('chat')
  const inboxBack = useRef<(() => boolean) | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try { return localStorage.getItem(onboardingStorageKey) === null } catch { return true }
  })
  const guideOrigin = useRef<{ page: Page; space: SpacePage | null }>({ page: 'chat', space: null })
  const [pageMotion, setPageMotion] = useState<PageMotion>({ phase: 'idle', direction: 0 })
  const [spaceMotion, setSpaceMotion] = useState<'none' | 'forward' | 'back'>('none')
  const pageTimer = useRef<ReturnType<typeof setTimeout>>()
  const pageFrames = useRef<number[]>([])
  const touchStart = useRef<{ x: number; y: number; id: number; page: Page } | null>(null)

  useEffect(() => {
    if (!switcher) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!switcherAnchorRef.current?.contains(event.target as Node)) setSwitcher(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSwitcher(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [switcher])

  const cancelPageMotion = () => {
    clearTimeout(pageTimer.current)
    pageFrames.current.forEach(cancelAnimationFrame)
    pageFrames.current = []
  }
  useEffect(() => cancelPageMotion, [])

  const resetPageMotion = () => {
    cancelPageMotion()
    setPageMotion({ phase: 'idle', direction: 0 })
  }
  const setPage = (next: Page, direction = 0) => {
    cancelPageMotion()
    if (next === page) {
      setPageMotion({ phase: 'idle', direction: 0 })
      return
    }
    savePosition()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPageMotion({ phase: 'idle', direction: 0 })
      updatePage(next)
      return
    }
    const enter = () => {
      setPageMotion({ phase: 'enter', direction })
      updatePage(next)
      pageFrames.current.push(requestAnimationFrame(() => {
        pageFrames.current.push(requestAnimationFrame(() => setPageMotion({ phase: 'idle', direction })))
      }))
    }
    // Clicks navigate immediately. Only a swipe waits for the exit animation.
    if (!direction) {
      enter()
      return
    }
    setPageMotion({ phase: 'exit', direction })
    pageTimer.current = setTimeout(enter, 90)
  }
  const openInbox = (source: 'tab' | 'space', direction = 0) => {
    if (page !== 'inbox') previousTab.current = page === 'cards' ? 'chat' : page
    setInboxSource(source)
    setPage('inbox', direction)
  }
  const openSpace = (next: SpacePage | null, direction?: number) => {
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
  const leaveInbox = () => {
    if (inboxBack.current?.()) return
    if (inboxSource === 'space') openSpace(null, -1)
    else setPage(previousTab.current === 'inbox' ? 'chat' : previousTab.current)
  }
  const selectTab = (next: Tab, direction = 0) => {
    if (next === 'settings') openSpace(null, direction)
    else setPage(next, direction)
  }
  const setDetail = (next: StoryDetail) => {
    savePosition()
    updateDetail(next)
  }
  const showNotificationChat = () => {
    resetPageMotion()
    setSwitcher(false)
    updatePage('chat')
  }
  const startOnboarding = () => {
    savePosition()
    guideOrigin.current = { page, space: spacePage }
    setOnboardingOpen(true)
  }
  const prepareOnboarding = (target: OnboardingTarget) => {
    setSwitcher(false)
    resetPageMotion()
    touchStart.current = null
    if (target === 'library') updatePage('cards')
    else if (target === 'models' || target === 'help') {
      setSpacePage(null)
      updatePage('settings')
    } else if (target === 'story') {
      updateDetail('story')
      updatePage('story')
    } else updatePage('chat')
  }
  const closeOnboarding = () => {
    try { localStorage.setItem(onboardingStorageKey, '1') } catch { notify('本机存储暂不可用，下次打开时可能再次显示引导。') }
    resetPageMotion()
    setOnboardingOpen(false)
    setSpacePage(guideOrigin.current.space)
    updatePage(guideOrigin.current.page)
  }

  const cancelSwipe = () => { touchStart.current = null }
  const beginSwipe = (event: TouchEvent<HTMLElement>) => {
    cancelSwipe()
    if (onboardingOpen || pageMotion.phase !== 'idle' || event.touches.length !== 1 || !tabs.includes(page as Tab)) return
    const target = event.target as HTMLElement
    if (target.closest('.modal-backdrop, .sticker-drawer, .composer-wrap, .select-field, .select-popover, .character-dropdown, input, textarea, select, audio, [contenteditable="true"]') || document.querySelector('[aria-modal="true"], .image-viewer')) return
    const touch = event.touches[0]
    // Leave the screen edges to the system's back gesture.
    if (touch.clientX <= 24 || touch.clientX >= innerWidth - 24) return
    touchStart.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier, page }
  }
  const moveSwipe = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) cancelSwipe()
  }
  const endSwipe = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    cancelSwipe()
    if (!start || start.page !== page || event.touches.length) return
    const touch = Array.from(event.changedTouches).find(value => value.identifier === start.id)
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
    const direction = dx < 0 ? 1 : -1
    const next = tabs[tabs.indexOf(page as Tab) + direction]
    if (next) selectTab(next, direction)
    else if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelPageMotion()
      setPageMotion({ phase: 'edge', direction: -direction })
      pageTimer.current = setTimeout(() => setPageMotion({ phase: 'idle', direction: -direction }), 100)
    }
  }

  return {
    page, setPage, selectTab, pageMotion, beginSwipe, moveSwipe, endSwipe, cancelSwipe,
    spacePage, setSpacePage, openSpace, spaceMotion, worldTab, setWorldTab, systemTab, setSystemTab,
    detail, setDetail, switcher, setSwitcher, switcherAnchorRef, inboxSource, inboxBack, openInbox, leaveInbox,
    onboardingOpen, prepareOnboarding, startOnboarding, closeOnboarding, showNotificationChat,
  }
}
