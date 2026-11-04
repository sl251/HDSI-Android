import React, { useEffect, useRef, useState } from 'react'
import type { NativeBridge } from '../../packages/contracts'
import { ImageLightbox } from './ImageLightbox'

export function StoredImage({ id, bridge, source }: { id: string; bridge: NativeBridge; source?: string }) {
  const element = useRef<HTMLButtonElement>(null)
  const [data, setData] = useState(''), [error, setError] = useState(''), [open, setOpen] = useState(false), [sourceFailed, setSourceFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { setSourceFailed(false); setOpen(false) }, [id, source])
  const display = source && !sourceFailed ? source : data
  useEffect(() => {
    let cancelled = false
    setData(''); setError('')
    if (source && !sourceFailed) return
    const observer = new IntersectionObserver(entries => { if (!entries.some(entry => entry.isIntersecting)) return; observer.disconnect(); void bridge.rpc({ method: 'images.get', payload: { id } }).then(result => { if (!cancelled) setData((result.data as { dataUri: string }).dataUri) }).catch(() => { if (!cancelled) setError('图片暂时无法读取') }) }, { rootMargin: '200px' })
    if (element.current) observer.observe(element.current)
    return () => { cancelled = true; observer.disconnect() }
  }, [id, source, sourceFailed, bridge, revision])
  return <><button ref={element} className="message-image" onClick={() => { if (display) setOpen(true); else if (error) setRevision(value => value + 1) }} aria-label={error ? '重新加载图片' : '查看消息图片'}>{display ? <img src={display} alt="消息附件" onError={() => { if (source && !sourceFailed) setSourceFailed(true); else { setData(''); setError('图片暂时无法读取') } }} /> : <span>{error ? `${error} · 点此重试` : '正在读取图片…'}</span>}</button>{open && display && <ImageLightbox source={display} close={() => setOpen(false)} />}</>
}
