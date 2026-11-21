import React, { useCallback, useRef } from 'react'
import type { DiagnosticsMessageFocus, ExperienceSnapshot, NativeBridge } from '../../../packages/contracts'
import type { MessageAudio } from '../../../packages/contracts/voice'
import { VoiceBubble } from '../Voice'
import { StoredImage } from '../StoredImage'
import { stickerSource } from '../Stickers'
import { stickerMessageKey, type StickerAsset, type StickerLibrary } from '../sticker-state'
import { MessageStatus, TypingBubble } from '../MessageStatus'
import type { useChatHistory } from '../hooks/useChatHistory'
import type { useChatSend } from '../hooks/useChatSend'
import { MessageRow } from './MessageRow'

export interface MessageListProps {
  bridge: NativeBridge
  history: Pick<ReturnType<typeof useChatHistory>, 'messages' | 'displayMessages' | 'lastCharacterReplyTs'>
  delivery: Pick<ReturnType<typeof useChatSend>, 'retryMessage' | 'send' | 'requestState' | 'retryTarget' | 'sending' | 'pendingInHistory'>
  selected: string
  stickers: StickerLibrary
  avatar: string
  characterName: string
  userName: string
  streams: ExperienceSnapshot['streams']
  healthy: boolean
  busy: boolean
  messageFailures?: Map<string, string>
  typing: boolean
  focusMessageDiagnostic: (focus: DiagnosticsMessageFocus) => void
  newMessages: number
  toLatest: () => void
  children?: React.ReactNode
}

export function MessageList({
  bridge, history: { messages, displayMessages, lastCharacterReplyTs }, delivery, selected, stickers,
  avatar, characterName, userName, streams, healthy, busy, messageFailures, typing,
  focusMessageDiagnostic, newMessages, toLatest, children,
}: MessageListProps) {
  const { retryMessage, send, requestState, retryTarget, sending, pendingInHistory } = delivery
  const scroll = useRef<HTMLDivElement>(null)
  const renderVoice = useCallback((audio: MessageAudio, content: string) => (
    <VoiceBubble audio={audio} content={content} bridge={bridge} />
  ), [bridge])
  const renderImage = useCallback((id: string, sticker?: StickerAsset) => (
    <StoredImage key={sticker ? undefined : id} id={id} bridge={bridge} source={sticker ? stickerSource(sticker) : undefined} />
  ), [bridge])
  return (
    <div className="chat-thread-area">
      <div className="messages">
        {displayMessages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            avatar={avatar}
            entrance={index >= messages.length - 6 ? Math.max(0, index - Math.max(0, messages.length - 6)) : undefined}
            sticker={message.direction === 'user' ? stickers.messages[stickerMessageKey(selected, message.id)] : undefined}
            failureReason={messageFailures?.get(message.id)}
            onDiagnosticFocus={focusMessageDiagnostic}
            userName={userName}
            characterName={characterName}
            lastCharacterReplyTs={lastCharacterReplyTs}
            onRetry={retryMessage}
            retryDisabled={sending || busy || !healthy || message.direction !== 'user'}
            renderVoice={renderVoice}
            renderImage={renderImage}
          />
        ))}
        {streams.filter(row => !messages.some(m => m.id === row.id)).map(row => (
          <article className={`message character-reply stream-reply${avatar ? ' has-avatar' : ''}`} key={row.id}>
            {avatar && <img className="character-avatar chat-avatar" src={avatar} alt={`${characterName}的头像`} />}
            <div className="message-label">{characterName}</div>
            <div className="bubble">{row.content}<span className={row.status === 'streaming' ? 'stream-caret' : ''} /></div>
            <small>{row.status === 'streaming' ? '正在输入…' : '回复中断 · 可在原消息下重试'}</small>
          </article>
        ))}
        <TypingBubble
          requestState={requestState}
          typing={typing && !streams.some(row => row.status === 'streaming')}
          characterName={characterName}
        />
        <div ref={scroll} />
      </div>
      {newMessages > 0 && <button className="new-messages" onClick={toLatest}>有 {newMessages} 条新消息 · 回到最新</button>}
      {requestState === 'unknown' && !pendingInHistory && <p role="status">发送结果未知，请保留原内容安全重试。<button disabled={sending || busy || !healthy} onClick={() => void send(retryTarget ?? undefined)}>重试发送</button></p>}
      {requestState === 'failed' && !pendingInHistory && <div role="status"><MessageStatus message={{ direction: 'user', status: 'failed' }} disabled={sending || busy || !healthy} onRetry={() => void send(retryTarget ?? undefined)} /></div>}
      {children}
    </div>
  )
}
