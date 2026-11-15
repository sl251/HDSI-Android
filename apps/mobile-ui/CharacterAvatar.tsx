import React, { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { CharacterAvatar, ExperienceSnapshot, NativeBridge } from '../../packages/contracts'
import { StoredImage } from './StoredImage'
import { operationId } from './operation-id'

export function useCharacterAvatar(bridge: NativeBridge, native: boolean, cardId: string, revision = 0) {
  const [value, setValue] = useState<CharacterAvatar>({ cardId })
  const current = useRef(cardId); current.current = cardId
  useEffect(() => {
    let alive = true; setValue({ cardId })
    if (native && cardId) void bridge.characterAvatar({ cardId }).then(result => { if (alive) setValue(result) }).catch(() => {})
    return () => { alive = false }
  }, [native, cardId, revision])
  const save = async (input: { dataUri?: string; imageId?: string; clear?: boolean }) => {
    const result = await bridge.saveCharacterAvatar({ cardId, ...input })
    if (current.current === cardId) setValue(result)
  }
  const source = value.cardId === cardId && value.path ? `${Capacitor.convertFileSrc(value.path)}?v=${value.revision || 0}` : ''
  return { source, save }
}

export function AvatarSettings({ avatar, bridge, cardId, name, native, healthy, imageEnabled, snapshot, refresh }: { avatar: ReturnType<typeof useCharacterAvatar>; bridge: NativeBridge; cardId: string; name: string; native: boolean; healthy: boolean; imageEnabled: boolean; snapshot: ExperienceSnapshot; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const act = async (task: () => Promise<void>) => { setBusy(true); setNotice(''); try { await task() } catch (error) { if (alive.current) setNotice(String(error)) } finally { if (alive.current) setBusy(false) } }
  const job = [...snapshot.jobs].reverse().find(row => row.kind === 'image' && row.purpose === 'avatar')
  return <section className="settings-group avatar-settings"><div className="avatar-summary">{avatar.source ? <img className="character-avatar avatar-large" src={avatar.source} alt={`${name}的头像`} /> : <span className="avatar-placeholder" aria-label="未设置角色头像">{name.slice(0, 1) || '像'}</span>}<div><strong>{name || '当前角色'}</strong><p className="caption">聊天和动态里的个人头像，可上传任意喜欢的图片。更换头像不会改变角色形象或生图参考图。</p></div></div><div className="actions"><button className="secondary" disabled={!native || !cardId || busy} onClick={() => void act(async () => { const result = await bridge.pickImage({ limit: 1, source: 'gallery' }); if (result.cancelled || !alive.current) return; const dataUri = result.images?.[0]?.dataUri || result.dataUri; if (!dataUri) throw new Error('没有选到可用图片'); await avatar.save({ dataUri }); if (alive.current) setNotice('头像已更新') })}>从相册上传头像</button><button className="secondary" disabled={!native || !cardId || !healthy || !imageEnabled || busy || !!job && ['queued', 'running', 'submitted', 'unknown'].includes(job.status)} onClick={() => void act(async () => { const operation = operationId(localStorage, `hds-avatar-operation-${cardId}`, { purpose: 'avatar' }); await bridge.rpc({ method: 'media.create', payload: { id: operation.id, kind: 'image', purpose: 'avatar' } }); operation.done(); if (alive.current) { await refresh(); setNotice('正在按人设与视觉档案生成，完成后可预览并使用') } })}>按人设生成</button>{avatar.source && <button className="text-button" disabled={busy} onClick={() => void act(async () => { await avatar.save({ clear: true }); if (alive.current) setNotice('已恢复为不显示聊天头像') })}>移除头像</button>}</div><p className="caption avatar-hint">头像按故事保存，选择后立即生效。未设置时，聊天保持原样。</p>{!imageEnabled && <p className="caption avatar-hint">按人设生成需要先在「语音识别与生图」启用图片服务。</p>}{job && <div className="avatar-result">{job.status === 'ready' && job.imageId ? <><StoredImage id={job.imageId} bridge={bridge} /><button className="primary" disabled={busy} onClick={() => void act(async () => { await avatar.save({ imageId: job.imageId }); if (alive.current) setNotice('已设为角色头像') })}>使用这张头像</button></> : <p className="caption">{job.status === 'unknown' ? job.error || '提交结果待确认，请先在服务端核实，避免重复生成。' : job.status === 'failed' ? job.error || '头像生成失败' : '头像生成中…'}</p>}{job.status === 'failed' && <button disabled={busy} onClick={() => void act(async () => { await bridge.rpc({ method: 'media.retry', payload: { id: job.id } }); await refresh() })}>重试生成</button>}</div>}{notice ? <p className="caption avatar-status-note" role="status">{notice}</p> : <p className="caption sr-only" role="status" aria-hidden="true" />}</section>
}
