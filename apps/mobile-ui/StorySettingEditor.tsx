import React, { useEffect, useState } from 'react'
import type { NativeBridge } from '../../packages/contracts'

// The runtime accepts StorySetting (character.name/profile), rather than the
// import-time storyDefaults characterName/characterProfile aliases.
export type EditableStorySetting = {
  character?: { name?: string; profile?: string }; world?: string; relationship?: string
  perspective?: string; timezone?: string; supplementaryFacts?: string[]
}
export function storySettingPatch(draft: EditableStorySetting) {
  const name = draft.character?.name?.trim() || ''
  if (!name) throw new Error('请填写主角名称')
  const timezone = draft.timezone?.trim() || 'Asia/Shanghai'
  try { new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format() } catch { throw new Error('请填写有效的 IANA 时区，例如 Asia/Shanghai') }
  return { character: { name, profile: draft.character?.profile ?? '' }, world: draft.world ?? '', relationship: draft.relationship ?? '', perspective: draft.perspective ?? '', timezone, supplementaryFacts: (draft.supplementaryFacts ?? []).map(fact => fact.trim()).filter(Boolean) }
}
export function StorySettingEditor({ bridge, close, saved }: { bridge: NativeBridge; close: () => void; saved: () => Promise<void> }) {
  const [draft, setDraft] = useState<EditableStorySetting | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError('')
    void bridge.rpc({ method: 'story.snapshot' }).then(result => {
      const setting = (result.data as { story?: { setting?: EditableStorySetting } }).story?.setting
      if (!setting) throw new Error('未找到当前故事设定')
      if (!cancelled) setDraft(structuredClone(setting))
    }).catch(failure => { if (!cancelled) setError(String(failure instanceof Error ? failure.message : failure)) })
    return () => { cancelled = true }
  }, [bridge, attempt])
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="修改故事设定">
    <div className="section-title"><h2>修改故事设定</h2><button aria-label="关闭编辑" disabled={busy} onClick={close}>×</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!draft ? <><p role="status">{error ? '读取失败' : '正在读取当前故事…'}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>重试读取</button>}</> : <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void (async () => {
      try { await bridge.rpc({ method: 'story.applySetting', payload: storySettingPatch(draft) }); await saved(); close() }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
      finally { setBusy(false) }
    })() }}><fieldset disabled={busy}>
      <label>主角名称<input aria-label="主角名称" required maxLength={128} value={draft.character?.name ?? ''} onChange={event => setDraft({ ...draft, character: { ...draft.character, name: event.target.value } })} /></label>
      <label>主角人设<textarea aria-label="主角人设" rows={5} maxLength={20000} value={draft.character?.profile ?? ''} onChange={event => setDraft({ ...draft, character: { ...draft.character, profile: event.target.value } })} /></label>
      {([{ key: 'world', label: '世界' }, { key: 'relationship', label: '关系' }, { key: 'perspective', label: '视角' }] as const).map(field => <label key={field.key}>{field.label}<textarea aria-label={field.label} rows={3} maxLength={20000} value={draft[field.key] ?? ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} /></label>)}
      <label>故事时区<input aria-label="故事时区" value={draft.timezone ?? 'Asia/Shanghai'} onChange={event => setDraft({ ...draft, timezone: event.target.value })} placeholder="Asia/Shanghai" /></label>
      <label>补充事实（每行一条）<textarea aria-label="补充事实（每行一条）" rows={4} maxLength={20000} value={(draft.supplementaryFacts ?? []).join('\n')} onChange={event => setDraft({ ...draft, supplementaryFacts: event.target.value.split('\n') })} /></label>
      <button className="primary wide">保存故事设定</button>
    </fieldset></form>}
  </section></div>
}
