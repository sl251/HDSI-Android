import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { ExperienceSettings, ExperienceSnapshot, NativeBridge } from '../../../packages/contracts'
import { MediaJobNotice } from '../MediaJobNotice'
import { MediaComposer } from '../MediaComposer'
import { VoiceBubble } from '../Voice'
import { StickerDrawer } from '../Stickers'
import { stickerEntryVisible } from '../sticker-state'
import type { useChatComposer } from '../hooks/useChatComposer'
import type { useChatImages } from '../hooks/useChatImages'
import type { useChatMedia } from '../hooks/useChatMedia'
import type { useChatSend } from '../hooks/useChatSend'
import { Icon } from './Icon'
import { MediaButtons, VoiceControls } from './ChatMediaControls'

export interface ChatComposerProps {
  bridge: NativeBridge
  scopedBridge: NativeBridge
  selected: string
  native: boolean
  healthy: boolean
  busy: boolean
  guideRef: RefObject<HTMLDivElement>
  composerState: ReturnType<typeof useChatComposer>
  media: ReturnType<typeof useChatMedia>
  images: ReturnType<typeof useChatImages>
  delivery: ReturnType<typeof useChatSend>
  snapshot: ExperienceSnapshot
  refresh: () => Promise<void>
  enterBehavior: ExperienceSettings['enterBehavior']
  diagnose: (id: string) => void
  openVisual: () => void
}

export function ChatComposer({
  bridge, scopedBridge, selected, native, healthy, busy, guideRef, composerState, media, images, delivery,
  snapshot, refresh, enterBehavior, diagnose, openVisual,
}: ChatComposerProps) {
  const { draft, draftAudio, attachments, composer, composing, handleEnter, getDraft, updateDraft, setDraft, setAttachments } = composerState
  const { mediaDrawer, setMediaDrawer, stickerDrawer, setStickerDrawer, voiceBar, setVoiceBar, stickers } = media
  const { send, sending } = delivery
  const { pickImage, attachmentReason } = images
  const focusTimer = useRef<ReturnType<typeof setTimeout>>()
  useLayoutEffect(() => () => clearTimeout(focusTimer.current), [selected])
  const switchToKeyboard = () => {
    setVoiceBar(false)
    clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => composer.current?.focus(), 20)
  }
  return <div className="composer-wrap" ref={guideRef}>
    <MediaJobNotice jobs={snapshot.jobs.filter(job => job.purpose === 'chat')} bridge={scopedBridge} healthy={healthy} refresh={refresh} diagnose={diagnose} />
    {mediaDrawer && <MediaComposer
      key={selected} bridge={scopedBridge} healthy={healthy} snapshot={snapshot} refresh={refresh}
      onVoiceMode={() => setVoiceBar(true)} onVisual={() => { setMediaDrawer(false); openVisual() }}
      onPick={source => void pickImage(undefined, source)} close={() => setMediaDrawer(false)}
      onTranscript={(text, audio) => {
        const current = getDraft(selected)
        updateDraft({ content: [current.content, text].filter(Boolean).join('\n'), audio })
        composer.current?.focus()
      }}
    />}
    {draftAudio && <div className="draft-audio">
      <VoiceBubble bridge={bridge} audio={draftAudio} content={draft} />
      <div className="draft-audio-actions">
        <button type="button" className="primary-pill" disabled={!native || !healthy || sending || busy} onClick={() => void send()}>发送语音</button>
        <button type="button" onClick={() => updateDraft({ audio: undefined })}>移除语音</button>
      </div>
    </div>}
    {stickerDrawer && stickerEntryVisible(stickers) && <StickerDrawer library={stickers} disabled={sending || busy || !healthy}
      close={() => setStickerDrawer(false)} send={(packId, asset) => void send(undefined, { packId, asset })} />}
    {attachments.length > 0 && <div className="attachment-tray">{attachments.map(image => <div key={image.id}>
      <img src={image.dataUri} alt="待发送图片" />
      <button aria-label="移除图片" disabled={sending || busy} onClick={() => setAttachments(current => current.filter(item => item.id !== image.id))}>×</button>
    </div>)}</div>}
    <form className={`composer${voiceBar ? ' voice-mode' : ''}`} onSubmit={event => { event.preventDefault(); if (!composing.current) void send() }}>
      {voiceBar ? <VoiceControls media={media} switchToKeyboard={switchToKeyboard} busy={busy} sending={sending} healthy={healthy} /> : <>
        <MediaButtons media={media} composer={composer} busy={busy} sending={sending} />
        <textarea ref={composer} disabled={sending} rows={1} value={draft}
          onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
          onKeyDown={event => handleEnter(event, enterBehavior, send)}
          onPaste={event => {
            const images = [...event.clipboardData.items].filter(item => item.type.startsWith('image/'))
              .map(item => item.getAsFile()).filter((file): file is File => file !== null)
            if (images.length) { event.preventDefault(); void pickImage(images) }
          }}
          onChange={event => setDraft(event.target.value)} placeholder="发消息…" maxLength={12000} aria-label="消息内容" />
        <button className="send" disabled={!native || !healthy || sending || busy || (!draft.trim() && !attachments.length && !draftAudio)} aria-label="发送消息">
          <Icon name="arrow" />
        </button>
      </>}
    </form>
    {healthy && attachmentReason && <p id="image-entry-hint" className="composer-hint">{attachmentReason}</p>}
  </div>
}
