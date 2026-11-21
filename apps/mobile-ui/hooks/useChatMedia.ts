import { useEffect, useRef, useState } from 'react'
import type { NativeBridge } from '../../../packages/contracts'
import type { Draft } from '../composer-state'
import type { Page } from '../navigation'
import { readLibrary, type StickerLibrary } from '../sticker-state'

export function useChatMedia(bridge: NativeBridge, selected: string, page: Page, updateDraft: (patch: Partial<Draft>) => void, setNotice: (text: string) => void) {
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
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const startInlineVoice = async (y: number) => {
    if (voiceHold.current.recorderStarted) { await stopInlineVoice(false); return }
    voiceHold.current = { active: true, startedAt: Date.now(), startY: y, cancel: false, recorderStarted: false }
    setVoiceCancel(false); setVoiceRecording(true)
    try {
      await bridge.startVoiceRecording()
      voiceHold.current.recorderStarted = true
      if (!voiceHold.current.active) await stopInlineVoice(voiceHold.current.cancel)
    } catch (error) { voiceHold.current.active = false; setVoiceRecording(false); setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const [stickerDrawer, setStickerDrawer] = useState(false)
  const [stickerManager, setStickerManager] = useState(false)
  const stickerManagerBack = useRef<(() => void) | undefined>()

  useEffect(() => { setMediaDrawer(false); setVoiceRecording(false); setVoiceCancel(false) }, [selected])
  useEffect(() => { setStickerDrawer(false) }, [selected, page])
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

  const moveVoiceHold = (y: number) => {
    if (!voiceHold.current.active) return
    const cancel = voiceHold.current.startY - y > 48
    voiceHold.current.cancel = cancel
    setVoiceCancel(cancel)
  }
  const releaseVoiceHold = () => {
    if (!voiceHold.current.active) return
    if (voiceHold.current.cancel || Date.now() - voiceHold.current.startedAt >= 180) {
      void stopInlineVoice(voiceHold.current.cancel)
    }
  }
  const cancelVoiceHold = () => { if (voiceHold.current.active) void stopInlineVoice(true) }

  return {
    stickers, stickersRef, saveStickers, mediaDrawer, setMediaDrawer, stickerDrawer, setStickerDrawer,
    stickerManager, setStickerManager, stickerManagerBack, voiceBar, setVoiceBar, voiceRecording, voiceCancel,
    startInlineVoice, moveVoiceHold, releaseVoiceHold, cancelVoiceHold,
  }
}
