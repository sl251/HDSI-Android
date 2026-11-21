import React, { useEffect, useRef, useState } from 'react'
import { defaultExperience, type ExperienceSettings, type ExperienceSnapshot, type NativeBridge } from '../../packages/contracts'
import { StoredImage } from './StoredImage'
import { ImageServiceTest } from './ImageServiceTest'
import { SelectField } from './SelectField'
import type { RuntimeSession } from './hooks/useRuntimeSession'

// 保留在二级设置页来回切换时的未保存草稿，在保存或底稿更新后清理
const pendingDrafts = new Map<string, { base: ExperienceSettings; draft: ExperienceSettings }>()

const enterOptions = [
  { value: 'newline', label: '换行' },
  { value: 'send', label: '发送消息' },
] as const

export function useExperience(bridge: NativeBridge, native: boolean, cardId: string, healthy: boolean, scope: Pick<RuntimeSession, 'selectedRef' | 'profileRevision'>) {
  const [settings, setSettings] = useState(defaultExperience)
  const [snapshot, setSnapshot] = useState<ExperienceSnapshot>({ posts: [], jobs: [], streams: [] })
  const [error, setError] = useState('')
  const { selectedRef, profileRevision } = scope
  const current = (expected: number) => selectedRef.current === cardId && profileRevision.current === expected
  const refresh = async () => {
    if (!native || !healthy || selectedRef.current !== cardId) return
    const expected = profileRevision.current
    const result = (await bridge.rpc({ method: 'experience.snapshot' })).data as ExperienceSnapshot
    if (current(expected) && result?.posts && result?.jobs && result?.streams) setSnapshot(result)
  }
  useEffect(() => {
    let alive = true
    setSnapshot({ posts: [], jobs: [], streams: [] }); setSettings(defaultExperience()); setError('')
    if (!native) return
    const load = async () => {
      if (!alive || cardId !== selectedRef.current) return
      try {
        const value = await bridge.experienceSettings()
        if (alive && selectedRef.current === cardId) {
          const defaults = defaultExperience()
          setSettings({ ...defaults, ...value, visual: { ...defaults.visual, ...value.visual } })
        }
      } catch {}
    }
    void Promise.resolve().then(load)
    return () => { alive = false }
  }, [bridge, cardId, native, selectedRef])
  useEffect(() => {
    if (!native || !healthy) return
    let alive = true, running = false
    const read = async () => {
      if (!alive || running || cardId !== selectedRef.current) return
      const started = profileRevision.current
      running = true
      try {
        const value = (await bridge.rpc({ method: 'experience.snapshot' })).data as ExperienceSnapshot
        if (alive && current(started) && value?.streams) setSnapshot(value)
      } catch { /* Old builds/previews may not expose new RPCs. */ }
      finally { running = false }
    }
    void Promise.resolve().then(read)
    const timer = setInterval(() => { if (!document.hidden) void read() }, 1500)
    const subscribe = () => alive ? bridge.addListener?.('replyStream', event => {
      if (!alive || event.cardId !== cardId || selectedRef.current !== cardId) return
      setSnapshot(previous => ({ ...previous, streams: [...previous.streams.filter(s => s.id !== event.id), ...(!event.delivered && event.content && ['streaming', 'failed'].includes(event.status) ? [{ id: event.id, sourceIds: event.sourceIds, content: event.content, occurredAt: event.occurredAt, status: event.status === 'failed' ? 'interrupted' as const : 'streaming' as const }] : [])] }))
    }) : undefined
    const listener = Promise.resolve().then(subscribe).catch(() => undefined)
    return () => { alive = false; clearInterval(timer); void listener.then(handle => handle?.remove()).catch(() => {}) }
  }, [bridge, native, healthy, cardId, selectedRef, profileRevision])
  const save = async (value: ExperienceSettings) => {
    const expected = profileRevision.current
    const result = await bridge.saveExperience({ ...value, cardId })
    if (current(expected)) { const defaults = defaultExperience(); setSettings({ ...defaults, ...result, visual: { ...defaults.visual, ...result.visual } }); setError('') }
  }
  return { settings, snapshot, refresh, save, error, setError }
}

export function ExperiencePanel({ value, save, bridge, native, healthy, mode, characterName, children, jobs = [], refreshJobs, diagnose, cardId = '' }: { value: ExperienceSettings; save: (value: ExperienceSettings) => Promise<void>; bridge: NativeBridge; native: boolean; healthy: boolean; mode: 'chat' | 'media' | 'visual'; characterName: string; children?: React.ReactNode; cardId?: string; jobs?: ExperienceSnapshot['jobs']; refreshJobs?: () => Promise<void>; diagnose?: (id: string) => void }) {
  const draftKey = `${cardId}:${mode}`
  const [draft, setDraftState] = useState<ExperienceSettings>(() => {
    const cached = pendingDrafts.get(draftKey)
    return cached && cached.base === value ? cached.draft : value
  })
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [noticeError, setNoticeError] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(noticeTimer.current) }
  }, [])
  const updateDraft = (updater: ExperienceSettings | ((prev: ExperienceSettings) => ExperienceSettings)) => {
    setDraftState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      pendingDrafts.set(draftKey, { base: value, draft: next })
      return next
    })
  }
  useEffect(() => {
    const cached = pendingDrafts.get(draftKey)
    if (cached && cached.base === value) setDraftState(cached.draft)
    else { pendingDrafts.delete(draftKey); setDraftState(value) }
  }, [draftKey, value])
  const updateVisual = (patch: Partial<ExperienceSettings['visual']>) => updateDraft(d => ({ ...d, visual: { ...d.visual, ...patch } }))
  const submit = async () => {
    clearTimeout(noticeTimer.current); setBusy(true); setNotice(''); setNoticeError(false)
    try {
      await save(draft)
      pendingDrafts.delete(draftKey)
      if (!mounted.current) return
      setNotice('已保存')
      noticeTimer.current = setTimeout(() => setNotice(''), 2200)
    } catch (e) { if (mounted.current) { setNoticeError(true); setNotice(String(e)) } } finally { if (mounted.current) setBusy(false) }
  }
  return <section className="experience-settings"><div className="settings-group"><fieldset disabled={!native || busy}>
    {mode === 'chat' && <><SelectField label="回车键" value={draft.enterBehavior} options={enterOptions} disabled={!native || busy} onChange={enterBehavior => updateDraft({ ...draft, enterBehavior })} helperText={draft.enterBehavior === 'send' ? '回车发送 · Shift+Enter 换行 · 中文输入法选词确认时不会误发' : '回车换行 · Ctrl+Enter 发送 · 中文输入法选词确认时不会误发'} /><label className="toggle"><input type="checkbox" checked={draft.feedEnabled} onChange={e => updateDraft({ ...draft, feedEnabled: e.target.checked })} />启用当前应用的动态功能</label><p className="caption field-help">开启后可在底部「动态」发布图文、点赞和评论；你与角色的动态仅属于当前故事，关闭会暂停互动并保留已有内容。</p></>}
    {mode === 'media' && <>{(['stt', 'image'] as const).map(kind => {
      const row = draft[kind], update = (patch: Partial<typeof row>) => updateDraft(d => ({ ...d, [kind]: { ...d[kind], ...patch } }))
      return <div className="media-connection" key={kind}><h3>{kind === 'stt' ? '语音识别 STT' : '图片生成'}</h3><label className="toggle"><input type="checkbox" checked={row.enabled} onChange={e => update({ enabled: e.target.checked })} />启用</label>{kind === 'image' && <label>渠道<select value={row.provider} onChange={e => update({ provider: e.target.value as typeof row.provider, clearKey: true, apiKey: '', endpoint: e.target.value === 'imagefree' ? 'https://imagefree.net' : '' })}><option value="imagefree">Imagefree · 免费渠道</option><option value="compatible">兼容图片接口</option></select></label>}{row.provider !== 'imagefree' && <><label>服务地址<input value={row.endpoint} onChange={e => update({ endpoint: e.target.value })} placeholder="https://服务地址/v1" /></label><label>模型<input value={row.model} onChange={e => update({ model: e.target.value })} /></label><label>API Key<input type="password" autoComplete="off" value={row.apiKey ?? ''} placeholder={row.credentialPresent ? '已保存；留空沿用' : '输入密钥'} onChange={e => update({ apiKey: e.target.value, clearKey: false })} /></label><label className="toggle"><input type="checkbox" checked={!!row.clearKey} onChange={e => update({ clearKey: e.target.checked, apiKey: '' })} />清除已保存密钥</label>{kind === 'image' && <><label>生图接口格式<select value={row.imageApi ?? 'auto'} onChange={e => update({ imageApi: e.target.value as typeof row.imageApi })}><option value="auto">自动识别</option><option value="images">OpenAI Images · GPT Image / DALL·E / Flux 等</option><option value="chat">聊天式生图 · Gemini / OpenRouter 等中转</option><option value="gemini">Gemini 原生 · generateContent</option></select></label><label className="toggle"><input type="checkbox" checked={!!row.referenceImages} onChange={e => update({ referenceImages: e.target.checked })} />发送角色参考图（服务需支持）</label></>}</>}<p className="caption">{kind === 'stt' ? '支持兼容 audio/transcriptions 的语音识别接口。' : row.provider === 'imagefree' ? '使用文字外观约束；遇到验证时可打开免费网页，完成生成并下载后接回原任务。' : '自动识别 Gemini 生图模型及完整端点；也可按服务文档手动选择格式。支持图片链接、Base64、聊天图片和 Gemini 图片响应。'}</p></div>
    })}</>}
    {mode === 'visual' && <><div className="visual-profile-name"><small>当前档案</small><strong>{characterName || '当前角色'}</strong></div><p className="caption">角色会自行决定自拍、聊天图片与动态配图的时机和内容。这里设定生图用的角色形象与画风，当前故事单独保存。聊天与动态的个人头像请在「空间 → 角色头像」设置。</p>{([['appearance', '固定外观'], ['style', '画风与色调'], ['outfit', '常用衣装'], ['constraints', '画面约束']] as const).map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} rows={3} maxLength={3000} value={draft.visual[key]} onChange={e => updateVisual({ [key]: e.target.value })} /></label>)}<label>默认比例<select value={draft.visual.ratio} onChange={e => updateVisual({ ratio: e.target.value as typeof draft.visual.ratio })}>{['1:1', '3:4', '4:3', '9:16', '16:9'].map(v => <option key={v}>{v}</option>)}</select></label><label className="toggle"><input type="checkbox" checked={draft.visual.autonomous} onChange={e => updateVisual({ autonomous: e.target.checked })} />允许角色自主决定生图（需启用生图渠道）</label><label>自主生图间隔（分钟）<input type="number" min={0} max={1440} value={draft.visual.cooldownMinutes} onChange={e => updateVisual({ cooldownMinutes: Number(e.target.value) })} /></label><div className="reference-images">{draft.visual.references.map(id => <div key={id}><StoredImage id={id} bridge={bridge} /><button onClick={() => updateVisual({ references: draft.visual.references.filter(v => v !== id) })}>移除参考图</button></div>)}</div><button disabled={!healthy || draft.visual.references.length >= 3 || busy} onClick={() => { setBusy(true); void (async () => { const selected = await bridge.pickImage({ limit: 3 - draft.visual.references.length }); if (selected.cancelled) return; const ids: string[] = []; for (const image of selected.images ?? (selected.dataUri ? [{ dataUri: selected.dataUri }] : [])) ids.push(((await bridge.rpc({ method: 'images.upload', payload: image })).data as { id: string }).id); updateVisual({ references: [...new Set([...draft.visual.references, ...ids])].slice(0, 3) }); })().catch(e => { setNoticeError(true); setNotice(String(e)) }).finally(() => setBusy(false)) }}>添加参考图</button><p className="caption">最多 3 张。Imagefree 使用文字描述；启用参考图的兼容服务才会接收这些图片。请先唤醒核心添加参考图。</p></>}
    {mode === 'media' && refreshJobs && diagnose && <ImageServiceTest cardId={cardId} bridge={bridge} save={() => save(draft)} jobs={jobs} refresh={refreshJobs} healthy={healthy} enabled={draft.image.enabled} diagnose={diagnose} />}
    {children}
    <div className="actions"><button className="primary" onClick={() => void submit()}>{busy ? '正在保存…' : '保存设置'}</button>{notice && <span role={noticeError ? 'alert' : 'status'} className={`caption${noticeError ? ' error' : ''}`}>{notice}</span>}</div>
  </fieldset></div></section>
}
