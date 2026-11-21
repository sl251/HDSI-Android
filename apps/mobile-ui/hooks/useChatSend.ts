import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { localRequestFailure, messageImages, type Message, type ModelSettings, type NativeBridge, type RuntimeStatus } from '../../../packages/contracts'
import { messageAudio } from '../../../packages/contracts/voice'
import { stickerMessageKey, useSticker, type StickerAsset } from '../sticker-state'
import type { useChatHistory } from './useChatHistory'
import type { useChatComposer } from './useChatComposer'
import type { useChatMedia } from './useChatMedia'
import { checkVision } from './useChatImages'

interface SendOptions {
  bridge: NativeBridge
  scopedBridge: NativeBridge
  selectedRef: MutableRefObject<string>
  profileRevision: MutableRefObject<number>
  runtimeRef: MutableRefObject<RuntimeStatus | null>
  settingsRef: MutableRefObject<ModelSettings>
  healthy: boolean
  busy: boolean
  composer: ReturnType<typeof useChatComposer>
  history: ReturnType<typeof useChatHistory>
  media: ReturnType<typeof useChatMedia>
  refreshExperience: () => Promise<void>
  followNextMessage: () => void
  persistSettings: () => Promise<void>
  setNotice: (text: string) => void
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useChatSend({
  bridge, scopedBridge, selectedRef, profileRevision, runtimeRef, settingsRef, healthy, busy, history,
  composer: { draft, draftAudio, attachments, getDraft, updateDraft }, media: { stickersRef, saveStickers, setStickerDrawer },
  persistSettings, setNotice, refreshExperience, followNextMessage,
}: SendOptions) {
  const sendLock = useRef(false)
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'failed' | 'unknown' | 'accepted'>('idle')
  const [retryTarget, setRetryTarget] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const pending = useRef<{ requestId: string; content: string; images?: string[]; audio?: Message['audio'] } | null>(null)
  const sendRef = useRef<(message?: Message) => Promise<void>>(async () => {})
  const retryMessage = useCallback((message: Message) => { void sendRef.current(message) }, [])
  const pendingInHistory = history.displayMessages.some(row => row.id === pending.current?.requestId && ['failed', 'unknown'].includes(row.status || ''))

  const reconcileHistory = (cardId: string, value: Message[]) => {
    const request = pending.current
    if (!request || !value.some(row => row.id === request.requestId && row.status === 'accepted')) return
    pending.current = null
    setRetryTarget(null)
    setRequestState('accepted')
    const draft = getDraft(cardId)
    if (!stickersRef.current.messages[stickerMessageKey(cardId, request.requestId)] &&
        draft.content.trim() === request.content &&
        JSON.stringify(draft.attachments.map(image => image.id)) === JSON.stringify(request.images ?? [])) {
      updateDraft({ content: '', attachments: [], audio: undefined }, cardId)
    }
  }
  const resetSend = () => { pending.current = null; setRetryTarget(null); setRequestState('idle') }
  const send = async (retry?: Message, sticker?: { packId: string; asset: StickerAsset }) => {
    if (retry?.replyState === 'failed') {
      if (sendLock.current || busy || !healthy) return
      sendLock.current = true; setSending(true)
      try {
        await scopedBridge.rpc({ method: 'turn.retry', payload: { messageId: retry.id } })
        await history.refreshHistory()
        await refreshExperience()
      } catch (error) { setNotice(errorText(error)) }
      finally { sendLock.current = false; setSending(false) }
      return
    }
    const content = sticker ? '' : retry ? retry.content : draft.trim() || (draftAudio ? '[语音消息]' : '')
    const audio = sticker ? undefined : retry ? messageAudio(retry.audio) : draftAudio
    const imageIds = sticker ? [] : retry ? messageImages(retry.images) : attachments.map(image => image.id)
    if ((!sticker && !content && !imageIds.length) || sendLock.current || busy || !healthy) return
    const submittingDraft = !sticker && (!retry || (pending.current?.requestId === retry.id && !retryTarget))
    sendLock.current = true
    const previous = pending.current
    const sameDraft = previous && !sticker && previous.audio?.audioId === audio?.audioId &&
      previous.content === content && JSON.stringify(previous.images || []) === JSON.stringify(imageIds)
    const request = !retry && sameDraft ? previous : { requestId: retry?.id ?? crypto.randomUUID(), content, images: imageIds, audio }
    if (sticker) pending.current = null
    else { pending.current = request; setRetryTarget(retry ?? null) }
    setSending(true); setRequestState('sending'); setNotice(''); setStickerDrawer(false)
    const revision = profileRevision.current
    const cardId = selectedRef.current
    try {
      if (imageIds.length || sticker) {
        await persistSettings()
        const version = JSON.stringify(settingsRef.current)
        await checkVision(bridge, settingsRef.current)
        if (revision !== profileRevision.current || runtimeRef.current?.state !== 'healthy' || version !== JSON.stringify(settingsRef.current)) throw new Error('设置或运行状态已更改，请检查后重试')
      }
      if (sticker) {
        const image = await bridge.stickerImage({ id: sticker.asset.id })
        const upload = await bridge.rpc({ method: 'images.upload', payload: { dataUri: image.dataUri } })
        if (revision !== profileRevision.current) return
        request.images = [(upload.data as { id: string }).id]
        const library = useSticker(stickersRef.current, sticker.packId, sticker.asset.id)
        saveStickers({ ...library, messages: { ...library.messages, [stickerMessageKey(cardId, request.requestId)]: sticker.asset } })
      }
      pending.current = request
      setRetryTarget(sticker ? { id: request.requestId, content: '', images: request.images, direction: 'user', occurredAt: new Date().toISOString(), status: 'failed' } : retry ?? null)
      const localRow: Message = { id: request.requestId, content, images: request.images, audio, direction: 'user', occurredAt: retry?.occurredAt ?? new Date().toISOString(), status: 'sending' }
      history.stageOutgoing(cardId, localRow)
      await scopedBridge.rpc({ method: 'messages.sendLocal', payload: request })
      history.acknowledgeOutgoing(cardId, request.requestId)
      // A notification may select another card while the RPC is in flight.
      // Clear the acknowledged card's matching draft before the UI revision guard.
      const sentDraft = getDraft(cardId)
      if (submittingDraft &&
          (sentDraft.content.trim() === content || (!sentDraft.content.trim() && sentDraft.audio?.audioId === audio?.audioId)) &&
          JSON.stringify(sentDraft.attachments.map(image => image.id)) === JSON.stringify(imageIds)) {
        updateDraft({ content: '', attachments: [], audio: undefined }, cardId)
      }
      if (revision !== profileRevision.current) return
      followNextMessage(); setRequestState('accepted')
      pending.current = null
      setRetryTarget(null)
      await history.refreshHistory(revision, true)
    } catch (error) {
      history.failOutgoing(cardId, request.requestId, localRequestFailure(error), revision)
      if (revision === profileRevision.current) {
        if (history.hasAccepted(request.requestId)) { setRequestState('accepted'); setRetryTarget(null); setNotice('') }
        else if (sticker && !pending.current) { setRequestState('idle'); setNotice(`${errorText(error)}；请重新点击表情发送。`) }
        else { setRequestState(localRequestFailure(error)); setNotice(`${errorText(error)}；草稿已保留，可以重试。`) }
      }
    } finally { sendLock.current = false; setSending(false) }
  }
  useLayoutEffect(() => { sendRef.current = send })
  return { send, retryMessage, requestState, retryTarget, sending, pendingInHistory, reconcileHistory, resetSend }
}
