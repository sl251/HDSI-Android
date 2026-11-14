import React, { useEffect, useState } from 'react'
import type { ModelOptions, ModelProvider, ModelSettings, NativeBridge } from '../../packages/contracts'
import { assigned, assignTask, followsMain, removeProvider, toggleTaskProvider } from './model-tasks'
import presets from '../../android/app/src/main/assets/model-presets.json'

export const defaultOptions: ModelOptions = { mainStreamingMode: 'off', mainResponseFormat: 'json-object', mainTemperature: 0.8, mainMaxTokens: 4096, mainTimeout: 90000, maxAttemptsPerProvider: 2, mobileTurnDeadlineMs: 240000, cooldownMinutes: 5, mainPayloadOrder: 'cache-first', failoverEnabled: false, failoverStrategy: 'priority' }
export const newProvider = (): ModelProvider => ({ id: crypto.randomUUID(), preset: 'custom', label: '自定义连接', endpoint: '', model: '', protocol: 'chat-completions', enabled: true, credentialPresent: false, useForMain: true, useForCompaction: true, useForAlter: true, useForEmbedding: false, deepseekThinking: 'inherit', imageInput: 'unknown' })
const roles = [{ key: 'useForMain', name: '主叙事', description: '对话、生活剧本与主动联系' }, { key: 'useForCompaction', name: '记忆压缩', description: '场景整理、长期记忆与时间导演' }, { key: 'useForAlter', name: '心理分析', description: '事件带来的情绪与氛围变化' }, { key: 'useForWorldSeeding', name: '世界播种', description: '外部事件与配角事件生成 · 可不分配' }] as const
type Props = { mode?: 'connections' | 'tasks' | 'advanced'; children?: React.ReactNode; onNavigate?: (page: 'models' | 'tasks' | 'chat') => void; settings: ModelSettings; setSettings: React.Dispatch<React.SetStateAction<ModelSettings>>; native: boolean; busy: boolean; bridge: NativeBridge; act: (task: () => Promise<unknown>, success?: string) => Promise<void>; notify: (text: string) => void }

export function ModelCenter({ mode = 'connections', settings, setSettings, native, busy, bridge, act, notify, children, onNavigate }: Props) {
  const [selected, setSelected] = useState(settings.providers[0]?.id ?? '')
  const [catalogs, setCatalogs] = useState<Record<string, { models: string[]; partial: boolean }>>({})
  const [search, setSearch] = useState('')
  const [failoverNotice, setFailoverNotice] = useState(false)
  const providers = settings.providers
  useEffect(() => { if (!providers.some(row => row.id === selected)) setSelected(providers[0]?.id ?? '') }, [providers, selected])
  const row = providers.find(value => value.id === selected) ?? providers[0]
  const update = (patch: Partial<ModelProvider>) => {
    if (!row) return
    if (['endpoint', 'protocol', 'model'].some(key => key in patch && patch[key as keyof ModelProvider] !== row[key as keyof ModelProvider])) patch.imageInput = 'unknown'
    setSettings(current => ({ ...current, providers: current.providers.map(value => value.id === row.id ? { ...value, ...patch } : value), modelOptions: { ...current.modelOptions, ...(patch.enabled === false && current.modelOptions.visionProviderId === row.id ? { visionProviderId: '', visionEnabled: false } : {}) } }))
    if (['endpoint', 'apiKey', 'preset', 'protocol', 'modelsEndpoint', 'clearKey'].some(key => key in patch)) setCatalogs(current => { const next = { ...current }; delete next[row.id]; return next })
  }
  const option = (patch: Partial<ModelOptions>) => setSettings(current => ({ ...current, modelOptions: { ...current.modelOptions, ...patch } }))
  const reorder = (delta: number) => {
    const index = providers.findIndex(value => value.id === row?.id)
    if (index + delta < 0 || index + delta >= providers.length) return
    const next = [...providers]; [next[index], next[index + delta]] = [next[index + delta], next[index]]
    setSettings({ ...settings, providers: next })
  }
  const choosePreset = (id: string) => {
    const preset = presets.find(item => item.id === id)!
    update({ preset: id, label: preset.label, endpoint: preset.endpoint, model: preset.model, protocol: preset.protocol as ModelProvider['protocol'], apiKey: '', clearKey: true, credentialPresent: false, modelsEndpoint: '', deepseekThinking: id === 'deepseek' ? 'disabled' : 'inherit' })
    setSearch('')
  }
  const catalog = row && catalogs[row.id]
  const filtered = catalog?.models.filter(model => model.toLowerCase().includes(search.toLowerCase())) ?? []
  return <section className="model-center">
    {mode === 'tasks' && <>
    <p className="caption">按用途选择模型。对话、记忆、识图和检索都在这里安排。</p>
    <button className="secondary wide" onClick={() => onNavigate?.('models')}>管理模型连接 →</button>
    {failoverNotice && <div role="status"><p>已开启主叙事备用切换，失败重试与切换可能产生额外 API 消耗。</p><button className="secondary" disabled={busy} onClick={() => { option({ failoverEnabled: false }); setFailoverNotice(false); notify('已撤销自动开启备用切换。') }}>撤销开启备用切换</button></div>}
    <h3>对话与故事</h3>
    <div className="model-roles">{roles.map((role, index) => {
      const ids = assigned(providers, role.key)
      const inherit = role.key !== 'useForMain' && role.key !== 'useForWorldSeeding' && followsMain(providers, role.key)
      const value = inherit ? 'inherit' : ids.length === 1 ? ids[0] : (role.key === 'useForWorldSeeding') && !ids.length ? '' : 'custom'
      return <div className="task-card" key={role.key}><span className="task-number">0{index + 1}</span><b>{role.name}</b><span>{role.description}</span><select aria-label={`${role.name}模型`} disabled={busy} value={value} onChange={event => setSettings(current => ({ ...current, providers: assignTask(current.providers, role.key, event.target.value) }))}>
        {(role.key === 'useForWorldSeeding') && <option value="">暂不分配</option>}
        {role.key !== 'useForMain' && role.key !== 'useForWorldSeeding' && <option value="inherit">自动沿用主叙事</option>}
        <option value="custom" disabled>{ids.length > 1 ? '多模型 · 自定义分工' : '请选择模型连接'}</option>
        {providers.filter(provider => provider.enabled).map(provider => <option key={provider.id} value={provider.id}>{provider.model || provider.label} · {provider.label}</option>)}
      </select>
      <details className="task-backups"><summary>多模型与备用 · {ids.length} 条</summary><p className="caption">按连接优先级排列。勾选多条连接可参与此任务。</p>{providers.filter(provider => provider.enabled).map(provider => <label className="toggle" key={provider.id}><input type="checkbox" disabled={busy} aria-label={`${role.name}使用${provider.label}`} checked={provider[role.key] === true} onChange={event => {
        const checked = event.target.checked
        const autoEnable = role.key === 'useForMain' && checked && ids.length === 1 && !settings.modelOptions.failoverEnabled
        setSettings(current => toggleTaskProvider(current, role.key, provider.id, checked))
        if (autoEnable) { setFailoverNotice(true); notify('已分配第 2 条主叙事连接，自动开启备用切换；可撤销。') }
      }} /><span>{provider.label} · {provider.model}</span></label>)}</details>
      </div>
    })}</div>
    <details className="vision-settings" open><summary>图片识别与理解</summary>
      <label className="toggle"><input type="checkbox" disabled={busy} checked={settings.modelOptions.visionEnabled === true} onChange={event => option({ visionEnabled: event.target.checked })} /><div><b>开启图片理解</b><p>把照片发给角色，让故事从眼前的画面继续。</p></div></label>
      {settings.modelOptions.visionEnabled && <label>识图模型<select aria-label="识图模型" disabled={busy} value={settings.modelOptions.visionProviderId || ''} onChange={event => option({ visionProviderId: event.target.value })}><option value="">沿用主叙事 · 直接看图</option>{providers.filter(provider => provider.enabled).map(provider => <option key={provider.id} value={provider.id}>{provider.model || provider.label} · {provider.label}</option>)}</select><span className="caption">沿用主叙事会直接发送图片给所有主模型候选；文本模型请选择独立识图。独立识图模型先描述画面，再交给主叙事续写。请选择支持图片的模型，图片会发送给所选服务商，可能增加费用。</span></label>}
      {settings.modelOptions.visionEnabled && <div className="vision-capabilities">{providers.filter(provider => provider.enabled && (settings.modelOptions.visionProviderId ? provider.id === settings.modelOptions.visionProviderId : provider.useForMain)).map(provider => <label key={provider.id}>{provider.label} · 图片输入能力<select aria-label={`图片输入能力 · ${provider.label}`} disabled={busy} value={provider.imageInput || 'unknown'} onChange={event => { const imageInput = event.target.value as ModelProvider['imageInput']; setSettings(current => ({ ...current, providers: current.providers.map(row => row.id === provider.id ? { ...row, imageInput } : row) })) }}><option value="unknown">尚未确认</option><option value="supported">我确认此模型支持图片</option><option value="unsupported">不支持图片</option></select></label>)}<p className="caption">请确认所选模型支持图片。更换连接地址、协议或模型后，需要重新确认。</p></div>}
    </details>
    {children}
    </>}
    {mode === 'connections' && <><p className="caption">在这里维护服务地址、密钥和模型名称；模型的用途统一在任务分工中设置。</p><button className="secondary wide" onClick={() => onNavigate?.('tasks')}>前往任务分工 →</button>
    <details open><summary>管理模型连接 · {providers.length} 条</summary>
    <div className="provider-tabs" aria-label="模型连接">{providers.map((provider, index) => <button key={provider.id} disabled={busy} className={row?.id === provider.id ? 'active' : ''} aria-pressed={row?.id === provider.id} onClick={() => { setSelected(provider.id); setSearch('') }}><small>{String(index + 1).padStart(2, '0')}</small>{provider.label || '未命名'}{!provider.enabled && <span>已停用</span>}</button>)}<button className="add-provider" disabled={busy || providers.length >= 12} onClick={() => { const provider = { ...newProvider(), ...(providers.length ? { useForMain: false, useForCompaction: false, useForAlter: false } : {}) }; setSettings({ ...settings, providers: [...providers, provider] }); setSelected(provider.id) }}>＋ 添加连接</button></div>
    {row && <div className="provider-card"><fieldset disabled={busy} className="provider-editor">
      <div className="section-title"><b>{row.label || '未命名连接'}</b><button className="text-button danger" onClick={() => { setSettings(current => ({ ...current, providers: removeProvider(current.providers, row.id), modelOptions: { ...current.modelOptions, ...(current.modelOptions.visionProviderId === row.id ? { visionProviderId: '', visionEnabled: false } : {}) } })); setCatalogs(current => { const next = { ...current }; delete next[row.id]; return next }); notify('连接已移除，模型分工已调整。') }}>删除此连接</button></div>
      <div className="field-pair"><label>连接名称<input value={row.label} maxLength={256} onChange={event => update({ label: event.target.value })} /></label><label>供应商预设<select value={row.preset} onChange={event => choosePreset(event.target.value)}>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label></div>
      <label>API 地址<input type="url" value={row.endpoint} readOnly={row.preset !== 'custom'} onChange={event => update({ endpoint: event.target.value })} placeholder="https://…/v1" autoCapitalize="none" spellCheck={false} /></label>
      <p className="caption">支持 Base URL 或完整接口。预设地址由原 HDS 提供；中转站、百炼其他地域请选“自定义”。</p>
      {row.preset === 'custom' && <label>接口协议<select value={row.protocol} onChange={event => update({ protocol: event.target.value as ModelProvider['protocol'] })}><option value="chat-completions">OpenAI Chat Completions</option><option value="anthropic-messages">Anthropic Messages</option></select></label>}
      <label>API Key <span className="caption">{row.clearKey ? '原密钥将在保存时清除；可输入新密钥' : row.credentialPresent ? '已加密保存 · 留空保留' : '保存在手机原生加密存储'}</span><input type="password" value={row.apiKey ?? ''} onChange={event => update({ apiKey: event.target.value })} autoComplete="off" /></label>
      {row.credentialPresent && !row.clearKey && <button className="text-button" onClick={() => update({ clearKey: true, apiKey: '' })}>清除这条连接的已存密钥</button>}
      <div className="model-picker-heading"><b>选择模型</b><button className="secondary" disabled={!native || busy || !row.endpoint} onClick={() => void act(async () => { const result = await bridge.rpc({ method: 'models.list', payload: { ...row } }); const value = result.data as { models: string[]; partial: boolean }; setCatalogs(current => ({ ...current, [row.id]: value })); notify(`已获取 ${value.models.length} 个模型${value.partial ? '（部分列表，可手动输入其他模型）' : ''}。`) })}>获取模型列表</button></div>
      {catalog && <div className="model-picker"><input aria-label="筛选模型" placeholder="搜索模型名称…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="供应商模型列表" value={filtered.includes(row.model) ? row.model : ''} onChange={event => update({ model: event.target.value })}><option value="" disabled>选择模型 · {filtered.length} 个匹配</option>{filtered.map(model => <option key={model} value={model}>{model}</option>)}</select></div>}
      <label>模型名称<input value={row.model} onChange={event => update({ model: event.target.value })} placeholder="获取列表后选择，也可以手动输入" autoCapitalize="none" spellCheck={false} maxLength={256} /></label>
      <p className="caption">列表来自当前密钥的服务商，包含的模型不一定都支持聊天。列表不可用时仍可手动填写。</p>

      <details className="advanced"><summary>高级连接设置</summary><label>模型列表地址（可选）<input value={row.modelsEndpoint ?? ''} onChange={event => update({ modelsEndpoint: event.target.value })} placeholder="默认由 API 地址推导 /models" autoCapitalize="none" /></label>{row.protocol === 'chat-completions' && <label>DeepSeek 兼容思考参数<select value={row.deepseekThinking ?? 'inherit'} onChange={event => update({ deepseekThinking: event.target.value as ModelProvider['deepseekThinking'] })}><option value="inherit">跟随服务商（不额外发送参数）</option><option value="disabled">关闭思考</option><option value="enabled">开启思考</option></select><span className="caption">仅适用于支持 thinking.type 的接口。</span></label>}<label className="toggle"><input type="checkbox" checked={row.enabled} onChange={event => update({ enabled: event.target.checked })} /><div><b>启用此连接</b><p>停用后保留配置，不参与模型分工。</p></div></label><div className="actions"><button className="secondary" disabled={providers[0]?.id === row.id} onClick={() => reorder(-1)}>优先级上移</button><button className="secondary" disabled={providers.at(-1)?.id === row.id} onClick={() => reorder(1)}>下移</button></div></details>
      <button className="secondary wide" disabled={!native || busy || !row.endpoint || !row.model} onClick={() => void act(async () => { const result = await bridge.rpc({ method: 'models.test', payload: { ...row } }); notify((result.data as { message: string }).message) })}>测试聊天连接</button><p className="caption">测试会产生少量 API 费用。切换服务商后，请填写对应的密钥。</p>

    </fieldset></div>}</details>

    </>}
    {mode === 'advanced' && <details className="generation-settings" open><summary>生成与备用切换</summary>
      <button className="secondary" disabled={busy} onClick={() => { option({ mainTimeout: 90000, maxAttemptsPerProvider: 2, mobileTurnDeadlineMs: 240000, cooldownMinutes: 5, failoverEnabled: providers.filter(value => value.enabled && value.useForMain).length > 1 }); notify('已应用推荐配置：90 秒超时、失败重试 1 次、整轮 4 分钟；多条主叙事连接启用备用切换。') }}>应用推荐配置</button>
      <p className="caption">推荐 90 秒超时、失败重试 1 次、整轮 4 分钟；有多条主叙事连接时开启备用切换。</p>
      <fieldset disabled={busy}><div className="field-pair"><label>失败自动重试次数（不含首次）<input type="number" min="0" max="2" step="1" value={(settings.modelOptions.maxAttemptsPerProvider ?? 2) - 1} onChange={event => option({ maxAttemptsPerProvider: Number(event.target.value) + 1 })} /><span className="caption">重试会产生额外 API 消耗。</span></label><label>请求超时（秒）<input type="number" min="5" max="300" value={settings.modelOptions.mainTimeout / 1000} onChange={event => option({ mainTimeout: Number(event.target.value) * 1000 })} /></label></div></fieldset>
      <p className="caption">流式输出与连续消息合并统一在「聊天与输入」设置。</p><button className="text-button" onClick={() => onNavigate?.('chat')}>前往聊天与输入 →</button><label className="toggle"><input type="checkbox" disabled={busy} checked={settings.modelOptions.failoverEnabled} onChange={event => option({ failoverEnabled: event.target.checked })} /><div><b>主叙事失败时切换备用</b><p>为主叙事分配多条连接后生效；首条回复已送达时，不重发可见回复。重试与切换会产生额外 API 消耗。</p></div></label><details className="advanced"><summary>采样、输出与兼容设置</summary><fieldset disabled={busy}>
      <div className="field-pair"><label>采样温度<input type="number" min="0" max="2" step="0.1" value={settings.modelOptions.mainTemperature} onChange={event => option({ mainTemperature: Number(event.target.value) })} /></label><label>最大输出 tokens<input type="number" min="256" max="100000" step="256" value={settings.modelOptions.mainMaxTokens} onChange={event => option({ mainMaxTokens: Number(event.target.value) })} /></label></div>
      <div className="field-pair"><label>冷却时间（分钟）<input type="number" min="0" max="60" step="1" value={settings.modelOptions.cooldownMinutes ?? 5} onChange={event => option({ cooldownMinutes: Number(event.target.value) })} /></label><label>模型选择顺序<select value={settings.modelOptions.failoverStrategy} onChange={event => option({ failoverStrategy: event.target.value as ModelOptions['failoverStrategy'] })}><option value="priority">按连接优先级</option><option value="round-robin">轮询分担</option></select></label></div>
      <label>整轮时间上限（秒）<input type="number" min="60" max="600" step="1" value={(settings.modelOptions.mobileTurnDeadlineMs ?? 240000) / 1000} onChange={event => option({ mobileTurnDeadlineMs: Number(event.target.value) * 1000 })} /></label>
      <label>结构化输出<select value={settings.modelOptions.mainResponseFormat} onChange={event => option({ mainResponseFormat: event.target.value as ModelOptions['mainResponseFormat'], ...(event.target.value === 'prompt-only' ? { mainStreamingMode: 'off' } : {}) })}><option value="json-object">JSON 模式（支持流式输出）</option><option value="prompt-only">仅提示词约束（兼容模式）</option></select><small>仅提示词约束不支持流式输出，选择后会关闭聊天中的流式开关。</small></label><label>提示词排列<select value={settings.modelOptions.mainPayloadOrder} onChange={event => option({ mainPayloadOrder: event.target.value as ModelOptions['mainPayloadOrder'] })}><option value="cache-first">稳定内容优先 · 便于前缀缓存</option><option value="legacy">原始排列 · 兼容模式</option></select></label>
    </fieldset></details></details>}
  </section>
}
