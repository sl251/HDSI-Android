import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicState } from './atomic-state'
import { imagePrompt } from './experience-config'
import { boundedResponse, imageResult, imageResponse, imageSize, imageApi, geminiImageEndpoint, mediaJson, MediaError, mediaFailure } from './image-provider'
import { currentDiagnosticIds, type MessageDiagnostics } from './message-diagnostics'
import type { ExperienceSettings, MediaConnection, MediaJob } from '../packages/contracts/experience'
export { boundedResponse, imageResult } from './image-provider'

type Job = MediaJob & { route?: Omit<MediaConnection, 'apiKey'>; references?: string[]; ratio?: string; submission?: boolean; requestIds?: string[] }
const refused = (status: number) => [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(status)
const hasRemoteResult = (job: Job) => job.kind === 'image' && !!(job.providerTaskId || job.imageUrl)
const uncertainSubmission = (job: Job) => !!job.submission && !hasRemoteResult(job) && !job.imageId && job.status !== 'ready'
export function mediaEndpoint(base: string, suffix: string) {
  const url = new URL(base)
  const path = url.pathname.replace(/\/$/, '').replace(/\/(?:chat\/completions|audio\/transcriptions|images\/(?:generations|edits))$/, '')
  url.pathname = `${path || '/v1'}/${suffix}`
  return url.href
}
export function mediaJobs(options: { directory: string; identity?: string; paused?: boolean; audioDirectory?: string; diagnostics?: MessageDiagnostics; config: () => ExperienceSettings; getImage: (id: string) => string; saveImage: (bytes: Buffer) => { id: string }; delivered: (job: MediaJob) => Promise<void>; fetch?: typeof fetch }) {
  const db = atomicState<{ jobs: Job[] }>(join(options.directory, 'media-jobs.json'), () => ({ jobs: [] }))
  const request = options.fetch ?? fetch
  let stopped = false
  let paused = options.paused === true
  const active = new Map<string, AbortController>()
  const interrupted = new Set<string>()
  const tasks = new Set<Promise<unknown>>()
  const track = (task: Promise<unknown>) => { tasks.add(task); void task.then(() => tasks.delete(task), () => tasks.delete(task)) }
  const update = (id: string, change: Partial<Job>) => db.change(s => { const job = s.jobs.find(j => j.id === id); if (!job) throw new Error('任务不存在'); Object.assign(job, change); return { ...job } })
  const ids = (entryId?: number) => [...new Set([...currentDiagnosticIds(options.diagnostics), ...(entryId === undefined ? [] : options.diagnostics?.requestIdsForEntries([entryId]) ?? [])])]
  const record = (job: Pick<Job, 'id' | 'kind' | 'purpose' | 'route' | 'requestIds'>, outcome: string, phase = 'prepare', error?: MediaError, started?: number, epoch = options.diagnostics?.epoch) => {
    if (job.kind !== 'image' || !options.diagnostics || epoch !== options.diagnostics.epoch) return
    try {
      const route = job.route ?? options.config().image
      options.diagnostics.record(job.requestIds ?? [], 'image', outcome, { mediaJobId: job.id, mediaPurpose: job.purpose, mediaProvider: route.provider,
        mediaApi: route.provider === 'imagefree' ? 'imagefree' : route.endpoint ? imageApi(route) : undefined,
        mediaPhase: phase, reason: error?.reason, httpStatus: error?.status, elapsedMs: started === undefined ? undefined : Date.now() - started })
    } catch { /* Diagnostics must not fail a media task. */ }
  }
  db.change(s => { for (const job of s.jobs) if (['queued', 'running', 'submitted'].includes(job.status)) job.status = hasRemoteResult(job) ? 'submitted' : uncertainSubmission(job) ? 'unknown' : 'queued' })
  const publicJob = ({ route, references, ratio, submission, requestIds, ...job }: Job): MediaJob => job
  const deliver = async (job: Job, epoch = options.diagnostics?.epoch) => {
    if (stopped || paused) return
    const started = Date.now()
    record(job, 'started', 'deliver', undefined, undefined, epoch)
    try { await options.delivered(publicJob(job)); update(job.id, { delivered: true, error: undefined }); record(job, 'succeeded', 'deliver', undefined, started, epoch) }
    catch { const error = new MediaError('image_delivery'); update(job.id, { error: paused || interrupted.has(job.id) ? undefined : error.message }); record(job, 'failed', 'deliver', error, started, epoch) }
  }
  const run = async (initial: Job) => {
    if (stopped || paused || active.has(initial.id)) return
    const controller = new AbortController(); active.set(initial.id, controller)
    const configured = initial.kind === 'image' ? options.config().image : options.config().stt
    const resuming = hasRemoteResult(initial)
    // A remote task belongs to its original provider. Retrieving it never uses another channel's key.
    const current = resuming && initial.route ? initial.route : configured
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(current.provider === 'imagefree' ? 900000 : 240000)])
    const started = Date.now(), epoch = options.diagnostics?.epoch
    let phase = 'prepare', job = initial
    const progress = (next: string) => { phase = next; record(job, 'started', phase, undefined, undefined, epoch) }
    try {
      // Bind unsent work at execution time: saving settings between enqueue and execution is safe.
      if (!resuming && !initial.submission) {
        const { apiKey, ...route } = configured
        job = update(initial.id, { route })
      }
      progress('prepare')
      if (uncertainSubmission(initial)) throw new MediaError('media_submission_unknown')
      if (!resuming && !current.enabled) throw new MediaError('media_disabled')
      job = update(initial.id, { status: 'running', error: undefined })
      const apiKey = !resuming ? configured.apiKey : undefined
      const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
      if (job.kind === 'stt') {
        if (!options.audioDirectory || !/^[a-f0-9]{64}$/.test(job.audioId ?? '')) throw new Error('录音不存在')
        const bytes = readFileSync(join(options.audioDirectory, `${job.audioId}.wav`))
        if (bytes.length > 10 * 1024 * 1024) throw new Error('录音过大')
        const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)]), 'recording.wav'); body.append('model', current.model)
        update(job.id, { submission: true })
        const response = await request(mediaEndpoint(current.endpoint, 'audio/transcriptions'), { method: 'POST', headers, body, signal, redirect: 'error' })
        if (refused(response.status)) update(job.id, { submission: false })
        const data = mediaJson(await boundedResponse(response, 1024 * 1024))
        update(job.id, { submission: false })
        if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 12000) throw new Error('未识别到有效文字')
        job = update(job.id, { text: data.text.trim(), status: 'ready', submission: false })
      } else {
        let result: ReturnType<typeof imageResult> = { taskId: job.providerTaskId, url: job.imageUrl }
        if (!result.taskId && !result.url) {
          let body: FormData | string, endpoint: string, contentHeaders: Record<string, string> = {}
          const api = current.provider === 'imagefree' ? 'imagefree' : imageApi(current)
          if (api === 'imagefree') {
            endpoint = 'https://imagefree.net/api/generate'; body = JSON.stringify({ prompt: job.prompt, aspect_ratio: job.ratio, turnstile_token: null }); contentHeaders = { 'Content-Type': 'application/json' }
          } else if (api === 'chat' || api === 'gemini') {
            const references = current.referenceImages ? (job.references ?? []).map(id => options.getImage(id)) : []
            contentHeaders = { 'Content-Type': 'application/json' }
            if (api === 'gemini') {
              endpoint = geminiImageEndpoint(current.endpoint, current.model)
              if (apiKey) contentHeaders['x-goog-api-key'] = apiKey
              if (new URL(endpoint).hostname === 'generativelanguage.googleapis.com') delete headers.Authorization
              const parts = [{ text: job.prompt }, ...references.map(uri => { const [meta, data] = uri.split(','); return { inlineData: { mimeType: meta.slice(5).split(';')[0], data } } })]
              body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: job.ratio } } })
            } else {
              endpoint = mediaEndpoint(current.endpoint, 'chat/completions')
              body = JSON.stringify({ model: current.model, stream: false, messages: [{ role: 'user', content: [{ type: 'text', text: job.prompt }, ...references.map(url => ({ type: 'image_url', image_url: { url } }))] }], modalities: ['text', 'image'], image_config: { aspect_ratio: job.ratio } })
            }
          } else if (job.references?.length && current.referenceImages) {
            endpoint = mediaEndpoint(current.endpoint, 'images/edits')
            const form = new FormData(); form.append('model', current.model); form.append('prompt', job.prompt!); form.append('n', '1')
            for (const id of /dall-e-2/i.test(current.model) ? job.references.slice(0, 1) : job.references) { const uri = options.getImage(id); const [meta, content] = uri.split(','); form.append(/dall-e-2/i.test(current.model) ? 'image' : 'image[]', new Blob([Buffer.from(content, 'base64')], { type: meta.slice(5).split(';')[0] }), `${id}.${meta.includes('jpeg') ? 'jpg' : meta.includes('webp') ? 'webp' : 'png'}`) }
            body = form
          } else {
            endpoint = mediaEndpoint(current.endpoint, 'images/generations'); contentHeaders = { 'Content-Type': 'application/json' }
            const size = imageSize(current.model, job.ratio)
            body = JSON.stringify({ model: current.model, prompt: job.prompt, n: 1, size })
          }
          progress('submit'); update(job.id, { submission: true })
          const response = await request(endpoint, { method: 'POST', headers: { ...headers, ...contentHeaders }, body, signal, redirect: 'error' })
          // Explicit server refusal is safe to retry after configuration is fixed.
          if (refused(response.status)) update(job.id, { submission: false })
          const bytes = await boundedResponse(response)
          const parsed = imageResponse(bytes, response.headers.get('content-type') ?? '')
          result = parsed
          if (!result.taskId && !result.url && !result.bytes && !result.failed) {
            // A completed synchronous response with no image is a visible failure, not an async job.
            if (parsed.completed) update(job.id, { submission: false })
            throw new MediaError('image_empty')
          }
          if (result.taskId) update(job.id, { providerTaskId: result.taskId, status: 'submitted' })
          if (result.url) update(job.id, { imageUrl: result.url })
        }
        if (result.taskId && !result.bytes && !result.url && !result.failed) progress('poll')
        while (result.taskId && !result.bytes && !result.url && !result.failed) {
          if (current.provider !== 'imagefree') throw new MediaError('image_async')
          await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(new Error('任务等待中断')) }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 3000); if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }) })
          const data = mediaJson(await boundedResponse(await request(`https://imagefree.net/api/generate/status?taskId=${encodeURIComponent(result.taskId)}`, { signal, redirect: 'error' })))
          const next = imageResult(data)
          if (['completed', 'succeeded'].includes(data?.status) && !next.bytes && !next.url && !next.failed) throw new MediaError('image_empty')
          result = { taskId: result.taskId, ...next }
        }
        if (result.failed) { update(job.id, { submission: false, providerTaskId: undefined, imageUrl: undefined }); throw new MediaError(result.reason === 'unknown_error' || !result.reason ? 'provider_error' : result.reason) }
        if (result.url) {
          progress('download')
          const url = new URL(result.url)
          if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new MediaError('image_download')
          update(job.id, { imageUrl: result.url })
          result.bytes = await boundedResponse(await request(result.url, { signal, redirect: 'error' }))
        }
        if (!result.bytes) throw new MediaError('image_empty')
        progress('save')
        let asset: { id: string }
        try { asset = options.saveImage(result.bytes) } catch { throw new MediaError('image_save') }
        job = update(job.id, { imageId: asset.id, status: 'ready', submission: false })
        record(job, 'succeeded', phase, undefined, started, epoch)
      }
      if (!stopped && !paused && !job.delivered) await deliver(job, epoch)
    } catch (error) {
      const job = db.read().jobs.find(j => j.id === initial.id)!
      const failure = signal.aborted ? new MediaError('timeout') : mediaFailure(error)
      const unknown = job.submission && !job.providerTaskId && !job.imageUrl
      const held = paused || interrupted.has(job.id)
      update(job.id, { status: unknown ? 'unknown' : held ? hasRemoteResult(job) ? 'submitted' : job.imageId || job.text ? 'ready' : 'queued' : 'failed', error: held && !unknown ? undefined : `${failure.message}${unknown ? ' 提交结果待确认，请勿重复生成；先在服务端核实。' : ''}` })
      record(job, 'failed', phase, failure, started, epoch)
    } finally { active.delete(initial.id); interrupted.delete(initial.id) }
  }
  const timer = setInterval(() => {
    if (stopped || paused) return
    const rows = db.read().jobs
    // Interactive transcription has its own worker; slow image generation cannot block input.
    for (const kind of ['stt', 'image'] as const) {
      if (rows.some(job => job.kind === kind && active.has(job.id))) continue
      const job = rows.find(j => j.kind === kind && (['queued', 'submitted'].includes(j.status) || j.status === 'ready' && !j.delivered && !j.error))
      if (job?.status === 'ready') { active.set(job.id, new AbortController()); track(deliver(job).finally(() => { active.delete(job.id); interrupted.delete(job.id) })) }
      else if (job) track(run(job))
    }
  }, 500)
  return {
    setPaused(value: boolean) { paused = value; if (paused) for (const [id, controller] of active) { interrupted.add(id); controller.abort() } },
    list: () => db.read().jobs.slice(-100).map(publicJob),
    latestAutonomousImageWasRejected() {
      const last = db.read().jobs.reverse().find(job => job.kind === 'image' && ['chat', 'feed'].includes(job.purpose))
      return !!last && last.status === 'failed' && !last.submission && !hasRemoteResult(last) && !last.imageId
    },
    skipped(input: { id: string; purpose: MediaJob['purpose']; entryId: number }, reason: string) { record({ ...input, kind: 'image', requestIds: ids(input.entryId) }, 'skipped', 'prepare', new MediaError(reason)) },
    create(input: Partial<MediaJob> & { id: string; kind: 'image' | 'stt'; purpose: MediaJob['purpose']; entryId?: number }) {
      const requestIds = ids(input.entryId)
      try {
        if (stopped || paused) throw new Error('故事已暂停，请先恢复运行')
        if (!/^[\w:-]{8,160}$/.test(input.id)) throw new MediaError('media_input')
        const old = db.read().jobs.find(j => j.id === input.id); if (old) return publicJob(old)
        const config = options.config(), route = input.kind === 'image' ? config.image : config.stt
        if (!route.enabled) throw new MediaError('media_disabled')
        if (db.read().jobs.some(j => ['queued', 'submitted', 'running'].includes(j.status) && j.kind === input.kind)) throw new MediaError('media_pending')
        if (input.kind === 'image' && (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 3000)) throw new MediaError('media_input')
        if (input.kind === 'stt' && (!/^[a-f0-9]{64}$/.test(input.audioId ?? '') || !Number.isFinite(input.duration) || input.duration! <= 0 || input.duration! > 180)) throw new Error('录音参数无效')
        const { apiKey, ...publicRoute } = route
        const job: Job = { id: input.id, kind: input.kind, purpose: input.purpose, at: new Date().toISOString(), status: 'queued', route: publicRoute, requestIds, prompt: input.kind === 'image' ? imagePrompt({ ...config, visual: { ...config.visual, appearance: config.visual.appearance || options.identity || '' } }, input.prompt!) : undefined, caption: String(input.caption ?? '').slice(0, 2000), audioId: input.audioId, duration: input.duration, ratio: input.purpose === 'avatar' ? '1:1' : config.visual.ratio, references: [...config.visual.references] }
        db.change(s => { if (s.jobs.length >= 500) s.jobs = s.jobs.filter(j => !j.delivered).concat(s.jobs.filter(j => j.delivered).slice(-200)); s.jobs.push(job) })
        record(job, 'queued')
        return publicJob(job)
      } catch (error) { record({ ...input, requestIds }, 'failed', 'prepare', mediaFailure(error)); throw error }
    },
    retry(id: string) {
      if (stopped || paused) throw new Error('故事已暂停，请先恢复运行')
      const job = db.read().jobs.find(j => j.id === id)
      if (!job) throw new Error('任务不存在')
      if (job.delivered || active.has(id) || ['queued', 'running', 'submitted'].includes(job.status)) return
      if (job.status === 'unknown' || uncertainSubmission(job)) throw new Error('提交结果未知，不能安全重复生成；请先在服务端确认')
      const { apiKey, ...route } = job.kind === 'image' ? options.config().image : options.config().stt
      const updated = update(id, { status: job.status === 'ready' ? 'ready' : 'queued', error: undefined, ...(!job.submission && !job.providerTaskId && !job.imageUrl ? { route } : {}) })
      record(updated, 'queued')
    },
    async stop() { stopped = true; clearInterval(timer); for (const controller of active.values()) controller.abort(); await Promise.allSettled([...tasks]) },
  }
}
