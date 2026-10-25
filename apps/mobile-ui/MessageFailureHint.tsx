import React, { useEffect, useState } from 'react'
import { diagnosticsMessageFocus, type DiagnosticMessagesResult, type DiagnosticsMessageFocus, type NativeBridge } from '../../packages/contracts'
import { aggregateDiagnosticMessages, diagnosticReasonLabel } from './message-diagnostics'
import { characterIsTyping } from './typing-state'

/** Only actual model events can mark a narrative failure; receipts are unrelated. */
export function useMessageActivity(bridge: NativeBridge, healthy: boolean, cardId: string, deadlineMs: number) {
  const [now, setNow] = useState(Date.now)
  const [snapshot, setSnapshot] = useState<{ cardId: string; failures: Map<string, string>; events: DiagnosticMessagesResult['events']; readAt: number }>({ cardId: '', failures: new Map(), events: [], readAt: 0 })
  useEffect(() => {
    setSnapshot({ cardId: '', failures: new Map(), events: [], readAt: 0 })
    if (!healthy || !cardId) return
    let alive = true, running = false
    const read = async () => {
      setNow(Date.now())
      if (running) return
      running = true
      try {
        const result = (await bridge.rpc({ method: 'diagnostics.messages' })).data as DiagnosticMessagesResult
        const failures = new Map<string, string>()
        for (const message of aggregateDiagnosticMessages(result?.events ?? [])) if (message.modelFailure) failures.set(message.id, message.modelFailure.reason ?? 'unknown_error')
        if (alive) { setNow(Date.now()); setSnapshot({ cardId, failures, events: result?.events ?? [], readAt: Date.now() }) }
      } catch { if (alive) setSnapshot(previous => ({ ...previous, events: [] })) }
      finally { running = false }
    }
    void read(); const timer = setInterval(() => { if (!document.hidden) void read() }, 1000)
    return () => { alive = false; clearInterval(timer) }
  }, [bridge, healthy, cardId, deadlineMs])
  return healthy && snapshot.cardId === cardId ? { failures: snapshot.failures, typing: now - snapshot.readAt < 5000 && characterIsTyping(snapshot.events, now, deadlineMs) } : { failures: undefined, typing: false }
}
export function MessageFailureHint({ messageId, reason, focus }: { messageId: string; reason: string; focus: (message: DiagnosticsMessageFocus) => void }) {
  return <div className="message-failure-hint" role="status" onContextMenu={event => event.stopPropagation()}>
    <span>该消息模型调用失败 · {diagnosticReasonLabel(reason)} · </span><button type="button" onClick={() => focus(diagnosticsMessageFocus(messageId))}>查看诊断</button>
  </div>
}
