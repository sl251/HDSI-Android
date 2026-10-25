import React, { useEffect, useRef, useState } from 'react'
import type { Message, NativeBridge } from '../../packages/contracts'
import { StoredImage } from './StoredImage'
import { historyCursor, historyPageSize } from './history-state'

export function HistorySearch({ bridge, close, background }: { bridge: NativeBridge; close: () => void; background: React.RefObject<HTMLDivElement> }) {
  const [query, setQuery] = useState(''), [date, setDate] = useState('')
  const [rows, setRows] = useState<Message[]>([]), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const revision = useRef(0), input = useRef<HTMLInputElement>(null)
  const criteria = useRef({ query: '', until: undefined as string | undefined })
  useEffect(() => {
    const previous = document.activeElement, shell = background.current
    if (shell) shell.inert = true
    input.current?.focus()
    return () => { revision.current++; if (shell) shell.inert = false; if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [background])
  const search = async (older = false) => {
    const current = ++revision.current
    setBusy(true); setError('')
    try {
      if (!older) {
        const until = date ? new Date(`${date}T00:00:00`) : undefined
        if (until) until.setDate(until.getDate() + 1)
        criteria.current = { query: query.trim(), until: until?.toISOString() }
      }
      const result = (await bridge.rpc({ method: 'messages.history', payload: { ...criteria.current, limit: historyPageSize, ...(older && rows[0] ? { before: historyCursor(rows[0]) } : {}) } })).data as Message[]
      if (revision.current !== current) return
      setRows(previous => older ? [...result, ...previous] : result); setMore(result.length === historyPageSize); setSearched(true)
    } catch (failure) { if (revision.current === current) setError(failure instanceof Error ? failure.message : '历史读取失败') }
    finally { if (revision.current === current) setBusy(false) }
  }
  return <div className="modal-backdrop"><section className="modal history-search" role="dialog" aria-modal="true" aria-label="查找聊天记录" onKeyDown={event => {
    if (event.key === 'Escape') close()
    if (event.key === 'Tab') {
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      const first = targets[0], last = targets.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <div className="section-title"><h2>往日的对话</h2><button className="text-button" onClick={close}>关闭</button></div>
    <p className="caption">搜索当前角色的全部聊天，或定位到某一天及之前。</p>
    <form onSubmit={event => { event.preventDefault(); void search() }}>
      <label>关键词<input ref={input} disabled={busy} type="search" maxLength={128} value={query} onChange={event => setQuery(event.target.value)} placeholder="一句话、一个名字、一段回忆…" /></label>
      <label>日期<input disabled={busy} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button className="primary" disabled={busy}>查找记录</button>
    </form>
    <p role="status" className="caption">{error || (busy ? '正在读取…' : searched ? `已找到 ${rows.length} 条${more ? '，可继续加载' : ''}` : '')}</p>
    <div className="history-results">{[...rows].reverse().map(row => <article key={row.id}><small>{row.direction === 'user' ? '我' : '角色'} · {new Date(row.occurredAt).toLocaleString()}</small><p>{row.content || (row.audio ? '[语音]' : '[图片]')}</p>{row.images?.map(id => <StoredImage key={id} id={id} bridge={bridge} />)}</article>)}</div>
    {more && <button className="secondary wide" disabled={busy} onClick={() => void search(true)}>继续查找更早记录</button>}
  </section></div>
}
