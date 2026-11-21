import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { refreshCoordinator, type Message, type NativeBridge } from '../../../packages/contracts'
import { appendHistory, historyCursor, historyPageSize, recentHistory } from '../history-state'
import { createReplyWatermarks } from '../message-state'
import { outbox } from '../outbox'

interface HistoryOptions {
  bridge: NativeBridge
  scopedBridge: NativeBridge
  selected: string
  selectedRef: MutableRefObject<string>
  profileRevision: MutableRefObject<number>
  onRows: (cardId: string, rows: Message[]) => void
  historyAppended: (previous: Message[], next: Message[]) => void
  preparePrepend: (id: string) => void
  setNotice: (text: string) => void
}

export function useChatHistory({
  bridge, scopedBridge, selected, selectedRef, profileRevision, onRows, historyAppended, preparePrepend, setNotice,
}: HistoryOptions) {
  const replyWatermarks = useRef(createReplyWatermarks())
  const lastCharacterReplyTs = replyWatermarks.current.get(selected)
  const [messages, setMessages] = useState<Message[]>([])
  const [historySearch, setHistorySearch] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const outgoing = useRef(outbox(localStorage))
  const [queue, setQueue] = useState<{ cardId: string; rows: Message[] }>({ cardId: selected, rows: [] })
  const readQueue = useCallback((cardId: string) => setQueue({ cardId, rows: outgoing.current.read(cardId) }), [])
  useEffect(() => { readQueue(selected) }, [selected, readQueue])
  const outgoingRows = queue.cardId === selected ? queue.rows : []
  const historyIds = new Set(messages.map(row => row.id))
  const displayMessages = [...messages, ...outgoingRows.filter(row => !historyIds.has(row.id))]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const callbacks = useRef({ onRows, historyAppended })
  useLayoutEffect(() => { callbacks.current = { onRows, historyAppended } }, [onRows, historyAppended])
  const historyReads = useMemo(() => refreshCoordinator(async () => {
    const cardId = selectedRef.current
    const recent = await recentHistory(messagesRef.current, async before => {
      const result = await bridge.rpc({
        method: 'messages.history',
        payload: { limit: historyPageSize, expectedCardId: cardId, ...(before ? { before } : {}) },
      })
      return result.data as Message[]
    })
    return { cardId, ...recent }
  }, ({ cardId, rows: value, replace, hasOlder: older }, revision) => {
    if (revision !== profileRevision.current || !cardId || cardId !== selectedRef.current) return
    replyWatermarks.current.observe(cardId, value)
    try {
      outgoing.current.remove(cardId, value.map(row => row.id))
      readQueue(cardId)
    } catch { /* Retain the durable queue when storage is temporarily unavailable. */ }
    callbacks.current.onRows(cardId, value)
    const previous = replace ? [] : messagesRef.current
    if (!previous.length) setHasOlder(older)
    const next = appendHistory(previous, value)
    callbacks.current.historyAppended(previous, next)
    messagesRef.current = next
    setMessages(next)
  }), [bridge, profileRevision, selectedRef, readQueue])
  const refreshHistory = useCallback((revision = profileRevision.current, changed = false) => historyReads(revision, changed), [historyReads, profileRevision])
  const loadOlder = async () => {
    if (loadingOlder || !messagesRef.current.length) return
    const revision = profileRevision.current, first = messagesRef.current[0]
    const current = () => revision === profileRevision.current && selected === selectedRef.current
    setLoadingOlder(true)
    try {
      const rows = (await scopedBridge.rpc({ method: 'messages.history', payload: { limit: historyPageSize, before: historyCursor(first) } })).data as Message[]
      if (!current()) return
      preparePrepend(first.id)
      const next = appendHistory(messagesRef.current, rows)
      messagesRef.current = next
      setMessages(next)
      setHasOlder(rows.length === historyPageSize)
    } catch (error) { if (current()) setNotice(error instanceof Error ? error.message : String(error)) }
    finally { if (current()) setLoadingOlder(false) }
  }

  const resetHistory = (historyReplaced = false) => {
    messagesRef.current = []
    setMessages([])
    setHistorySearch(false)
    setHasOlder(false)
    setLoadingOlder(false)
    if (historyReplaced) replyWatermarks.current.clear(selected)
  }
  const stageOutgoing = (cardId: string, row: Message) => {
    outgoing.current.put(cardId, row)
    setQueue({ cardId, rows: outgoing.current.read(cardId).map(item => item.id === row.id ? row : item) })
  }
  const acknowledgeOutgoing = (cardId: string, id: string) => outgoing.current.remove(cardId, [id])
  const failOutgoing = (cardId: string, id: string, status: 'failed' | 'unknown', revision: number) => {
    const stored = outgoing.current.read(cardId).find(row => row.id === id)
    if (stored) { try { outgoing.current.put(cardId, { ...stored, status }) } catch {} }
    if (revision === profileRevision.current) readQueue(cardId)
  }
  const hasAccepted = (id: string) => messagesRef.current.some(row => row.id === id && row.status === 'accepted')

  return {
    messages, displayMessages, lastCharacterReplyTs, hasOlder, loadingOlder, loadOlder, refreshHistory,
    historySearch, setHistorySearch, resetHistory, stageOutgoing, acknowledgeOutgoing, failOutgoing, hasAccepted,
    hasMessages: () => !!messagesRef.current.length, clearMessages: () => { messagesRef.current = []; setMessages([]) },
  }
}
