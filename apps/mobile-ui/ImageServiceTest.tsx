import React, { useState } from 'react'
import type { MediaJob, NativeBridge } from '../../packages/contracts'
import { FreeImageRecovery } from './FreeImageRecovery'
import { StoredImage } from './StoredImage'
import { mediaJobSummary } from './media-job-state'
import { operationId } from './operation-id'

export function ImageServiceTest({ bridge, save, jobs, refresh, healthy, enabled, diagnose, cardId }: { bridge: NativeBridge; save: () => Promise<void>; jobs: MediaJob[]; refresh: () => Promise<void>; healthy: boolean; enabled: boolean; diagnose: (id: string) => void; cardId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const latest = jobs.filter(job => job.kind === 'image' && job.purpose === 'preview').at(-1)
  const pending = jobs.some(job => job.kind === 'image' && ['queued', 'running', 'submitted'].includes(job.status))
  const test = async () => {
    setBusy(true); setError('')
    try {
      await save()
      const operation = operationId(sessionStorage, `hds-image-test-operation-${cardId}`, { kind: 'image', purpose: 'preview' })
      await bridge.rpc({ method: 'media.create', payload: { id: operation.id, kind: 'image', purpose: 'preview', prompt: '一只白色陶瓷杯放在木桌上，柔和的日光，简洁背景，无文字。' } })
      operation.done(); await refresh()
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="image-service-test"><h3>先试一张</h3><p className="caption">保存当前设置并生成一张测试图，验证请求、生成和图片读取。会调用所选生图服务，可能计费；测试图只显示在这里。</p>
    <button disabled={!healthy || !enabled || busy || pending || latest?.status === 'unknown'} onClick={() => void test()}>{busy ? '正在提交测试…' : '保存并测试生图'}</button>
    {!healthy && <p className="caption">唤醒当前故事后即可测试。</p>}
    {latest && <div className="image-test-result"><p role="status">{mediaJobSummary(latest)}</p>{latest.imageId && <StoredImage id={latest.imageId} bridge={bridge} />}{latest.error && <p className="caption">{latest.error}</p>}<button onClick={() => diagnose(latest.id)}>查看测试诊断</button><FreeImageRecovery job={latest} bridge={bridge} disabled={!healthy || busy} refresh={refresh} /></div>}
    {error && <p role="alert">{error}</p>}
  </div>
}
