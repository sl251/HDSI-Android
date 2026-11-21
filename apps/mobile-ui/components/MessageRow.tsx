import React from 'react'
import { messageImages, type DiagnosticsMessageFocus, type Message } from '../../../packages/contracts'
import { messageAudio, type MessageAudio } from '../../../packages/contracts/voice'
import { MessageContent } from '../MessageContent'
import { MessageFailureHint } from '../MessageFailureHint'
import { MessageStatus } from '../MessageStatus'
import type { StickerAsset } from '../sticker-state'

export interface MessageRowProps {
  sticker?: StickerAsset
  avatar?: string
  entrance?: number
  message: Message
  userName: string
  characterName: string
  lastCharacterReplyTs: number
  onRetry: (message: Message) => void
  retryDisabled: boolean
  failureReason?: string
  onDiagnosticFocus: (message: DiagnosticsMessageFocus) => void
  renderVoice: (audio: MessageAudio, content: string) => React.ReactNode
  renderImage: (id: string, sticker?: StickerAsset) => React.ReactNode
}

export const MessageRow = React.memo(function MessageRow({
  message, userName, characterName, lastCharacterReplyTs, onRetry, retryDisabled,
  sticker, entrance, failureReason, onDiagnosticFocus, avatar, renderVoice, renderImage,
}: MessageRowProps) {
  const opening = message.status === 'card-opening'
  const images = messageImages(message.images)
  const audio = messageAudio(message.audio)
  const characterSticker = message.direction === 'character' && !message.content.trim() && images.length > 0
  const isSticker = !!sticker || characterSticker
  const directionClass = message.direction === 'character'
    ? `character-reply${avatar ? ' has-avatar' : ''}`
    : message.direction
  const rowClass = `message${isSticker ? ' sticker-message' : ''}${entrance === undefined ? '' : ' message-enter'} ${directionClass}`

  return (
    <article
      data-read-anchor={`message-${message.id}`}
      style={entrance === undefined ? undefined : { '--i': entrance } as React.CSSProperties}
      className={rowClass}
    >
      {message.direction === 'character' && avatar && (
        <img className="character-avatar chat-avatar" src={avatar} alt={`${characterName}的头像`} />
      )}
      {opening && <MessageStatus message={message} />}
      <div className="message-label">
        {message.direction === 'user' ? userName : characterName}
        <time>{new Date(message.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      <div className={isSticker ? 'sticker-body' : 'bubble'}>
        {!isSticker && (audio
          ? renderVoice(audio, message.content)
          : message.direction === 'character' ? <MessageContent message={message} /> : message.content)}
        {sticker ? renderImage(images[0], sticker) : images.map(id => renderImage(id))}
      </div>
      {message.replyState === 'failed' && message.direction === 'user' && (
        <button className="message-retry" disabled={retryDisabled} onClick={() => onRetry(message)}>
          回复失败 · 重试回复
        </button>
      )}
      {message.status === 'unknown' && (
        <button className="message-retry" disabled={retryDisabled} onClick={() => onRetry(message)}>
          发送结果待确认 · 安全重试
        </button>
      )}
      {!opening && (
        <MessageStatus
          message={message}
          lastCharacterReplyTs={lastCharacterReplyTs}
          onRetry={() => onRetry(message)}
          disabled={retryDisabled}
        />
      )}
      {message.direction === 'user' && failureReason && (
        <MessageFailureHint messageId={message.id} reason={failureReason} focus={onDiagnosticFocus} />
      )}
    </article>
  )
})
