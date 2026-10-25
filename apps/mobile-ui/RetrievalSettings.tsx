import React, { useEffect, useState } from 'react'
import type { ModelSettings, NativeBridge } from '../../packages/contracts'
import { assignEmbedding, embeddingProviderId } from './model-tasks'
import schema from '../../packages/contracts/mobile-config.schema.json'
import { diagnosticReasons } from '../../packages/contracts/diagnostics'

type Probe = { ok: boolean; task: string; category: string; elapsedMs?: number; vectorDimensions?: number; resultCount?: number; httpStatus?: number }
export function RetrievalSettings({ settings, setSettings, bridge, native, healthy, busy = false, saveState, saveError }: { settings: ModelSettings; setSettings: React.Dispatch<React.SetStateAction<ModelSettings>>; bridge: NativeBridge; native: boolean; healthy: boolean; busy?: boolean; saveState: string; saveError: string }) {
  const [testing, setTesting] = useState(''), [results, setResults] = useState<Record<string, { fingerprint: string; result: Probe }>>({})
  const [active, setActive] = useState<any>(null), [error, setError] = useState('')
  const mobileConfig = settings.mobileConfig ?? {}, fingerprint = JSON.stringify({ providers: settings.providers, mobileConfig })
  useEffect(() => { if (!native || !healthy) { setActive(null); return }; let alive = true
    const poll = () => bridge.rpc({ method: 'config.status' }).then(result => { if (alive) setActive(result.data) }).catch(() => {})
    void poll(); const timer = setInterval(() => { if (!document.hidden) void poll() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [native, healthy, bridge, fingerprint])
  const update = (task: string, key: string, value: unknown) => setSettings(previous => ({ ...previous, mobileConfig: { ...previous.mobileConfig, sections: { ...previous.mobileConfig?.sections, [task]: { ...previous.mobileConfig?.sections?.[task], [key]: value } } } }))
  const probe = async (task: string) => {
    const snapshot = structuredClone({ providers: settings.providers, mobileConfig }), startedWith = fingerprint
    setTesting(task); setError(''); setResults(previous => { const next = { ...previous }; delete next[task]; return next })
    try { const response = await bridge.rpc({ method: 'models.testRetrieval', payload: { task, ...snapshot } }); setResults(previous => ({ ...previous, [task]: { fingerprint: startedWith, result: response.data as Probe } })) }
    catch (failure) { const message = failure instanceof Error ? failure.message : ''; setError(message.includes('模型测试进程清理失败') ? '模型测试进程清理失败，请重启应用。' : message.includes('请先安装') ? '请先安装包含模型测试的运行环境。' : '测试未完成，请确认已安装最新运行环境，并检查连接配置或进程清理状态。') }
    finally { setTesting('') }
  }
  return <section className="retrieval-settings model-center" aria-label="向量与重排序"><h2>向量与重排序</h2>
    <p className="caption">向量参与本地混合召回；重排序独立精排长期事实，是 Android 扩展。默认关闭；失败回退本地排序。测试使用手机内同一请求栈，可能产生少量模型费用；测试草稿不会保存或启动故事。</p>
    <p role="status">检索配置 · {saveError ? `尚未保存：${saveError}` : saveState}{healthy && saveState === '已自动保存' ? ' · 与运行配置不同的设置需重启生效' : ''}</p>
    {(['embedding', 'rerank'] as const).map(task => {
      const definition = schema.sections.find(section => section.key === task)!, values = { ...Object.fromEntries(definition.fields.map(field => [field.key, field.default])), ...mobileConfig.sections?.[task] }
      const providerId = task === 'embedding' ? embeddingProviderId(settings) : String(values.providerId || '')
      const provider = settings.providers.find(row => row.enabled && row.protocol === 'chat-completions' && row.id === providerId)
      const model = String(values.model || (task === 'embedding' ? provider?.model : '') || '')
      const target = { model, reason: !provider ? 'provider_required' : !model ? 'model_required' : '' }
      const result = results[task], live = active?.retrieval?.[task]
      const liveTarget = active?.retrievalTargets?.[task]
      const differs = definition.fields.some(field => JSON.stringify(field.key === 'enabled' ? live?.desired : active?.sections?.[task]?.[field.key]) !== JSON.stringify(values[field.key]))
      const edit = (key: string, value: unknown) => update(task, key, value)
      return <details key={task} data-retrieval-task={task} open><summary>{task === 'embedding' ? '向量检索' : '重排序 · Android 扩展'}</summary>
        <fieldset disabled={busy}><label className="toggle"><input type="checkbox" checked={values.enabled === true} onChange={event => edit('enabled', event.target.checked)} /><span>{task === 'embedding' ? '启用向量检索' : '启用重排序'}</span></label>
        {task === 'embedding' && <label className="toggle"><input type="checkbox" checked={values.liveQuery === true} onChange={event => edit('liveQuery', event.target.checked)} /><span>对话中实时检索</span></label>}
        <label>任务连接<select aria-label={`${task} 连接`} value={providerId} onChange={event => task === 'embedding' ? setSettings(current => assignEmbedding(current, event.target.value)) : edit('providerId', event.target.value)}><option value="">暂不分配</option>{providerId && !provider && <option value={providerId} disabled>原连接不可用 · 请重新分配</option>}{settings.providers.filter(row => row.enabled && row.protocol === 'chat-completions').map(row => <option key={row.id} value={row.id}>{row.label} · {row.model}</option>)}</select></label>
        <label>{task === 'embedding' ? '向量模型（留空沿用连接）' : '重排序模型'}<input aria-label={`${task} 模型名`} value={String(values.model)} maxLength={256} placeholder={task === 'embedding' ? '留空使用连接模型' : '必填 API 重排序模型名'} onChange={event => edit('model', event.target.value)} /></label>
        <label>完整端点<input aria-label={`${task} 完整端点`} value={String(values.endpoint)} maxLength={2048} placeholder={`留空自动派生 /${task === 'embedding' ? 'embeddings' : 'rerank'}`} onChange={event => edit('endpoint', event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <p className="caption">解析来源：{values.endpoint ? '显式端点' : '自动派生'} · {values.model ? '显式模型' : task === 'embedding' ? '连接模型' : '待填写模型'}{target.model ? ` · ${target.model}` : ''}</p>
        {target.reason && <p role="status">{diagnosticReasons[target.reason] ?? '请完善检索配置。'}</p>}
        <details className="advanced"><summary>检索高级项</summary>{definition.fields.filter(field => ['timeout', 'dimensions', 'topN', 'scoreThreshold'].includes(field.key)).map(field => <label key={field.key}>{({ timeout: '超时（毫秒）', dimensions: '向量维度（0 为自动）', topN: '精排输出上限', scoreThreshold: '分数阈值（模型相关，0 关闭）' } as Record<string, string>)[field.key]}<input aria-label={`${task} ${field.key}`} type="number" min={field.min} max={field.max} step={field.step ?? 'any'} value={Number(values[field.key])} onChange={event => edit(field.key, Number(event.target.value))} /></label>)}</details>
        <button disabled={!native || !!testing} onClick={() => void probe(task)}>{testing === task ? '正在测试…' : task === 'embedding' ? '测试向量连接' : '测试重排序连接'}</button>
        {testing === task && <button onClick={() => void bridge.rpc({ method: 'models.cancelRetrieval' })}>取消测试</button>}
        {result && <p role="status">{result.fingerprint !== fingerprint && '对应之前的配置 · '}{result.result.ok ? '测试成功' : `测试失败：${diagnosticReasons[result.result.category] ?? result.result.category}`}{result.result.httpStatus && ` · HTTP ${result.result.httpStatus}`}{result.result.elapsedMs !== undefined && ` · ${result.result.elapsedMs} ms`}{result.result.vectorDimensions !== undefined && ` · 维度 ${result.result.vectorDimensions}`}{result.result.resultCount !== undefined && ` · 返回 ${result.result.resultCount} 条`}</p>}
        {liveTarget && <p className="caption">核心实际解析：{liveTarget.endpointSource === 'explicit' ? '显式端点' : '自动派生'} · {liveTarget.modelSource === 'explicit' ? '显式模型' : '连接模型'} · {liveTarget.model}</p>}
        {live && <p className="caption">{differs ? '已保存配置与当前核心不同，待重启' : '当前核心配置'} · 期望{live.desired ? '开启' : '关闭'} / 实际{live.effective ? '开启' : '关闭'}{live.reason && live.reason !== 'disabled' ? ` · ${diagnosticReasons[live.reason] ?? live.reason}` : ''}</p>}
      </fieldset></details>
    })}{error && <p role="alert">{error}</p>}
  </section>
}
