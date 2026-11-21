import type { RefObject } from 'react'
import { stickerEntryVisible } from '../sticker-state'
import type { useChatMedia } from '../hooks/useChatMedia'

interface ControlProps {
  media: ReturnType<typeof useChatMedia>
  busy: boolean
  sending: boolean
}

function StickerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5q3.5 3.5 7 0M9 9.5v1.5M15 9.5v1.5" strokeLinecap="round" />
  </svg>
}

export function VoiceControls({ media, switchToKeyboard, busy, sending, healthy }: ControlProps & { healthy: boolean; switchToKeyboard: () => void }) {
  const { voiceRecording, voiceCancel, startInlineVoice, moveVoiceHold, releaseVoiceHold, cancelVoiceHold,
    stickers, stickerDrawer, setStickerDrawer, setStickerManager, mediaDrawer, setMediaDrawer } = media
  return <>
    <button type="button" className="voice-mode-button" aria-label="切换到键盘输入" disabled={busy || sending || voiceRecording}
      onClick={switchToKeyboard}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M10 9h.01M14 9h.01M17 9h.01M7 12h.01M10 12h.01M14 12h.01M17 12h.01M8 15h8" strokeLinecap="round" />
      </svg>
    </button>
    <button type="button" className={`composer-hold-to-talk${voiceRecording ? ' recording' : ''}${voiceCancel ? ' cancelling' : ''}`}
      disabled={!healthy || busy || sending} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (busy || sending || !healthy) return
        e.currentTarget.setPointerCapture(e.pointerId)
        void startInlineVoice(e.clientY)
      }}
      onPointerMove={e => moveVoiceHold(e.clientY)} onPointerUp={releaseVoiceHold} onPointerCancel={cancelVoiceHold}>
      {voiceRecording ? (voiceCancel ? '松开手指，取消发送' : '松开 结束 · 上滑取消') : '按住 说话'}
    </button>
    <button type="button" className="sticker-entry" aria-label="打开表情包" aria-expanded={stickerDrawer}
      disabled={busy || sending || voiceRecording}
      onClick={() => { if (stickerEntryVisible(stickers)) setStickerDrawer(value => !value); else setStickerManager(true) }}>
      <StickerIcon />
    </button>
    <button type="button" className="attach-button" aria-label="添加图片或语音" aria-expanded={mediaDrawer}
      disabled={busy || sending || voiceRecording} onClick={() => { setStickerDrawer(false); setMediaDrawer(value => !value) }}>＋</button>
  </>
}

export function MediaButtons({ media, composer, busy, sending }: ControlProps & { composer: RefObject<HTMLTextAreaElement> }) {
  const { stickers, stickerDrawer, setStickerDrawer, mediaDrawer, setMediaDrawer } = media
  return <>
    <button type="button" className="attach-button" aria-label="添加图片或语音" aria-expanded={mediaDrawer} disabled={busy || sending}
      onClick={() => { composer.current?.blur(); setStickerDrawer(false); setMediaDrawer(value => !value) }}>＋</button>
    {stickerEntryVisible(stickers) && <button type="button" className="sticker-entry" aria-label="打开表情包" aria-expanded={stickerDrawer} disabled={busy || sending}
      onClick={() => { composer.current?.blur(); setStickerDrawer(value => !value) }}><StickerIcon /></button>}
  </>
}
