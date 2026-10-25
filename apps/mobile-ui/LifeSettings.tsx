import React, { useEffect, useRef, useState } from 'react'
import schema from '../../packages/contracts/mobile-config.schema.json'
import type { MobileConfig, NativeBridge } from '../../packages/contracts'

const names: Record<string, string> = { runtime: '固定节奏', urge: '弹性推进', agency: '主动联系', schedulePreplan: '日程预排', timelineDirector: '时间导演', chatActions: 'QQ 聊天动作', alterSystem: '情绪变化', memory: '记忆整理', embedding: '长期记忆向量检索', weather: '天气', worldSeeder: '世界事件', longHorizon: '长线叙事' }
const expressions: Record<string, string> = { like: '赞', smile: '微笑', laugh: '笑', heart: '爱心', surprised: '惊讶', sad: '难过', angry: '生气', sweat: '流汗', awkward: '尴尬' }
const choices: Record<string, string> = { low: '低频', medium: '中频', high: '高频', custom: '自定义（沿用中频）', strict: '严格', natural: '自然', balanced: '平衡', stable: '稳定规律', contextual: '阶段例外', granular: '少量变化', subtle: '轻微', moderate: '适中', strong: '较强' }
// Short labels keep the imported controls usable on a phone. Schema descriptions
// remain the accessible names and the source of validation/defaults.
const compactFields: Record<string, string> = {
  horizonDays: '预排天数', variationLevel: '变化颗粒度', candidateActivationProbability: '候选激活概率', candidateRevealMinutes: '提前揭示（分钟）', reviewAfterLocalHour: '每日审查起始小时', anchorAutoAdvance: '在日程节点推进',
  backgroundIntervalMinutes: '记忆检查周期（分钟）', sceneEntryThreshold: '整理触发条目数', sceneCharacterThreshold: '整理触发字数', recentEntryLimit: '最近原始条目上限', factLimit: '长期事实上限',
  cadenceMinutes: '检查周期（分钟）', maxPending: '挂起事件上限', dailyCap: '每日事件上限', maxHorizonHours: '最远发生时间（小时）', temperature: '生成温度', maxTokens: '输出上限（tokens）', timeout: '超时（毫秒）',
  triggerScore: '首次审查分数', reviewIncrement: '后续审查新增分数', intensity: '指导强度',
  latitude: '纬度', longitude: '经度', autoFromLocation: '从故事地点自动定位', skipFantasyWorld: '架空世界跳过天气',
}
type StoryPatch = { character?: { name?: string; profile?: string }; user?: { profile?: string }; [field: string]: unknown }
export type PresetPreview = { config: MobileConfig; code: string; title: string; revision: number; fingerprint: string; removed: string[]; storyPatch?: StoryPatch; changes: { section: string; field: string; before: unknown; after: unknown }[] }
export const storyFields = (setting?: StoryPatch): Record<string, unknown> => ({
  '角色名': setting?.character?.name, '角色人设': setting?.character?.profile, '用户人设': setting?.user?.profile,
  '世界': setting?.world, '关系': setting?.relationship, '视角': setting?.perspective, '视角列表': setting?.perspectives,
  '补充事实': setting?.supplementaryFacts, '配角': setting?.supportingCast, '地点': setting?.location, '文风': setting?.style, '时区': setting?.timezone,
})
type Budget = { limit: number; used: number; exhausted: boolean; resumesAt: number | null }
function NumericField({ value, array, min, max, step, change, label }: { value: unknown; array: boolean; min?: number; max?: number; step?: number; change: (value: unknown) => void; label: string }) {
  const format = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '')
  const [draft, setDraft] = useState(format(value))
  const [error, setError] = useState('')
  useEffect(() => { setDraft(format(value)); setError('') }, [JSON.stringify(value)])
  return <><input aria-label={label} type={array ? 'text' : 'number'} value={draft} min={min} max={max} step={step ?? 'any'} onChange={event => setDraft(event.target.value)} onBlur={() => {
    const values = array ? (draft.trim() ? draft.split(/[,，\s]+/).filter(Boolean).map(Number) : []) : [Number(draft)]
    if ((!array && !draft.trim()) || values.length > 12 || values.some(item => !Number.isFinite(item) || item < (min ?? -Infinity) || item > (max ?? Infinity) || ((array || step === 1) && !Number.isInteger(item)))) { setError('数值超出范围，尚未保存'); return }
    setError(''); change(array ? values : values[0])
  }} />{error && <small role="alert">{error}</small>}</>
}
export function LifeSettings({ value = {}, change, bridge, healthy, native, notify, area, openRetrieval }: { openRetrieval?: () => void; area?: 'daily' | 'world' | 'system' | 'advanced'; value?: MobileConfig; change: (value: MobileConfig) => void; bridge: NativeBridge; healthy: boolean; native: boolean; notify: (text: string) => void }) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<PresetPreview | null>(null)
  const [importPersona, setImportPersona] = useState(true)
  const [storyBefore, setStoryBefore] = useState<Record<string, unknown>>({})
  const [working, setWorking] = useState(false)
  const currentValue = useRef(value)
  currentValue.current = value
  useEffect(() => {
    if (!healthy || !native) { setBudget(null); return }
    let cancelled = false
    const poll = () => bridge.rpc({ method: 'config.status' }).then(result => { if (!cancelled) setBudget((result.data as { budget: Budget }).budget ?? null) }).catch(() => {})
    void poll(); const timer = setInterval(() => { if (!document.hidden) void poll() }, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [healthy, native])
  const update = (section: string, key: string, item: unknown) => change({ ...value, sections: { ...value.sections, [section]: { ...value.sections?.[section], [key]: item } } })
  const sync = async (apply: boolean) => {
    setWorking(true)
    const startedWith = JSON.stringify(value)
    try {
      const result = await bridge.rpc({ method: 'preset.sync', payload: { code, current: value, ...(apply && preview ? { fingerprint: preview.fingerprint } : {}) } })
      const next = result.data as PresetPreview
      let before: Record<string, unknown> = {}
      if (!apply && next.storyPatch) {
        const snapshot = await bridge.rpc({ method: 'story.snapshot' })
        before = storyFields((snapshot.data as { story: { setting: StoryPatch } }).story.setting)
      }
      if (JSON.stringify(currentValue.current) !== startedWith) throw new Error('检查期间生活设置已修改，请重新检查；你的修改已保留。')
      if (apply) {
        if (importPersona && next.storyPatch) await bridge.rpc({ method: 'story.applySetting', payload: next.storyPatch })
        change(next.config); setPreview(null)
        notify(importPersona && next.storyPatch ? '角色人设已导入当前故事；生活设置自动保存后重启生效。' : '预设已加入生活设置；自动保存后重启生效。')
      } else { setStoryBefore(before); setImportPersona(true); setPreview(next) }
    } catch (error) { setPreview(null); notify(error instanceof Error ? error.message : '检查预设失败') }
    finally { setWorking(false) }
  }
  const areas: Record<string, string[]> = { daily: ['agency', 'alterSystem'], advanced: ['runtime', 'urge', 'chatActions', 'schedulePreplan', 'timelineDirector', 'memory', 'worldSeeder', 'longHorizon', 'weather'], world: ['schedulePreplan', 'timelineDirector', 'memory', 'worldSeeder', 'longHorizon', 'weather'], system: [] }
  const selectedSections = schema.sections.filter(section => !['embedding', 'rerank'].includes(section.key) && (!area || areas[area].includes(section.key)))
  return <section className="life-settings accordion">
    {!area && <h2>生活节奏与表达</h2>}
    {(!area || area === 'advanced') && <details data-config-section="budget"><summary>后台预算<span className="tag">{value.backgroundLimit ?? 120} 次 / 日</span></summary>
      <label>24 小时后台模型请求上限<NumericField value={value.backgroundLimit ?? 120} array={false} min={0} max={10000} step={1} label="24 小时后台模型请求上限" change={item => change({ ...value, backgroundLimit: item as number })} /></label>
      <p className="caption">滚动 24 小时统计，0 为不限。失败与重试计数，重启不清零；直接聊天和手动整理不占后台额度。修改自动保存，重启后生效。</p>
      {budget && <p role="status">已用 {budget.used} / {budget.limit || '不限'} 次{budget.exhausted ? ` · 后台额度已用完，最早 ${new Date(budget.resumesAt!).toLocaleString()} 恢复` : ''}</p>}
    </details>}
    {selectedSections.map(section => {
      const enabledField = section.fields.find(field => field.key === 'enabled')
      const enabled = (value.sections?.[section.key]?.enabled ?? enabledField?.default) === true
      const frequency = value.sections?.[section.key]?.frequency ?? 'medium'
      const badge = !enabledField ? '固定间隔' : `${enabled ? '已开启' : '已关闭'}${section.key === 'urge' ? ` · ${choices[String(frequency)]}` : section.key === 'memory' ? ` · ${value.sections?.memory?.recentEntryLimit ?? 20} 条` : section.key === 'longHorizon' ? ` · ${choices[String(value.sections?.longHorizon?.intensity ?? 'subtle')]}` : ''}`
      return <details key={section.key} data-config-section={section.key}><summary><span>{names[section.key]}</span><span className="tag">{badge}</span></summary>
        {enabledField && <label className="toggle"><input type="checkbox" checked={enabled} onChange={event => update(section.key, 'enabled', event.target.checked)} /><span>{areas.world.includes(section.key) ? `启用${names[section.key]}` : enabledField.description}</span></label>}
        <p className="caption">{section.key === 'timelineDirector' ? '默认开启；仅在自动生活回合运行，持续生活总开关仍优先。' : '修改自动保存，重启后生效。'}</p>
        {section.fields.length > 1 && <details className="advanced"><summary>高级<span className="tag">参数</span></summary>
      <div className={areas.world.includes(section.key) ? 'config-fields' : undefined}>{section.fields.filter(field => field.key !== 'enabled' && !(section.key === 'runtime' && field.key === 'userMessageDebounceSeconds') && !(section.key === 'embedding' && field.key === 'providerId')).map(field => {
        const item = value.sections?.[section.key]?.[field.key] ?? field.default
        const f = field as typeof field & { min?: number; max?: number; step?: number; options?: string[]; itemOptions?: string[]; itemMin?: number; itemMax?: number }
        const label = `${names[section.key]} · ${field.description}`
        const displayLabel = areas.world.includes(section.key) ? compactFields[field.key] ?? field.description : field.description
        if (field.type === 'array' && f.itemOptions) return <fieldset key={field.key}><legend>{field.description}</legend>{f.itemOptions.map(option => <label className="toggle" key={option}><input type="checkbox" aria-label={`${names[section.key]} · ${field.key} · ${expressions[option] ?? option}`} checked={Array.isArray(item) && item.includes(option)} onChange={event => update(section.key, field.key, event.target.checked ? [...(Array.isArray(item) ? item : []), option] : (Array.isArray(item) ? item : []).filter(value => value !== option))} /><span>{expressions[option] ?? option}</span></label>)}</fieldset>
        return <label key={field.key} className={field.type === 'boolean' ? 'toggle' : ''}>
          {field.type === 'boolean' ? <><input type="checkbox" checked={item === true} onChange={event => update(section.key, field.key, event.target.checked)} /><span>{section.key === 'embedding' ? field.key === 'enabled' ? '长期记忆向量检索' : '对话中实时检索' : displayLabel}</span></>
          : <><span>{displayLabel}</span>{field.type === 'union' ? <select aria-label={label} value={String(item)} onChange={event => update(section.key, field.key, event.target.value)}>{f.options?.map(option => <option key={option} value={option}>{choices[option] ?? option}</option>)}</select>
          : field.type === 'string' ? <input value={String(item)} onChange={event => update(section.key, field.key, event.target.value)} /> : <NumericField label={label} value={item} array={field.type === 'array'} min={f.min ?? f.itemMin} max={f.max ?? f.itemMax} step={f.step} change={next => update(section.key, field.key, next)} />}</>}
        </label>
      })}</div>

        {section.key === 'memory' && <p className="caption">原始条目与事实默认 20 条，上限 20 条。向量检索的开关、连接与模型统一在「任务分工 → 向量与重排序」设置。</p>}
        {section.key === 'memory' && openRetrieval && <button onClick={openRetrieval}>配置向量与重排序</button>}
        {section.key === 'worldSeeder' && <p className="caption">事件源为外部事件与配角；需在「任务分工」指定世界播种模型。</p>}
        {section.key === 'longHorizon' && <p className="caption">审查周期由新增叙事证据分数决定；指导强度控制长期方向的表达程度。</p>}
        {section.key === 'runtime' && <p className="caption">承诺最长 12 小时。扫描用于漏唤醒后的兜底，不会唤醒被系统强制停止的应用；显式约定仍受预算与暂停约束。</p>}
        </details>}
      </details>
    })}
    {(!area || area === 'world') && <>
    <details><summary>从分享码同步生活配置</summary><p className="caption">同步这里支持的生活字段，可同时导入角色人设到当前故事。模型连接、总开关和预算保持你的设置。预设中的其他分区会列为忽略。</p>
      <label>typ0.space 分享码<input value={code} disabled={working} maxLength={24} onChange={event => { setCode(event.target.value); setPreview(null) }} /></label>
      <button disabled={!native || !healthy || working || !code.trim()} onClick={() => void sync(false)}>检查预设差异</button>
      {!healthy && <p className="caption">先唤醒故事，即可检查分享码。</p>}
      {preview && <div><h3>{preview.title} · 修订 {preview.revision}</h3>
        <ul>{preview.changes.map(row => <li key={`${row.section}.${row.field}`}>{names[row.section]} · {row.field}：{JSON.stringify(row.before) ?? '默认'} → {JSON.stringify(row.after)}</li>)}</ul>
        {preview.storyPatch && <><h4>角色人设</h4><ul>{Object.entries(storyFields(preview.storyPatch)).filter(([, after]) => Array.isArray(after) ? after.length > 0 : typeof after === 'string' && !!after.trim()).map(([label, after]) => <li key={label}>{label}：{JSON.stringify(storyBefore[label]) ?? '未设置'} → {JSON.stringify(after)}</li>)}</ul>
          <label className="toggle"><input type="checkbox" checked={importPersona} disabled={working} onChange={event => setImportPersona(event.target.checked)} /><span>同时导入角色人设</span></label></>}
        {preview.removed.length > 0 && <p className="caption">已忽略：{preview.removed.join('、')}</p>}
        <button disabled={working} onClick={() => void sync(true)}>应用到生活设置</button>
      </div>}
      <button disabled={!native || !healthy || working} onClick={async () => { try { const result = await bridge.rpc({ method: 'preset.syncStatus', payload: { current: value } }); notify((result.data as { restartRequired: boolean }).restartRequired ? '生活设置与当前运行配置不同，请保存并重启。' : '生活设置已在当前核心加载。') } catch (error) { notify(String(error)) } }}>检查重载状态</button>
    </details>
    </>}
  </section>
}
