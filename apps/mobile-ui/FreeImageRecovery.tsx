import React, { useState } from 'react'
import type { MediaJob, NativeBridge } from '../../packages/contracts'

export function FreeImageRecovery({ job, bridge, disabled, refresh }: { job: MediaJob; bridge: NativeBridge; disabled?: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState('')
  if (job.provider !== 'imagefree' || job.status !== 'failed' || job.retryMode !== 'generate') return null
  const finish = async (dataUri: string) => {
    setPending(dataUri)
    await bridge.rpc({ method: 'media.completeFree', payload: { id: job.id, dataUri } })
    setPending(''); await refresh()
  }
  const recover = async (gallery: boolean) => {
    setBusy(true); setError('')
    try {
      const input = (await bridge.rpc({ method: 'media.freeInput', payload: { id: job.id } })).data as { prompt?: string; completed?: boolean }
      if (input.completed) { await refresh(); return }
      if (pending) { await finish(pending); return }
      if (gallery) {
        const result = await bridge.pickImage({ limit: 1, source: 'gallery' })
        if (!result.cancelled) { const image = result.images?.[0]?.dataUri || result.dataUri; if (!image) throw new Error('没有读到图片，请重新选择'); await finish(image) }
      } else {
        if (!bridge.openFreeImage) throw new Error('请升级应用以打开免费生图页面，或从相册选择已下载的图片')
        const result = await bridge.openFreeImage({ prompt: input.prompt || job.prompt || '' })
        if (!result.cancelled && result.dataUri) await finish(result.dataUri)
      }
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="free-image-recovery"><p className="caption">免费站点可能要求网页验证。打开页面后完成验证、生成并点击下载，图片会自动接回这个任务；也可选择已下载的图片。</p><div className="actions">
    <button disabled={disabled || busy} onClick={() => void recover(false)}>{busy ? '等待免费图片…' : pending ? '继续保存图片' : '打开免费生图'}</button>
    {!pending && <button disabled={disabled || busy} onClick={() => void recover(true)}>使用已下载图片</button>}
  </div>{error && <p role="alert">{error}</p>}</div>
}
