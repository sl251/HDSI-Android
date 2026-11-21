import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Message } from '../../../packages/contracts'
import type { Page, SpacePage, StoryDetail } from '../navigation'

interface ScrollRestorationOptions {
  selected: string
  page: Page
  detail: StoryDetail
  spacePage: SpacePage | null
  onboardingOpen: boolean
  storyReady: boolean
  messages: Message[]
}

interface ReadingPosition {
  y: number
  anchor?: string
  offset?: number
  drawers: boolean[]
}

function readAnchors() {
  return [...document.querySelectorAll<HTMLElement>('[data-read-anchor]')]
}

function memoryDrawers() {
  return [...document.querySelectorAll<HTMLDetailsElement>('.memory-drawer')]
}

const atChatBottom = () => document.documentElement.scrollHeight - innerHeight - scrollY < 96
const scrollToBottom = () => window.scrollTo(0, document.documentElement.scrollHeight)

export function useScrollRestoration({
  selected, page, detail, spacePage, onboardingOpen, storyReady, messages,
}: ScrollRestorationOptions) {
  const [newMessages, setNewMessages] = useState(0)
  const storyLifetimes = useRef(new Map<string, number>())
  const positions = useRef(new Map<string, ReadingPosition>())
  const nearBottom = useRef(true)
  const forceBottom = useRef(false)
  const userMoved = useRef(false)
  const pageRef = useRef(page)
  const restored = useRef('')
  const prependAnchor = useRef<{ id: string; top: number }>()
  const notificationFrames = useRef(new Set<number>())
  const mounted = useRef(false)
  const subpage = page === 'story' ? detail : page === 'settings' ? spacePage ?? '' : ''
  const locationKey = `${selected}:${storyLifetimes.current.get(selected) ?? 0}:${page}:${subpage}`

  const committedLocation = useRef(locationKey)
  useLayoutEffect(() => { committedLocation.current = locationKey }, [locationKey])

  const savePosition = () => {
    const anchor = readAnchors().find(element => element.getBoundingClientRect().bottom > 0)
    positions.current.set(committedLocation.current, {
      y: window.scrollY,
      anchor: anchor?.dataset.readAnchor,
      offset: anchor?.getBoundingClientRect().top,
      drawers: memoryDrawers().map(element => element.open),
    })
  }

  const forgetPositions = (cardId: string) => {
    for (const key of positions.current.keys()) {
      if (key.startsWith(`${cardId}:`)) positions.current.delete(key)
    }
    restored.current = ''
  }
  const resetStoryPosition = (cardId: string) => {
    forgetPositions(cardId)
    storyLifetimes.current.set(cardId, (storyLifetimes.current.get(cardId) ?? 0) + 1)
  }

  const clearPrepend = () => { prependAnchor.current = undefined }
  const preparePrepend = (id: string) => {
    const anchor = readAnchors().find(element => element.dataset.readAnchor === `message-${id}`)
    if (anchor) prependAnchor.current = { id, top: anchor.getBoundingClientRect().top }
    forceBottom.current = false
    nearBottom.current = false
    userMoved.current = true
  }
  const restoreAfterPrepend = useCallback(() => {
    const anchor = prependAnchor.current
    if (!anchor) return
    prependAnchor.current = undefined
    const element = readAnchors().find(row => row.dataset.readAnchor === `message-${anchor.id}`)
    if (element) window.scrollBy({ top: element.getBoundingClientRect().top - anchor.top, behavior: 'instant' })
  }, [])
  const historyAppended = (previous: Message[], next: Message[]) => {
    if (!previous.length || nearBottom.current) return
    const ids = new Set(previous.map(row => row.id))
    const count = next.filter(row => !ids.has(row.id)).length
    if (count) setNewMessages(current => current + count)
  }

  const followNextMessage = () => { forceBottom.current = true }
  const followLatest = () => {
    forceBottom.current = true
    nearBottom.current = true
    userMoved.current = false
    setNewMessages(0)
  }
  const toLatest = () => {
    followLatest()
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }
  const prepareNotification = (cardId: string) => {
    forgetPositions(cardId)
    followLatest()
  }
  const scrollAfterNotification = (current: () => boolean) => {
    if (!mounted.current) return
    const frame = requestAnimationFrame(() => {
      notificationFrames.current.delete(frame)
      if (current()) scrollToBottom()
    })
    notificationFrames.current.add(frame)
  }

  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      restored.current = ''
      notificationFrames.current.forEach(cancelAnimationFrame)
      notificationFrames.current.clear()
    }
  }, [])

  useLayoutEffect(() => { pageRef.current = page }, [page])

  useEffect(() => {
    const onScroll = () => {
      if (pageRef.current !== 'chat') return
      nearBottom.current = atChatBottom()
      if (nearBottom.current) setNewMessages(0)
    }
    const moved = () => {
      userMoved.current = true
      forceBottom.current = false
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', moved, { passive: true })
    window.addEventListener('touchstart', moved, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', moved)
      window.removeEventListener('touchstart', moved)
    }
  }, [])

  const hasMessages = messages.length > 0
  useLayoutEffect(() => {
    if (onboardingOpen || (page === 'story' && !storyReady) || (page === 'chat' && !hasMessages)) return
    if (restored.current === locationKey) return
    restored.current = locationKey
    userMoved.current = false
    const saved = positions.current.get(locationKey)
    let lastRestoredY: number | undefined
    const restore = () => {
      if (userMoved.current) return
      // 键盘或滚动条也能离开原阅读位置，追加消息触发的布局变化须让行。
      if (page === 'chat' && !nearBottom.current && lastRestoredY !== undefined && scrollY !== lastRestoredY) {
        userMoved.current = true
        return
      }
      if (saved) {
        memoryDrawers().forEach((element, index) => { element.open = saved.drawers[index] ?? false })
        const anchor = readAnchors().find(element => element.dataset.readAnchor === saved.anchor)
        window.scrollTo(0, anchor && saved.offset !== undefined
          ? scrollY + anchor.getBoundingClientRect().top - saved.offset
          : saved.y)
      } else if (page === 'chat' || (page === 'story' && detail === 'story')) {
        scrollToBottom()
      } else {
        window.scrollTo(0, 0)
      }
      if (page === 'chat') {
        nearBottom.current = atChatBottom()
        lastRestoredY = scrollY
      }
    }
    restore()
    const frame = requestAnimationFrame(restore)
    const observer = new ResizeObserver(restore)
    const main = document.querySelector('main')
    if (main) observer.observe(main)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [locationKey, storyReady, hasMessages, onboardingOpen])

  useLayoutEffect(() => {
    if (page !== 'chat' || onboardingOpen) return
    const follow = () => {
      if (nearBottom.current || forceBottom.current) {
        scrollToBottom()
        forceBottom.current = false
      }
    }
    follow()
    const observer = new ResizeObserver(follow)
    const list = document.querySelector('.messages')
    if (list) observer.observe(list)
    return () => observer.disconnect()
  }, [page, messages, onboardingOpen])

  return {
    savePosition, resetStoryPosition, historyAppended, preparePrepend, clearPrepend, restoreAfterPrepend,
    followNextMessage, newMessages, toLatest, prepareNotification, scrollAfterNotification,
  }
}
