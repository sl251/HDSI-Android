import React, { useState } from 'react'
import type { MediaJob, NativeBridge } from '../../packages/contracts'
import { FreeImageRecovery } from './FreeImageRecovery'
import { mediaJobSummary, mediaRetryLabel } from './media-job-state'

export function MediaJobNotice({ jobs, bridge, healthy, refresh, diagnose }: { jobs: MediaJob[]; bridge: NativeBridge; healthy: boolean; refresh: () => Promise<void>; diagnose: (id: string) => void }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('')
  const pending = jobs.filter(job => job.kind === 'image' && !job.delivered && job.status !== 'cancelled')
  const latest = pending.at(-1)
  if (!latest) return null
  const retry = async (job: MediaJob) => {
    setBusy(job.id); setError('')
    try { await bridge.rpc({ method: 'media.retry', payload: { id: job.id } }); await refresh() }
    catch (e) { setError(String(e)) } finally { setBusy('') }
  }
  return <aside className="media-job-notice" aria-label="图片任务">
    <div className="media-job-heading"><span role="status">{mediaJobSummary(latest)}{pending.length > 1 && ` · ${pending.length} 个任务`}</span><button onClick={() => diagnose(latest.id)}>查看生图诊断</button></div>
    <details><summary>查看进度与处理方法</summary>{pending.slice(-5).reverse().map(job => <div className="media-job-row" key={job.id}>
      <b>{({ feed: '动态配图', chat: '聊天配图', avatar: '角色头像', preview: '生图测试' } as Record<string, string>)[job.purpose]} · {mediaJobSummary(job)}</b>
      {job.error && <p>{job.error}</p>}
      <div className="actions"><button onClick={() => diagnose(job.id)}>诊断详情</button>{mediaRetryLabel(job) && <button disabled={!healthy || !!busy} onClick={() => void retry(job)}>{busy === job.id ? '处理中…' : mediaRetryLabel(job)}</button>}</div>
      <FreeImageRecovery job={job} bridge={bridge} disabled={!healthy || !!busy} refresh={refresh} />
    </div>)}</details>{error && <p role="alert">{error}</p>}
  </aside>
}
