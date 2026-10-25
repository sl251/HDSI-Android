import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DiagnosticMessageEvent, DiagnosticMessagesResult, Message, NativeBridge } from '../../packages/contracts'
import { EventDetail, DiagnosticMessageCard } from './DiagnosticMessageCard'
import { aggregateDiagnosticMessages, diagnosticsEmptyText, visibleDiagnosticMessages, type DiagnosticView } from './message-diagnostics'
import './message-diagnostics.css'

export function MessageDiagnostics({ bridge, healthy, messageId, messages = [], close }: { bridge: NativeBridge; healthy: boolean; messageId: string; messages?: Message[]; close: () => void }) {
  const [events, setEvents] = useState<DiagnosticMessageEvent[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [scope, setScope] = useState(messageId), [view, setView] = useState<DiagnosticView>('all')
  const [confirmClear, setConfirmClear] = useState(false), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const closeButton = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement>(null)
  const located = useRef('')
  useEffect(() => { setScope(messageId); setView('all'); located.current = '' }, [messageId])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; closeButton.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [close])
  useEffect(() => {
    let alive = true, running = false
    if (!healthy) { setLoading(false); return }
    const read = async () => {
      if (running) return
      running = true
      try {
        const result = (await bridge.rpc({ method: 'diagnostics.messages', payload: scope ? { messageId: scope } : {} })).data as DiagnosticMessagesResult
        if (alive) { setEvents(result?.events ?? []); setError(result?.storageAvailable === false ? '诊断暂未写入磁盘，当前显示内存记录。' : '') }
      } catch { if (alive) setError('无法读取记录，请确认当前故事核心正在运行。') }
      finally { running = false; if (alive) setLoading(false) }
    }
    setLoading(true); setEvents([]); void read()
    const timer = setInterval(() => { if (!document.hidden) void read() }, 3000)
    return () => { alive = false; clearInterval(timer) }
  }, [bridge, healthy, scope, revision])
  const background = events.filter(event => !event.requestIds.length && ['embedding', 'rerank'].includes(event.stage) && (view !== 'failed' || event.outcome === 'fallback'))
  const grouped = useMemo(() => aggregateDiagnosticMessages(events.filter(event => event.requestIds.length || !['embedding', 'rerank'].includes(event.stage)), messages), [events, messages])
  const scoped = useMemo(() => grouped.filter(message => !scope || message.aliases.includes(scope)), [grouped, scope])
  const visible = useMemo(() => visibleDiagnosticMessages(scoped, view, messageId), [scoped, view, messageId])
  useLayoutEffect(() => {
    if (!messageId || loading || located.current === messageId) return
    const target = visible.find(message => message.aliases.includes(messageId))
    const element = [...(dialog.current?.querySelectorAll<HTMLElement>('[data-diagnostic-message]') ?? [])].find(element => element.dataset.diagnosticMessage === target?.id)
    if (element) { element.scrollIntoView({ block: 'start' }); element.focus({ preventScroll: true }); located.current = messageId }
  }, [visible, loading, messageId])
  const exportEvents = async () => {
    setBusy(true)
    try { await bridge.saveMessageDiagnostics(scope ? { messageId: scope } : {}) }
    catch { setError('诊断导出失败，请重新尝试。') } finally { setBusy(false) }
  }
  const ids = [...new Set([scope, ...grouped.flatMap(message => message.aliases)])].filter(Boolean)
  const filteredCount = scoped.filter(message => view !== 'failed' || message.failure || message.events.some(event => event.outcome === 'fallback')).length
  return <div className="modal-backdrop"><section ref={dialog} className="modal message-diagnostics" role="dialog" aria-modal="true" aria-label="消息诊断" onKeyDown={event => {
    if (event.key !== 'Tab') return
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')]
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus() }
  }}>
    <div className="section-title"><h2>消息诊断</h2><button ref={closeButton} onClick={close} aria-label="关闭消息诊断">×</button></div>
    <p className="caption">诊断记录保留 7 天，最多 2000 个事件、1 MiB，仅保存在本机。消息预览取自当前聊天，不写入诊断文件；诊断不保存正文、人设、密钥或音频，也不额外调用模型。</p>
    <p className="caption">红色表示失败，可先看“怎么办”。生图会单独记录请求、查询、下载、保存和投递的失败原因；头像与动态生图也会显示。不回复、稍后回复和跳过媒体都可能是正常结果；未记录的步骤不代表成功。</p>
    {!healthy && <p role="status">先唤醒当前故事，再查看诊断。</p>}
    <div className="diagnostic-filters" role="group" aria-label="诊断筛选">{([['all', '全部'], ['failed', '失败'], ['latest', '最新']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
    <label>查看范围<select value={scope} onChange={event => setScope(event.target.value)}><option value="">全部记录</option>{ids.map(id => <option value={id} key={id}>{events.some(event => event.mediaJobId === id) ? `生图 ${id.slice(-12)}` : `消息 ${id.slice(0, 8)}`}</option>)}</select></label>
    <div className="actions"><button disabled={!healthy || busy || !events.length} onClick={() => void exportEvents()}>导出脱敏记录</button><button disabled={!healthy || busy} onClick={() => setConfirmClear(true)}>清空本故事记录</button></div>
    {confirmClear && <div role="alert"><p>清空诊断不会删除聊天。后续新回合仍会产生诊断记录。</p><button disabled={busy} onClick={() => { setBusy(true); void bridge.rpc({ method: 'diagnostics.clear' }).then(() => { setEvents([]); setRevision(value => value + 1); setConfirmClear(false) }).catch(() => setError('清空失败，请重试。')).finally(() => setBusy(false)) }}>确认清空</button><button disabled={busy} onClick={() => setConfirmClear(false)}>取消</button></div>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">读取中…</p> : healthy && !error && !visible.length && !background.length && <p className="quiet-empty">{diagnosticsEmptyText(scope, view)}</p>}
    {messageId && !loading && !scoped.some(message => message.aliases.includes(messageId)) && !scope && <p role="status">这条消息暂无保留的诊断记录。</p>}
    {!scope && background.length > 0 && <details open={view === 'failed' ? true : undefined}><summary>后台检索增强 · {background.length} 条</summary><ol>{background.map(event => <EventDetail key={event.id} event={event} />)}</ol></details>}
    <ol className="diagnostic-messages" aria-label="按消息聚合的诊断">{visible.map(message => <DiagnosticMessageCard key={message.id} message={message} focused={message.aliases.includes(messageId)} />)}</ol>
    {view === 'latest' && <p className="caption">最新显示最近 20 条消息；可切换“全部”查看更多。</p>}
    {filteredCount > 200 && view !== 'latest' && <p className="caption">最多显示 200 条消息。可用“查看范围”定位更早的消息。</p>}
  </section></div>
}
