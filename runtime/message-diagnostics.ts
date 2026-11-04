import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import type { DiagnosticEvent } from '../packages/contracts/diagnostics'

type Detail = Partial<Omit<DiagnosticEvent, 'id' | 'at' | 'requestIds' | 'stage' | 'outcome'>>
const context = new AsyncLocalStorage<{ store: MessageDiagnostics; ids: string[]; epoch: number; active: boolean }>()
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(value)
const code = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,80}$/.test(value)
const mediaId = (value: unknown): value is string => typeof value === 'string' && /^[\w:-]{8,160}$/.test(value)

/** Classify in memory; never persist provider response bodies, URLs or error messages. */
export function diagnosticError(error: unknown): string {
  const value = error as { code?: string; message?: string; response?: { status?: number; data?: unknown }; status?: number }
  if (value?.code === 'HDS_NOT_ACCEPTED') return 'not_accepted'
  if (value?.code === 'HDS_MOBILE_BUDGET') return 'background_budget'
  let detail = String(value?.message ?? '')
  try { detail += JSON.stringify(value?.response?.data ?? '') } catch { /* untrusted error shape */ }
  detail = detail.slice(0, 16000)
  const status = value?.response?.status ?? value?.status ?? Number(detail.match(/(?:HTTP\s*|status(?: code)?[=: ]+)([45]\d{2})/i)?.[1])
  if (/insufficient[_ -](quota|balance|credit)|quota[_ -]exceeded|credit.*exhaust|balance.*insufficient|余额不足|额度.*(用尽|不足|耗尽)/i.test(detail) || status === 402) return 'provider_quota'
  if (status === 401 || /invalid[_ -](api[_ -]?)?key|authentication_error/i.test(detail)) return 'authentication'
  if (status === 403) return 'permission'
  if (/rate[_ -]limit|too many requests|限流/i.test(detail)) return 'rate_limit'
  if (status === 429) return 'throttled_or_quota'
  if (/timeout|timed out|AbortError|超时/i.test(detail)) return 'timeout'
  if (/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(detail)) return 'network'
  if (status && status >= 500) return 'provider_error'
  if (status === 400 || status === 422) return 'invalid_request'
  return 'unknown_error'
}

export class MessageDiagnostics {
  private events: DiagnosticEvent[] = []
  private retrievalMerged = new Map<string, DiagnosticEvent>()
  epoch = 0
  storageAvailable = true
  constructor(private file: string) {
    try {
      if (statSync(file).size <= 1024 * 1024) {
        const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
        if (Array.isArray(saved)) for (const row of saved.slice(-2000)) {
          if (row && safeId(row.id) && Number.isFinite(row.at) && Array.isArray(row.requestIds) && code(row.stage) && code(row.outcome)) {
            this.events.push({ id: row.id, at: row.at, requestIds: row.requestIds.filter(safeId).slice(0, 100), stage: row.stage, outcome: row.outcome, ...this.clean(row) })
          }
        }
      }
    } catch { /* Diagnostics are optional and may not yet exist. */ }
    this.trim()
    const pending = new Map<string, DiagnosticEvent>()
    for (const event of this.events) {
      if (event.stage === 'submission' && event.reason === 'duplicate') continue
      if (event.stage === 'commit' || event.stage === 'voice' || event.stage === 'image' || (event.stage === 'model' && event.outcome === 'succeeded')) continue
      for (const id of event.requestIds) pending.set(id, event)
    }
    for (const [id, event] of pending) if (['queued', 'accepted', 'started', 'retry', 'requeued', 'delayed', 'immediate'].includes(event.outcome)) this.record([id], 'lifecycle', 'interrupted', { reason: 'restart' })
    this.save()
  }
  private clean(value: Detail): Detail {
    const result: Detail = {}
    if (safeId(value.messageId)) result.messageId = value.messageId
    if (code(value.reason)) result.reason = value.reason
    if (code(value.mode)) result.mode = value.mode
    if (mediaId(value.mediaJobId)) result.mediaJobId = value.mediaJobId
    if (['compatible', 'imagefree'].includes(value.mediaProvider ?? '')) result.mediaProvider = value.mediaProvider
    if (['images', 'chat', 'gemini', 'imagefree'].includes(value.mediaApi ?? '')) result.mediaApi = value.mediaApi
    if (['prepare', 'submit', 'poll', 'download', 'save', 'deliver'].includes(value.mediaPhase ?? '')) result.mediaPhase = value.mediaPhase
    if (['chat', 'feed', 'avatar', 'preview'].includes(value.mediaPurpose ?? '')) result.mediaPurpose = value.mediaPurpose
    for (const key of ['elapsedMs', 'attempt', 'count', 'willingness', 'entryId', 'providerSlot', 'httpStatus', 'vectorDimensions', 'resultCount'] as const) {
      const number = value[key]
      if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1e12) result[key] = number
    }
    return result
  }
  private trim() {
    const cutoff = Date.now() - 7 * 86400000
    this.events = this.events.filter(event => event.at >= cutoff).slice(-2000)
    while (Buffer.byteLength(JSON.stringify(this.events)) > 1024 * 1024) this.events.splice(0, 100)
  }
  private save() {
    this.trim()
    try { writeFileSync(this.file + '.tmp', JSON.stringify(this.events)); renameSync(this.file + '.tmp', this.file); this.storageAvailable = true }
    catch { this.storageAvailable = false }
  }
  record(ids: string[], stage: string, outcome: string, detail: Detail = {}) {
    if (!code(stage) || !code(outcome)) return
    const event = { id: randomUUID(), at: Date.now(), requestIds: [...new Set(ids.filter(safeId))].slice(0, 100), stage, outcome, ...this.clean(detail) }
    this.events.push(event)
    this.save()
    // The same sanitized event also enters Android's existing bounded runtime log.
    try { process.stdout.write(`[HDS_EVENT] ${JSON.stringify({ ...event, requestIds: event.requestIds.slice(0, 8) })}\n`) } catch { /* logging cannot fail a message */ }
  }
  retrieval(ids: string[], task: string, outcome: string, detail: Detail, epoch: number) {
    if (epoch !== this.epoch) return
    // A background call and separate messages must never inherit one another's failures.
    const scope = [...new Set(ids.filter(safeId))].sort().join(',')
    const prefix = `${task}:${detail.providerSlot ?? 0}:${scope}:`
    const key = `${prefix}${detail.reason ?? outcome}`
    const previous = this.retrievalMerged.get(key)
    if (previous && Date.now() - previous.at < 60000 && this.events.includes(previous)) {
      previous.count = (previous.count ?? 1) + 1
      this.save(); return
    }
    this.record(ids, task, outcome, { ...detail, count: 1 })
    this.retrievalMerged.set(key, this.events[this.events.length - 1])
    if (this.retrievalMerged.size > 100) this.retrievalMerged.delete(this.retrievalMerged.keys().next().value!)
    if (outcome === 'succeeded') for (const other of this.retrievalMerged.keys()) if (other.startsWith(prefix) && other !== key) this.retrievalMerged.delete(other)
    if (outcome === 'fallback') this.retrievalMerged.delete(`${prefix}succeeded`)
  }
  list(messageId?: string) {
    const before = this.events.length
    this.trim()
    if (before !== this.events.length) this.save()
    const ids = new Set(this.events.filter(row => row.messageId === messageId || row.mediaJobId === messageId).flatMap(row => row.requestIds))
    if (messageId) ids.add(messageId)
    return { events: this.events.filter(row => !messageId || row.messageId === messageId || row.mediaJobId === messageId || row.requestIds.some(id => ids.has(id))), storageAvailable: this.storageAvailable }
  }
  requestIdsForEntries(entries: number[]) {
    this.trim()
    return [...new Set(this.events.filter(event => event.stage === 'commit' && event.entryId !== undefined && entries.includes(event.entryId)).flatMap(event => event.requestIds))]
  }
  clear() { this.epoch++; this.events = []; this.retrievalMerged.clear(); this.save() }
}

export function runMessageDiagnostics<T>(store: MessageDiagnostics | undefined, ids: string[], task: () => T): T {
  // An empty scope prevents background or other-channel work inheriting a local message.
  if (!store) return task()
  const scope = { store, ids: ids.filter(safeId), epoch: store.epoch, active: true }
  return context.run(scope, () => {
    try {
      const result = task()
      if (result instanceof Promise) return result.finally(() => { scope.active = false }) as T
      scope.active = false
      return result
    } catch (error) { scope.active = false; throw error }
  })
}
export function diagnosticEvent(stage: string, outcome: string, detail: Detail = {}) {
  const scope = context.getStore()
  if (scope?.active && scope.ids.length && scope.epoch === scope.store.epoch) scope.store.record(scope.ids, stage, outcome, detail)
}
export function hasMessageDiagnostics() {
  const scope = context.getStore()
  return !!(scope?.active && scope.ids.length && scope.epoch === scope.store.epoch)
}
export function currentDiagnosticIds(store?: MessageDiagnostics) {
  const scope = context.getStore()
  return scope?.active && scope.store === store && scope.epoch === store?.epoch ? [...scope.ids] : []
}
export function withDeliveryDiagnostics<T>(store: MessageDiagnostics | undefined, entries: number[], task: () => T): T {
  if (hasMessageDiagnostics()) return task()
  return runMessageDiagnostics(store, store?.requestIdsForEntries(entries) ?? [], task)
}
export async function diagnosticCall<T>(stage: string, task: () => Promise<T>, detail: Detail = {}): Promise<T> {
  const started = Date.now()
  diagnosticEvent(stage, 'started', detail)
  try { const result = await task(); diagnosticEvent(stage, 'succeeded', { ...detail, elapsedMs: Date.now() - started }); return result }
  catch (error) { diagnosticEvent(stage, 'failed', { ...detail, reason: diagnosticError(error), elapsedMs: Date.now() - started }); throw error }
}

/** Capture scope and epoch before network IO, including background calls with no message IDs. */
export function retrievalDiagnosticRecorder(store: MessageDiagnostics, providers: { id?: string }[]) {
  const scope = context.getStore(), epoch = store.epoch
  const ids = scope?.active && scope.store === store && scope.epoch === epoch ? [...scope.ids] : []
  return (event: { task: string; status: string; providerId?: string; category?: string; httpStatus?: number; elapsedMs?: number; vectorDimensions?: number; resultCount?: number }) => {
    try {
      const index = providers.findIndex(row => row.id === event.providerId)
      store.retrieval(ids, event.task, event.status, { reason: event.category, ...(index >= 0 ? { providerSlot: index + 1 } : {}), httpStatus: event.httpStatus, elapsedMs: event.elapsedMs, vectorDimensions: event.vectorDimensions, resultCount: event.resultCount }, epoch)
    } catch { /* Diagnostics cannot fail retrieval. */ }
  }
}
