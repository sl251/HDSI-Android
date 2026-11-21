import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { composerEnter, createDraftStore, type Draft } from '../composer-state'
import type { Page } from '../navigation'

export function useChatComposer(selected: string, selectedRef: MutableRefObject<string>, page: Page, setNotice: (text: string) => void) {
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
  const composer = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { composing.current = false }, [selected, page])

  const handleEnter = (event: KeyboardEvent<HTMLTextAreaElement>, behavior: 'send' | 'newline' | undefined, send: () => Promise<void>) => {
    const action = composerEnter({
      key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey,
      isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode,
    }, composing.current, behavior)
    if (action === 'send') { event.preventDefault(); void send() }
  }

  return { draft, attachments, draftAudio, getDraft, updateDraft, setDraft, setAttachments, composer, composing, handleEnter }
}

export function useChatComposerLayout(
  { composer, draft }: ReturnType<typeof useChatComposer>, selected: string, page: Page, voiceBar: boolean, fontSize: number,
) {
  useLayoutEffect(() => {
    const element = composer.current
    if (!element) return
    const resize = () => { element.style.height = 'auto'; element.style.height = `${Math.max(42, Math.min(150, element.scrollHeight))}px`; element.style.overflowY = element.scrollHeight > 150 ? 'auto' : 'hidden' }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draft, selected, page, voiceBar, fontSize])
}
