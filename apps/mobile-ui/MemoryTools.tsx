import React, { useEffect, useState } from 'react'
import type { NativeBridge, SchedulingStatus } from '../../packages/contracts'

export type Fact = { id: number; content: string; scope?: string; importance?: number; confidence?: number; sourceEntryIds?: number[] }
type Props = { bridge: NativeBridge; facts: Fact[]; intents: { id: number; summary: string; notBefore?: string; type?: string; payload?: { kind?: string } }[]; schedulingStatus?: SchedulingStatus[]; paused?: boolean; overlay: Record<string, unknown>; cardId: string; busy: boolean; act: (task: () => Promise<unknown>, success?: string) => Promise<void>; refresh: () => Promise<void> }
type Job = { status: 'running' | 'done' | 'failed'; result?: unknown; error?: string }
export function MemoryTools({ bridge, facts, intents, schedulingStatus = [], paused, overlay, cardId, busy, act, refresh }: Props) {
  const key = `hds-maintenance-${cardId}`
  const [jobId, setJobId] = useState(() => localStorage.getItem(key) || '')
  const [jobText, setJobText] = useState(''), [adding, setAdding] = useState(false), [target, setTarget] = useState<Fact | null>(null)
  const [content, setContent] = useState(''), [scope, setScope] = useState('event'), [sources, setSources] = useState<{ content: string; occurredAt: string }[] | null>(null)
  const [sourceFact, setSourceFact] = useState<Fact | null>(null)
  const [operation, setOperation] = useState<{ kind: string; title: string; description: string; payload: Record<string, unknown> } | null>(null)
  const [overlayTarget, setOverlayTarget] = useState('all')
  const evolution = Object.entries(overlay).flatMap(([key, value]) => {
    const text = typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.filter(item => typeof item === 'string').join('、') : ''
    const titles: Record<string, string> = { characterProfile: '角色性格', characterTraits: '性格细节', perspective: '看待世界的方式', relationship: '关系变化', world: '世界变化' }
    return text ? [{ key, title: titles[key] || '成长记录', text }] : []
  })
  const start = async (kind: string, payload: Record<string, unknown> = {}) => {
    const requestId = crypto.randomUUID()
    // Persist before RPC: a timeout does not prove that the job never started.
    localStorage.setItem(key, requestId); setJobId(requestId); setJobText('正在提交维护任务…')
    await bridge.rpc({ method: 'maintenance.start', payload: { requestId, kind, ...payload } })
    setAdding(false); setTarget(null); setContent(''); setOperation(null)
  }
  useEffect(() => {
    if (!jobId) return
    let cancelled = false, polling = false
    const poll = async () => {
      if (polling) return; polling = true
      try {
        const result = await bridge.rpc({ method: 'maintenance.status', payload: { requestId: jobId } }); if (cancelled) return
        const job = result.data as Job
        if (job.status === 'running') setJobText('正在整理或修正记忆，请稍候…')
        else { localStorage.removeItem(key); setJobId(''); setJobText(job.status === 'failed' ? job.error || '维护失败' : job.result === false ? '当前没有可整理内容，或故事已暂停' : '记忆维护已完成'); await refresh() }
      } catch (error) { if (!cancelled) setJobText(`${String(error)}；任务编号已保留，可稍后查询`) } finally { polling = false }
    }
    void poll(); const timer = setInterval(() => { if (!document.hidden) void poll() }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [jobId, cardId])
  return <>
    <div className="memory-actions"><button className="secondary" disabled={busy || !!jobId} onClick={() => setAdding(true)}>补充事实</button><button className="secondary" disabled={busy || !!jobId} onClick={() => act(() => start('compact'))}>立即整理记忆</button></div>
    <p className="caption">整理会调用模型，可能产生费用；显示最近 100 条事实与重要记忆。</p>{jobText && <p className="notice" role="status">{jobText}{jobId && <button onClick={() => { if (window.confirm('停止查询不会取消服务器任务。确认清除本机查询记录？')) { localStorage.removeItem(key); setJobId('') } }}>停止查询</button>}</p>}
    <details className="memory-drawer"><summary>约定与待办 · {intents.length}</summary><p className="caption">尚未执行的计划与延迟消息。最多显示100项。已送出的消息无法撤回；定时联系需要核心和通知服务存活，暂停、后台预算耗尽或系统强制停止均可能阻止按时发送。</p>{paused && <p role="status">故事已暂停，待办保留，恢复前不会投递。</p>}{schedulingStatus.map((status, index) => <p role="status" key={`${status.requestId}-${index}`}>{status.outcome === 'registered' ? '已登记（登记记录不代表实际送达）' : '未登记'}：{{ 'ambiguous-time': '时间不明确，请重新指定', 'invalid-plan-time': '计划时间无效或超出范围，请重新指定', 'pending-limit': '待办已满', 'duplicate-plan': '同一事项已有待办或重复计划', 'streamed-unregistered': '确认已显示但计划无效，请重新指定', registered: '约定已写入待办' }[status.reasonCode] || '请查看运行状态与日志'}</p>)}{intents.map(intent => <article key={intent.id}><small>{intent.payload?.kind || intent.type || '计划'}</small><p>{intent.summary}</p>{intent.notBefore && <small>{new Date(intent.notBefore).toLocaleString('zh-CN')}</small>}<button className="text-button danger" disabled={busy || !!jobId} onClick={() => setOperation({ kind: 'intent-cancel', title: '取消这项待办？', description: intent.summary, payload: { id: intent.id } })}>取消待办</button></article>)}{!intents.length && <p className="caption">当前没有待执行的约定；可查看上方登记状态，或重新明确联系时间。</p>}</details>
    <details className="memory-drawer"><summary>人设与关系的演化</summary><p className="caption">经历积累后，角色的想法和关系会发生变化。清理演化只撤掉这些变化，原始人设、对话与记忆保留。</p>{evolution.map(item => <div key={item.key}><b>{item.title}</b><p className="preview-text">{item.text}</p></div>)}{!evolution.length && <p className="caption">尚未形成稳定的人设变化。</p>}<label>清理范围<select value={overlayTarget} onChange={event => setOverlayTarget(event.target.value)}><option value="all">全部人设演化</option><option value="character">角色性格</option><option value="perspective">看待世界的方式</option><option value="relationship">关系变化</option><option value="world">世界设定变化</option></select></label><button className="secondary danger" disabled={busy || !!jobId} onClick={() => setOperation({ kind: 'overlay-clear', title: '清理所选的人设演化？', description: '所选范围内的演化提案与演化记录将被清理，恢复以原始设定为准。聊天、长期事实和普通记忆仍然保留。', payload: { target: overlayTarget } })}>清理人设演化</button></details>
    <div className="timeline">{facts.map(fact => <article key={fact.id} data-read-anchor={`fact-${fact.id}`}><span className="eyebrow">长期事实 #{fact.id} · {{ character: '人物', world: '世界', relationship: '关系', event: '事件', promise: '承诺' }[fact.scope || 'event'] || '事实'}</span><p>{fact.content}</p><div className="fact-meta">{typeof fact.confidence === 'number' && <span>置信度 {Math.round(fact.confidence * 100)}%</span>}<button className="text-button" disabled={busy} onClick={() => act(async () => { const result = await bridge.rpc({ method: 'memory.factSources', payload: { id: fact.id } }); setSourceFact(fact); setSources(result.data as typeof sources) })}>查看来源</button><button className="text-button danger" disabled={busy || !!jobId} onClick={() => setTarget(fact)}>停用事实</button></div></article>)}</div>
    {adding && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="补充长期事实"><h2>补充长期事实</h2><label>事实类型<select value={scope} onChange={event => setScope(event.target.value)}><option value="event">事件</option><option value="character">人物</option><option value="world">世界</option><option value="relationship">关系</option><option value="promise">承诺</option></select></label><label>事实内容<textarea rows={4} value={content} maxLength={4000} onChange={event => setContent(event.target.value)} placeholder="写出具体人物和事实，避免只使用‘他’‘你’" /></label><div className="actions"><button onClick={() => setAdding(false)}>取消</button><button className="primary" disabled={busy || !content.trim()} onClick={() => act(() => start('fact-add', { scope, content }))}>保存事实</button></div></section></div>}
    {target && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="停用事实确认"><h2>停用事实 #{target.id}？</h2><p>{target.content}</p><p className="caption">这条事实将不再作为有效事实读取，记录保留供审计。原始聊天和摘要仍保留，角色可能从经历中再次想起此事。</p><div className="actions"><button onClick={() => setTarget(null)}>取消</button><button className="primary" disabled={busy} onClick={() => act(() => start('fact-forget', { id: target.id }))}>确认停用</button></div></section></div>}
    {sources && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="事实来源"><h2>事实 #{sourceFact?.id} 的来源</h2>{sources.map((entry, index) => <article key={index}><time>{new Date(entry.occurredAt).toLocaleString('zh-CN')}</time><p className="preview-text">{entry.content}</p></article>)}{!sources.length && <p>这条事实来自初始设定、人工补充，或没有保留可用来源。</p>}<button className="secondary" onClick={() => setSources(null)}>关闭来源</button></section></div>}
    {operation && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="记忆操作确认"><h2>{operation.title}</h2><p>{operation.description}</p><div className="actions"><button disabled={busy} onClick={() => setOperation(null)}>取消</button><button className="primary" disabled={busy} onClick={() => act(() => start(operation.kind, { ...operation.payload, confirm: true }))}>确认操作</button></div></section></div>}
  </>
}
