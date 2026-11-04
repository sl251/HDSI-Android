import type { DiagnosticMessageEvent, Message } from '../../packages/contracts'
import { diagnosticReasons } from '../../packages/contracts/diagnostics'
import { voiceResultLabel } from '../../packages/contracts/voice'

export const diagnosticHelp = {
  not_accepted: { label: '消息未接收', advice: '故事还没有接收这条消息。先唤醒或恢复当前故事，再重试发送。' },
  background_budget: { label: '后台预算已用完', advice: '本机后台模型预算已用完。可等待预算恢复，或在空间→高级设置中调整后台预算；直接聊天不占该预算。' },
  provider_quota: { label: '连接额度耗尽', advice: '连接额度耗尽。换一个有余额的连接，或到服务商处充值。' },
  authentication: { label: '密钥无效', advice: 'API Key 无效或无权限。去模型中心检查该连接的密钥与权限，改完点“测试连接”。' },
  permission: { label: '无访问权限', advice: 'API Key 无效或无权限。去模型中心检查该连接的密钥与权限，改完点“测试连接”。' },
  rate_limit: { label: '触发限流', advice: '触发限流——短时间请求太密或额度吃紧。稍等 1-2 分钟再发；持续出现请检查该连接的额度。' },
  throttled_or_quota: { label: '限流或额度不足', advice: '触发限流——短时间请求太密或额度吃紧。稍等 1-2 分钟再发；持续出现请检查该连接的额度。' },
  timeout: { label: '请求超时', advice: '请求超时了——模型在限定时间内没回完。可把“模型中心→超时设置”调大（如 120 秒），或换一个更快的模型/连接。' },
  network: { label: '网络连接失败', advice: '连接不稳定或服务商出错。稍后会自动重试；频繁出现请检查网络，或在模型中心添加备用连接。' },
  provider_error: { label: '服务商出错', advice: '连接不稳定或服务商出错。稍后会自动重试；频繁出现请检查网络，或在模型中心添加备用连接。' },
  invalid_request: { label: '请求参数被拒绝', advice: '连接拒绝了请求参数。去模型中心检查模型名称、接口格式与生成设置，再点“测试连接”。' },
  unknown_error: { label: '原因未确认', advice: '查看下方明细，可将原因码复制反馈。' },
} satisfies Record<string, { label: string; advice: string }>
export const genericDiagnosticAdvice = '查看下方明细，可将原因码复制反馈。'
export function diagnosticAdvice(reason?: string, stage?: string, phase?: string) {
  if (stage === 'image') {
    if (phase === 'deliver' || reason === 'image_delivery') return '图片已经保存。点击“重新发送图片”即可，不会重新生图。'
    if (phase === 'download') return '图片已经生成，获取图片时遇到问题。检查网络后点击“重新获取图片”，不会重新生图。'
    if (phase === 'save') return '请检查手机剩余空间，再尝试重新保存图片。已缓存的生成结果会继续使用。'
    if (reason === 'timeout' || reason === 'network') return '先在生图服务端确认任务是否完成；提交结果未知时不要重复生成，避免重复计费。'
    return `${diagnosticReasons[reason ?? ''] ?? '查看下方生图明细。'} 在空间→语音识别与生图中检查渠道、密钥、模型和接口格式。`
  }
  return diagnosticHelp[reason as keyof typeof diagnosticHelp]?.advice ?? genericDiagnosticAdvice
}
/** Only the latest result for each retrieval connection describes its current state. */
export function latestRetrieval(events: DiagnosticMessageEvent[]) {
  const latest = new Map<string, DiagnosticMessageEvent>()
  for (const event of [...events].sort((a, b) => a.at - b.at)) if (['embedding', 'rerank'].includes(event.stage)) latest.set(`${event.stage}:${event.providerSlot ?? 0}`, event)
  return [...latest.values()]
}
export function diagnosticReasonLabel(reason?: string, stage?: string) {
  return diagnosticHelp[reason as keyof typeof diagnosticHelp]?.label ?? (reason && diagnosticReasons[reason]) ?? (stage === 'voice' && reason ? voiceResultLabel({ reason, stage }) : '原因未确认')
}
export function diagnosticDuration(ms: number) { return ms < 1000 ? '不足 1 秒' : `${(ms / 1000).toFixed(1)} 秒` }
export function diagnosticTime(at: number, now = Date.now()) {
  const seconds = Math.max(0, (now - at) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return new Date(at).toLocaleDateString('zh-CN')
}
export function diagnosticConnection(event: DiagnosticMessageEvent) {
  return event.providerLabel?.trim() || (event.providerSlot ? `连接 #${event.providerSlot}` : '连接未记录')
}
export const diagnosticSteps = [
  { stage: 'submission', name: '提交' }, { stage: 'processing', name: '处理' },
  { stage: 'model', name: '模型' }, { stage: 'decision', name: '决策' },
  { stage: 'voice', name: '语音' }, { stage: 'delivery', name: '投递' },
] as const
export type DiagnosticStep = { stage: string; name: string; state: 'missing' | 'active' | 'done' | 'failed' | 'skipped'; label: string; reason?: string }
export type DiagnosticMessage = {
  id: string; aliases: string[]; events: DiagnosticMessageEvent[]; preview: string; at: number; updatedAt: number;
  steps: DiagnosticStep[]; currentStep: number; failure?: DiagnosticMessageEvent; modelFailure?: DiagnosticMessageEvent; recovered: boolean;
}
const failed = (event: DiagnosticMessageEvent) => event.outcome === 'failed' || event.outcome === 'interrupted'
function pipeline(events: DiagnosticMessageEvent[]) {
  const lastEvents = new Map<string, DiagnosticMessageEvent>()
  const modelStart = events.map(event => event.stage === 'model' && event.outcome === 'started').lastIndexOf(true)
  events.forEach((event, index) => {
    if (index < modelStart && ['decision', 'voice', 'delivery'].includes(event.stage)) return
    const stage = event.stage === 'lifecycle' && event.outcome === 'interrupted' ? 'processing' : event.stage
    if (stage === 'processing') {
      if (index < modelStart && failed(event)) return
      const previous = lastEvents.get(stage)
      // End-of-turn cleanup is not proof that a failure recovered or a retry ran.
      if (event.outcome === 'settled' && previous && (failed(previous) || ['retry', 'requeued'].includes(previous.outcome))) return
    }
    lastEvents.set(stage, event)
  })
  const last = (stage: string) => lastEvents.get(stage)
  const decision = last('decision'), delivery = last('delivery')
  // Image jobs run independently of the text reply and may finish after its delivery.
  const imageJobs = new Map<string, DiagnosticMessageEvent>()
  for (const event of events) if (event.stage === 'image') imageJobs.set(event.mediaJobId ?? event.id, event)
  const imageFailure = [...imageJobs.values()].find(failed)
  if (imageFailure) lastEvents.set('image', imageFailure)
  const stages = events.every(event => event.stage === 'image') ? [{ stage: 'image', name: '生图' }] : events.some(event => event.stage === 'image') ? [...diagnosticSteps.slice(0, 5), { stage: 'image', name: '生图' }, diagnosticSteps[5]] : diagnosticSteps
  const steps: DiagnosticStep[] = stages.map(step => {
    const event = last(step.stage)
    if (!event) {
      if ((step.stage === 'voice' && delivery) || (['voice', 'delivery'].includes(step.stage) && decision?.outcome === 'none')) return { ...step, state: 'skipped', label: '本轮跳过' }
      return { ...step, state: 'missing', label: step.stage === 'delivery' && decision?.outcome === 'delayed' ? '等待后续投递' : '未记录' }
    }
    if (failed(event)) return { ...step, state: 'failed', label: diagnosticReasonLabel(event.reason, step.stage), reason: event.reason }
    if (event.outcome === 'skipped') return { ...step, state: 'skipped', label: '本轮跳过' }
    if (['started', 'queued', 'retry', 'requeued'].includes(event.outcome)) return { ...step, state: 'active', label: event.outcome === 'retry' ? '等待重试' : '进行中' }
    return { ...step, state: 'done', label: event.outcome === 'none' ? '本轮不回复' : event.outcome === 'delayed' ? '稍后回复' : event.outcome === 'unknown' ? '结果未确认' : '已完成' }
  })
  // Wrapper failures may omit the cause; prefer the classified model failure.
  const modelFailure = last('model') && failed(last('model')!) ? last('model') : undefined
  const failures = steps.flatMap(step => step.state === 'failed' ? [last(step.stage)!] : [])
  const failure = modelFailure ?? failures.find(event => event.reason) ?? failures[0]
  let currentStep = failure ? Math.max(0, steps.findIndex(step => step.stage === failure.stage || (failure.stage === 'lifecycle' && step.stage === 'processing'))) : steps.reduce((index, step, current) => step.state !== 'missing' && step.state !== 'skipped' ? current : index, -1)
  if (!failure && !delivery && decision?.outcome === 'delayed') currentStep = steps.findIndex(step => step.stage === 'delivery')
  if (!failure && last('image') && (!delivery || last('image')!.at > delivery.at)) currentStep = steps.findIndex(step => step.stage === 'image')
  return { steps, currentStep: Math.max(0, currentStep), failure, modelFailure, recovered: !modelFailure && events.some(event => event.stage === 'model' && failed(event)) && last('model')?.outcome === 'succeeded' }
}

/** A merged turn shares events across its input cards. Never correlate by time. */
export function aggregateDiagnosticMessages(input: DiagnosticMessageEvent[], messages: Message[] = []): DiagnosticMessage[] {
  const events = [...new Map(input.map(event => [event.id, event])).values()].sort((a, b) => a.at - b.at)
  const replyRequests = new Map<string, Set<string>>()
  for (const event of events) if (event.messageId && event.requestIds.length) {
    const ids = replyRequests.get(event.messageId) ?? new Set<string>()
    event.requestIds.forEach(id => ids.add(id)); replyRequests.set(event.messageId, ids)
  }
  const groups = new Map<string, DiagnosticMessageEvent[]>()
  for (const event of events) {
    const ids = event.requestIds.length ? event.requestIds : event.mediaJobId ? [event.mediaJobId] : event.messageId ? [...(replyRequests.get(event.messageId) ?? [event.messageId])] : [`event:${event.id}`]
    for (const id of new Set(ids)) { const group = groups.get(id) ?? []; group.push(event); groups.set(id, group) }
  }
  const history = new Map(messages.map(message => [message.id, message]))
  return [...groups].map(([id, rows]) => {
    const aliases = [...new Set([id, ...rows.flatMap(event => [event.messageId, event.mediaJobId].filter((id): id is string => !!id))])]
    const message = history.get(id) ?? aliases.map(alias => history.get(alias)).find(Boolean)
    const text = message?.content.trim()
    const purpose = rows.find(event => event.mediaPurpose)?.mediaPurpose
    const preview = text ? [...text].slice(0, 40).join('') + ([...text].length > 40 ? '…' : '') : message ? '图片或语音消息' : rows.some(event => event.mediaJobId === id) ? `${({ chat: '聊天配图', feed: '动态配图', avatar: '头像生成', preview: '图片预览' } as Record<string, string>)[purpose ?? ''] ?? '生图任务'} #${id.slice(-12)}` : id.startsWith('event:') ? '未关联消息的记录' : `消息 #${id.slice(0, 8)}（正文不在当前聊天记录中）`
    return { id, aliases, events: rows, preview, at: rows[0].at, updatedAt: rows.at(-1)!.at, ...pipeline(rows) }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}
export type DiagnosticView = 'all' | 'failed' | 'latest' | 'images'
export function visibleDiagnosticMessages(messages: DiagnosticMessage[], view: DiagnosticView, focus = '') {
  const filtered = messages.filter(message => view === 'failed' ? !!message.failure : view === 'images' ? message.events.some(event => event.stage === 'image') : true)
  const visible = filtered.slice(0, view === 'latest' ? 20 : 200)
  const target = focus ? filtered.find(message => message.aliases.includes(focus)) : undefined
  if (target && !visible.includes(target)) visible.splice(visible.length - 1, 1, target)
  return visible
}
export function diagnosticsEmptyText(focus = '', view: DiagnosticView = 'all') {
  return focus ? '这条消息暂无保留的诊断记录。' : view === 'failed' ? '一切正常，暂无失败记录' : view === 'images' ? '暂无图片任务记录。角色决定生图后，可在这里查看全过程。' : '一切正常，暂无诊断记录'
}
