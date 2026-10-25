import React, { useEffect, useRef, useState } from 'react'
import type { NativeBridge, VoiceState, MessageAudio, VoiceBinding, Voice } from '../../packages/contracts'
import { emptyVoiceState, messageAudio, voiceResultLabel } from '../../packages/contracts'
import { MessageContent } from './MessageContent'

export function useVoices(bridge: NativeBridge, native: boolean) {
  const [state, setState] = useState<VoiceState>(emptyVoiceState)
  const revision = useRef(0)
  const accept = (value: VoiceState) => { if (!value?.voices) return; revision.current++; setState(value) }
  useEffect(() => {
    if (!native) return
    let alive = true
    const read = () => { const expected = revision.current; return bridge.voiceState().then(value => { if (alive && revision.current === expected) accept(value) }).catch(() => {}) }
    void read(); const timer = setInterval(() => { if (!document.hidden) void read() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [native, bridge])
  return { state, accept }
}
export function VoiceBubble({ audio, content, bridge }: { audio: MessageAudio; content: string; bridge: NativeBridge }) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const player = useRef<HTMLAudioElement>()
  const playbackRevision = useRef(0)
  useEffect(() => () => { playbackRevision.current++; player.current?.pause(); player.current = undefined }, [audio.audioId])
  const play = async () => {
    if (loading) return
    if (playing) { player.current?.pause(); setPlaying(false); return }
    const expected = playbackRevision.current
    setLoading(true); setError('')
    try {
      if (!player.current) {
        const { dataUri } = await bridge.voiceAudio({ audioId: audio.audioId })
        if (playbackRevision.current !== expected) return
        const a = new Audio(dataUri); a.onended = () => setPlaying(false); a.onerror = () => { setPlaying(false); setError('播放失败，可展开文字稿') }; player.current = a
      }
      await player.current.play(); if (playbackRevision.current === expected) setPlaying(true)
    } catch { if (playbackRevision.current === expected) setError('播放失败，可展开文字稿') } finally { if (playbackRevision.current === expected) setLoading(false) }
  }
  return <div className="voice-message"><button type="button" className="voice-play" disabled={loading} aria-label={playing ? '暂停语音' : '播放语音'} onClick={() => void play()}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'} ▂▆▃▇▃</span><span>{Math.max(1, Math.ceil(audio.duration))} 秒</span></button><button type="button" className="text-button voice-transcript-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起文字稿' : '展开文字稿'}</button>{error && <small role="status">{error}</small>}{open && <div className="voice-transcript"><MessageContent message={{ content }} /></div>}</div>
}
export function VoiceSettings({ bridge, state, accept, cardId, name, native, notify }: { bridge: NativeBridge; state: VoiceState; accept: (value: VoiceState) => void; cardId: string; name: string; native: boolean; notify: (text: string) => void }) {
  const [workbench, setWorkbench] = useState(false)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState('')
  const binding = state.characters[cardId] || { enabled: false, voiceId: '', threshold: .7 }
  const save = async (input: Parameters<NativeBridge['saveVoiceSettings']>[0]) => {
    setBusy(true); try { accept(await bridge.saveVoiceSettings(input)); return true } catch (e) { notify(String(e)); return false } finally { setBusy(false) }
  }
  const bind = (patch: Partial<VoiceBinding>) => save({ cardId, binding: { ...binding, ...patch } })
  return <section className="settings-group voice-settings"><details open><summary><span><b>角色语音与音色</b><small>为合适的时刻，多留一种表达</small></span></summary>
    <label className="toggle"><input type="checkbox" disabled={!native || !cardId || busy} checked={binding.enabled} onChange={e => void bind({ enabled: e.target.checked })} /><div><b>允许角色发语音</b><p>{name || '当前角色'} · 默认关闭，保存后影响后续回复</p></div></label>
    {binding.enabled && <><p className="caption">角色自主选择文字、语音或表情包。语音发送成功时不再附带同内容文字；App 内可按需展开文字稿。合成不可用时回退文字。</p><label>角色音色<select aria-label="角色音色" disabled={busy} value={binding.voiceId} onChange={e => void bind({ voiceId: e.target.value })}><option value="">跟随全局默认音色</option>{state.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>语音意愿阈值<input type="number" min="0" max="1" step="0.05" defaultValue={binding.threshold} key={`${cardId}:${binding.threshold}`} onBlur={e => { if (Number(e.target.value) !== binding.threshold) void bind({ threshold: Number(e.target.value) }) }} /></label></>}
    <button className="settings-entry" onClick={() => setWorkbench(true)}><span>音色工作台<small>录音、导入、试听与命名保存</small></span><span aria-hidden="true">→</span></button>
    <label>全局默认音色<select disabled={!native || busy} value={state.defaultVoiceId} onChange={e => void save({ defaultVoiceId: e.target.value })}>{state.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    {state.lastResult && <p role="status">{voiceResultLabel(state.lastResult)}</p>}
    <label>每 N 条回复最多一条语音<input type="number" min="0" max="1000" key={`cooldown:${state.cooldown}`} defaultValue={state.cooldown} disabled={!native || busy} onBlur={e => { if (Number(e.target.value) !== state.cooldown) void save({ cooldown: Number(e.target.value) }) }} /></label>
    <label>Mimo 语音 API Key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={state.credentialPresent ? '密钥已保存；留空保留' : '填写你的 Mimo 密钥'} maxLength={8192} /></label><div className="actions"><button disabled={!native || busy || !key.trim()} onClick={async () => { if (await save({ apiKey: key })) setKey('') }}>保存语音密钥</button>{state.credentialPresent && <button disabled={busy} onClick={() => void save({ clearKey: true })}>移除语音密钥</button>}</div>
  </details>{workbench && <VoiceWorkbench bridge={bridge} state={state} accept={accept} native={native} close={() => setWorkbench(false)} notify={notify} />}</section>
}
function VoiceWorkbench({ bridge, state, accept, native, close, notify }: { bridge: NativeBridge; state: VoiceState; accept: (value: VoiceState) => void; native: boolean; close: () => void; notify: (text: string) => void }) {
  const [name, setName] = useState(''); const [description, setDescription] = useState('')
  const [type, setType] = useState<'design' | 'reference'>('design'); const [reference, setReference] = useState<MessageAudio>()
  const [recording, setRecording] = useState(false); const [busy, setBusy] = useState(false)
  const [sample, setSample] = useState<string>(); const [renaming, setRenaming] = useState(''); const [rename, setRename] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; void bridge.cancelVoiceRecording().catch(() => {}) } }, [bridge])
  const action = async (work: () => Promise<void>) => { setBusy(true); try { await work() } catch (e) { notify(String(e)) } finally { if (active.current) setBusy(false) } }
  const stop = () => action(async () => { try { const value = await bridge.stopVoiceRecording(); setReference(value); setSample((await bridge.voiceAudio({ audioId: value.audioId })).dataUri) } finally { setRecording(false) } })
  useEffect(() => { if (!recording) return; const timer = setTimeout(() => void stop(), 59000); return () => clearTimeout(timer) }, [recording])
  const draft: Pick<Voice, 'type' | 'value'> = { type, value: type === 'design' ? description.trim() : reference?.audioId || '' }
  const preview = (options: Parameters<NativeBridge['previewVoice']>[0]) => action(async () => {
    const result = messageAudio(await bridge.previewVoice(options)); accept(await bridge.voiceState())
    if (!result) { notify('暂时无法生成试听，请检查密钥、网络或语音服务状态。'); return }
    setSample((await bridge.voiceAudio({ audioId: result.audioId })).dataUri)
  })
  return <div className="modal-backdrop"><section className="modal voice-workbench" role="dialog" aria-modal="true" aria-label="音色工作台"><div className="section-title"><h2>音色工作台</h2><button autoFocus disabled={busy} aria-label="关闭音色工作台" onClick={close}>×</button></div>
    <p className="caption">参考音频会在合成时发送给 Mimo。录音最长 60 秒；导入最长 180 秒、10 MiB。先试听，再为音色取名。</p>
    <label>创建方式<select aria-label="创建方式" value={type} disabled={recording || busy} onChange={e => { setType(e.target.value as typeof type); setSample(undefined) }}><option value="design">描述音色</option><option value="reference">录音或导入参考音频</option></select></label>
    {type === 'design' ? <label>音色描述<textarea rows={3} maxLength={2000} value={description} placeholder="例如：温暖清亮的女声，语速舒缓，带一点笑意" onChange={e => setDescription(e.target.value)} /></label> : <><div className="actions"><button disabled={!native || busy || recording} onClick={() => void action(async () => { const result = await bridge.pickVoiceAudio(); if (result.cancelled) return; const audio = messageAudio(result); if (audio) { setReference(audio); setSample((await bridge.voiceAudio({ audioId: audio.audioId })).dataUri) } })}>导入 wav / mp3</button><button disabled={!native || busy} onClick={() => recording ? void stop() : void action(async () => { await bridge.startVoiceRecording(); setRecording(true) })}>{recording ? '结束录音' : '开始录音'}</button></div>{recording && <p role="status">正在录音… 最长 60 秒</p>}{reference && <p className="caption">参考音频 · {Math.ceil(reference.duration)} 秒</p>}</>}
    {sample && <audio className="voice-sample" aria-label="音色试听播放器" controls src={sample} />}
    <button disabled={!native || busy || recording || !draft.value} onClick={() => void preview({ draft })}>生成试听</button>
    <label>音色名称<input value={name} maxLength={64} onChange={e => setName(e.target.value)} /></label><button className="primary" disabled={!native || busy || recording || !name.trim() || !draft.value} onClick={() => void action(async () => { accept(await bridge.saveVoice({ name: name.trim(), ...draft })); setName(''); notify('音色已保存。') })}>保存音色</button>
    <h3>音色库</h3><div className="voice-library">{state.voices.map(v => <article key={v.id}><b>{v.name}</b><small>{v.type === 'builtin' ? '内置' : v.type === 'design' ? '描述音色' : '参考音频'}</small><div className="actions"><button disabled={!native || busy || recording} onClick={() => void preview({ voiceId: v.id })}>试听 {v.name}</button>{v.type !== 'builtin' && <><button disabled={busy} onClick={() => { setRenaming(v.id); setRename(v.name) }}>改名</button><button className="danger" disabled={busy} onClick={() => setDeleteId(v.id)}>删除</button></>}</div>{renaming === v.id && <label>新音色名称<input aria-label="新音色名称" value={rename} maxLength={64} onChange={e => setRename(e.target.value)} /><button disabled={busy || !rename.trim()} onClick={() => void action(async () => { accept(await bridge.saveVoice({ id: v.id, name: rename.trim() })); setRenaming('') })}>保存新名称</button></label>}{deleteId === v.id && <div><p>删除音色后，绑定回退全局默认；已有语音保留。</p><button disabled={busy} onClick={() => void action(async () => { accept(await bridge.deleteVoice({ id: v.id })); setDeleteId('') })}>确认删除音色</button><button onClick={() => setDeleteId('')}>取消</button></div>}</article>)}</div>
  </section></div>
}
