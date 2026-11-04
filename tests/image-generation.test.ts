import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultExperience } from '../packages/contracts/experience'
import { imageApi, imageResponse, imageResult, imageSize, boundedResponse, mediaFailure, downloadImage, imageLimit, imageResponseLimit } from '../runtime/image-provider'
import { imageStore } from '../runtime/media'
import { mediaJobs } from '../runtime/media-jobs'
import { normalizeExperience } from '../runtime/experience-config'
import { experienceRuntime } from '../runtime/experience-runtime'
import { MessageDiagnostics, runMessageDiagnostics } from '../runtime/message-diagnostics'
import { aggregateDiagnosticMessages, visibleDiagnosticMessages } from '../apps/mobile-ui/message-diagnostics'

const bytes = Buffer.from([255, 216, 255, 217]), base64 = bytes.toString('base64')
const uri = `data:image/jpeg;base64,${base64}`, assetId = 'a'.repeat(64)
const waitFor = async (check: () => boolean) => {
  const end = Date.now() + 10000
  while (!check()) { assert.ok(Date.now() < end, 'media task should settle'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function fixture(t: any, overrides: Record<string, any> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hds-image-generation-'))
  const config = defaultExperience()
  config.image = { enabled: true, provider: 'compatible', endpoint: 'https://provider.test/v1', model: 'gpt-image-1', apiKey: 'PRIVATE_KEY' }
  const diagnostics = new MessageDiagnostics(join(directory, 'diagnostics.json'))
  const jobs = mediaJobs({ directory, config: () => config, diagnostics, getImage: () => uri, saveImage: value => { assert.deepEqual(value, bytes); return { id: assetId } }, delivered: async () => {}, ...overrides })
  t.after(async () => { await jobs.stop(); rmSync(directory, { recursive: true, force: true }) })
  return { jobs, config, diagnostics, directory, create: () => jobs.create({ id: 'image-test-operation', kind: 'image', purpose: 'chat', prompt: 'PRIVATE_PROMPT' }) }
}

test('image response parser handles Imagefree, nested images, Markdown, chat arrays and Gemini multipart', () => {
  const url = 'https://cdn.test/result.png'
  for (const value of [{ status: 'completed', image: url }, { data: { result: { images: [url] } } }, `![image](${url})`, { choices: [{ message: { images: [{ image_url: { url } }] } }] }]) assert.equal(imageResult(value).url, url)
  for (const value of [uri, { data: [{ b64_json: base64 }] }, { choices: [{ message: { content: [{ type: 'text', text: 'done' }, { type: 'image_url', image_url: { url: uri } }] } }] }, { candidates: [{ content: { parts: [{ text: 'done' }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] } }] }, { candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }] } }] }]) assert.deepEqual(imageResult(value).bytes, bytes)
  assert.equal(imageResult({ id: 'chatcmpl-completed', object: 'chat.completion', choices: [{ message: { content: 'no image' } }] }).taskId, undefined)
  assert.equal(imageResult({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] }).reason, 'image_blocked')
  assert.equal(imageResult({ status: 'failed' }).failed, true)
})

test('SSE image responses join deltas and reject truncated or malformed streams', () => {
  const sse = ['![image](', uri, ')'].map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join('')
  assert.deepEqual(imageResponse(Buffer.from(sse + 'data: [DONE]\n\n'), 'text/event-stream').bytes, bytes)
  assert.throws(() => imageResponse(Buffer.from(sse), 'text/event-stream'), /响应格式/)
  assert.throws(() => imageResponse(Buffer.from('data: broken\n\ndata: [DONE]\n\n'), 'text/event-stream'), /响应格式/)
})

test('image responses accept plain Markdown, binary images without MIME and completed Gemini SSE', () => {
  assert.deepEqual(imageResponse(Buffer.from(`Here is your image: ![result](${uri})`), 'text/plain').bytes, bytes)
  assert.deepEqual(imageResponse(bytes, 'application/octet-stream').bytes, bytes)
  const event = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }] }, finishReason: 'STOP' }] }
  assert.deepEqual(imageResponse(Buffer.from(`data: ${JSON.stringify(event)}\n\n`), 'text/event-stream').bytes, bytes)
})

test('CDN redirects download the image without credentials and reject local destinations and loops', async () => {
  const calls: string[] = []
  const request = async (url: any, init: any) => {
    calls.push(String(url)); assert.equal(init.headers, undefined); assert.equal(init.redirect, 'manual')
    return calls.length === 1 ? new Response('', { status: 302, headers: { location: 'https://cdn.test/final.jpg' } }) : new Response(bytes)
  }
  assert.deepEqual(await downloadImage('https://assets.test/image', request as typeof fetch, new AbortController().signal), bytes)
  assert.deepEqual(calls, ['https://assets.test/image', 'https://cdn.test/final.jpg'])
  let requests = 0
  await assert.rejects(downloadImage('https://assets.test/image', (async () => { requests++; return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/private' } }) }) as typeof fetch, new AbortController().signal), /下载地址/)
  assert.equal(requests, 1)
  requests = 0
  await assert.rejects(downloadImage('https://assets.test/image', (async () => { requests++; return new Response('', { status: 302, headers: { location: '/image' } }) }) as typeof fetch, new AbortController().signal), /下载地址/)
  assert.equal(requests, 6)
})

test('large generated images fit the parser and storage budget while stickers retain their limit', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-large-image-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const large = Buffer.alloc(13 * 1024 * 1024); bytes.copy(large)
  const response = new Response(JSON.stringify({ data: [{ b64_json: large.toString('base64') }] }))
  const parsed = imageResponse(await boundedResponse(response, imageResponseLimit))
  assert.equal(parsed.bytes?.length, large.length)
  const store = imageStore(directory), asset = store.registerGeneratedImage(parsed.bytes!)
  assert.ok(store.get(asset.id).startsWith('data:image/jpeg;base64,'))
  assert.throws(() => store.registerSticker(large))
  assert.throws(() => store.registerGeneratedImage(Buffer.alloc(imageLimit + 1)))
})

test('download and save retries reuse the generated result, including a cached Base64 result after restart', async t => {
  let posts = 0, downloads = 0
  const f = fixture(t, { fetch: async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') { posts++; return Response.json({ data: [{ url: 'https://cdn.test/image.jpg' }] }) }
    if (++downloads === 1) throw new Error('network disconnected')
    return new Response(bytes)
  } })
  f.create(); await waitFor(() => f.jobs.list()[0].status === 'failed')
  assert.equal(f.jobs.list()[0].retryMode, 'retrieve')
  f.jobs.retry('image-test-operation'); await waitFor(() => !!f.jobs.list()[0].delivered)
  assert.equal(posts, 1); assert.equal(downloads, 2)
  const saved = fixture(t, { fetch: async () => Response.json({ data: [{ b64_json: base64 }] }), saveImage: () => { throw new Error('disk temporarily unavailable') } })
  saved.create(); await waitFor(() => saved.jobs.list()[0].status === 'failed')
  assert.equal(saved.jobs.list()[0].retryMode, 'retrieve')
  await saved.jobs.stop()
  let delivered = 0
  const resumed = mediaJobs({ directory: saved.directory, config: () => saved.config, getImage: () => uri, saveImage: data => { assert.deepEqual(data, bytes); return { id: assetId } }, delivered: async () => { delivered++ }, fetch: async () => assert.fail('must not generate or download again') })
  try { resumed.retry('image-test-operation'); await waitFor(() => delivered === 1); assert.equal(resumed.list()[0].status, 'ready') } finally { await resumed.stop() }
})

test('automatic protocol selection honors explicit endpoints and manual overrides; image sizes match models', () => {
  const connection = { enabled: true, provider: 'compatible' as const, endpoint: 'https://provider.test/v1', model: 'gemini-3.1-flash-image' }
  assert.equal(imageApi(connection), 'chat')
  assert.equal(imageApi({ ...connection, endpoint: 'https://generativelanguage.googleapis.com/v1beta' }), 'gemini')
  assert.equal(imageApi({ ...connection, endpoint: 'https://provider.test/v1/images/generations' }), 'images')
  assert.equal(imageApi({ ...connection, imageApi: 'images' }), 'images')
  assert.equal(imageApi({ ...connection, model: 'gpt-image-1' }), 'images')
  assert.equal(imageSize('dall-e-2', '9:16'), '1024x1024')
  assert.equal(imageSize('dall-e-3', '9:16'), '1024x1792')
  assert.equal(imageSize('gpt-image-1', '16:9'), '1536x1024')
  for (const imageApi of ['auto', 'images', 'chat', 'gemini'] as const) assert.equal(normalizeExperience({ image: { ...connection, imageApi } }).image.imageApi, imageApi)
  assert.equal(normalizeExperience({ image: connection }).image.imageApi, 'auto')
})

test('HTTP, embedded errors, malformed JSON and oversized responses have safe classified errors', async () => {
  for (const [status, reason] of [[400, 'invalid_request'], [401, 'authentication'], [402, 'provider_quota'], [403, 'permission'], [404, 'media_route'], [405, 'media_route'], [429, 'throttled_or_quota'], [500, 'provider_error']] as const) {
    await assert.rejects(boundedResponse(new Response('PRIVATE_PROVIDER_BODY PRIVATE_KEY', { status })), (error: any) => error.reason === reason && error.status === status && !error.message.includes('PRIVATE_'))
  }
  assert.equal(mediaFailure({ error: { code: 401 } }).reason, 'authentication')
  assert.equal(imageResponse(Buffer.from(JSON.stringify({ error: { message: 'insufficient_quota' } }))).reason, 'provider_quota')
  assert.throws(() => imageResponse(Buffer.from('invalid JSON')), /响应格式/)
  await assert.rejects(boundedResponse(new Response('oversize'), 2), (error: any) => error.reason === 'media_size')
})

for (const api of ['images', 'chat', 'gemini'] as const) test(`${api} sends reference images using its protocol and delivers the result once`, async t => {
  let posts = 0, deliveries = 0
  const f = fixture(t, { delivered: async () => { deliveries++ }, fetch: async (url: string, init: RequestInit) => {
    posts++
    if (api === 'images') { assert.match(url, /\/images\/edits$/); assert.ok(init.body instanceof FormData); assert.ok(init.body.get('image[]') instanceof Blob) }
    else {
      const body = JSON.parse(String(init.body))
      if (api === 'chat') { assert.match(url, /\/chat\/completions$/); assert.equal(body.stream, false); assert.equal(body.messages[0].content[1].image_url.url, uri) }
      else { assert.match(url, /\/models\/test-image:generateContent$/); assert.equal((init.headers as any)['x-goog-api-key'], 'PRIVATE_KEY'); assert.equal(body.contents[0].parts[1].inlineData.data, base64) }
    }
    return Response.json(api === 'chat' ? { choices: [{ message: { content: `![image](${uri})` } }] } : api === 'gemini' ? { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }] } }] } : { data: [{ b64_json: base64 }] })
  } })
  Object.assign(f.config.image, { imageApi: api, model: 'test-image', referenceImages: true })
  f.config.visual.references = [assetId]
  f.create(); f.create()
  await waitFor(() => !!f.jobs.list()[0].delivered)
  f.jobs.retry('image-test-operation')
  assert.equal(posts, 1); assert.equal(deliveries, 1)
  assert.doesNotMatch(readFileSync(join(f.directory, 'diagnostics.json'), 'utf8'), /PRIVATE_|data:image|provider\.test/)
})

test('Imagefree queued task consumes completed.image and stops polling after saving and delivery', async t => {
  let posts = 0, polls = 0, downloads = 0
  const f = fixture(t, { fetch: async (url: string, init: RequestInit) => {
    if (init?.method === 'POST') { posts++; return Response.json({ taskId: 'imagefree-task' }) }
    if (url.includes('/status?')) { polls++; return Response.json(polls === 1 ? { status: 'queued' } : { status: 'completed', image: 'https://cdn.test/result.jpg' }) }
    downloads++; return new Response(bytes)
  } })
  f.config.image.provider = 'imagefree'; f.create()
  await waitFor(() => !!f.jobs.list()[0].delivered)
  assert.equal(posts, 1); assert.equal(polls, 2); assert.equal(downloads, 1)
  assert.deepEqual([...new Set(f.diagnostics.list().events.map(event => event.mediaPhase))], ['prepare', 'submit', 'poll', 'download', 'save', 'deliver'])
})

test('explicit refusal retries with corrected config; uncertain submission cannot generate again', async t => {
  let posts = 0
  const f = fixture(t, { fetch: async () => ++posts === 1 ? new Response('', { status: 401 }) : Response.json({ data: [{ b64_json: base64 }] }) })
  f.create(); await waitFor(() => f.jobs.list()[0].status === 'failed')
  f.config.image.imageApi = 'chat'; f.jobs.retry('image-test-operation')
  await waitFor(() => !!f.jobs.list()[0].delivered); assert.equal(posts, 2)
  const uncertain = fixture(t, { fetch: async () => { throw new Error('network disconnected PRIVATE_KEY') } })
  uncertain.create(); await waitFor(() => uncertain.jobs.list()[0].status === 'unknown')
  assert.throws(() => uncertain.jobs.retry('image-test-operation'), /不能安全重复生成/)
  assert.doesNotMatch(JSON.stringify(uncertain.diagnostics.list()), /PRIVATE_/)
})

test('delivery retry uses the saved image and never submits another generation', async t => {
  let posts = 0, deliveries = 0
  const f = fixture(t, { fetch: async () => { posts++; return Response.json({ data: [{ b64_json: base64 }] }) }, delivered: async () => { if (++deliveries === 1) throw new Error('PRIVATE_DELIVERY') } })
  f.create(); await waitFor(() => !!f.jobs.list()[0].error)
  assert.equal(f.jobs.list()[0].status, 'ready')
  f.jobs.retry('image-test-operation'); await waitFor(() => !!f.jobs.list()[0].delivered)
  assert.equal(posts, 1); assert.equal(deliveries, 2)
})

for (const scenario of ['empty', 'malformed', 'embedded-error', 'unsupported-async', 'download', 'save', 'timeout'] as const) test(`image ${scenario} failure records its stage without exposing provider content or resubmitting`, async t => {
  let posts = 0
  const f = fixture(t, { fetch: async (_url: string, init: RequestInit) => {
    if (init?.method !== 'POST') throw new Error('network download failure PRIVATE_KEY')
    posts++
    if (scenario === 'empty') return Response.json({ data: [] })
    if (scenario === 'malformed') return new Response('PRIVATE_BAD_JSON')
    if (scenario === 'embedded-error') return Response.json({ error: { message: 'insufficient_quota PRIVATE_KEY' } })
    if (scenario === 'unsupported-async') return Response.json({ task_id: 'remote-task' })
    if (scenario === 'download') return Response.json({ data: [{ url: 'https://cdn.test/PRIVATE_URL.jpg' }] })
    if (scenario === 'timeout') throw new DOMException('PRIVATE_TIMEOUT', 'TimeoutError')
    return Response.json({ data: [{ b64_json: base64 }] })
  }, ...(scenario === 'save' ? { saveImage: () => { throw new Error('PRIVATE_DISK_ERROR') } } : {}) })
  f.create(); await waitFor(() => ['failed', 'unknown'].includes(f.jobs.list()[0].status))
  const event = f.diagnostics.list().events.at(-1)!
  const reason = { empty: 'image_empty', malformed: 'image_response', 'embedded-error': 'provider_quota', 'unsupported-async': 'image_async', download: 'network', save: 'image_save', timeout: 'timeout' }[scenario]
  assert.equal(event.reason, reason)
  assert.equal(event.mediaPhase, scenario === 'download' ? 'download' : scenario === 'save' ? 'save' : scenario === 'unsupported-async' ? 'poll' : 'submit')
  assert.equal(posts, 1)
  assert.doesNotMatch(JSON.stringify(f.diagnostics.list()), /PRIVATE_/)
})

test('completed image retains its original message association after diagnostic scope closes', async t => {
  const f = fixture(t, { fetch: async () => Response.json({ data: [{ b64_json: base64 }] }) })
  runMessageDiagnostics(f.diagnostics, ['original-message'], f.create)
  await waitFor(() => !!f.jobs.list()[0].delivered)
  const events = f.diagnostics.list('original-message').events
  assert.ok(events.some(event => event.mediaPhase === 'deliver' && event.outcome === 'succeeded'))
  assert.ok(events.every(event => event.requestIds.includes('original-message')))
})

test('restart resumes a submitted Imagefree job by querying without a new generation', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-image-resume-'))
  writeFileSync(join(directory, 'media-jobs.json'), JSON.stringify({ jobs: [{ id: 'resumed-image-task', kind: 'image', purpose: 'avatar', status: 'running', at: new Date().toISOString(), providerTaskId: 'remote-task', submission: true }] }))
  const f = fixture(t, { directory, fetch: async (_url: string, init: RequestInit) => { assert.notEqual(init?.method, 'POST'); return Response.json({ status: 'completed', image: uri }) } })
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  f.config.image.provider = 'imagefree'
  await waitFor(() => !!f.jobs.list()[0]?.delivered)
})

test('diagnostics remain correlated after the originating scope ends and clear suppresses in-flight events', async t => {
  let release!: (value: Response) => void
  const f = fixture(t, { fetch: async () => new Promise<Response>(resolve => { release = resolve }) })
  runMessageDiagnostics(f.diagnostics, ['original-message'], f.create)
  await waitFor(() => !!release)
  assert.ok(f.diagnostics.list('original-message').events.some(event => event.mediaPhase === 'submit'))
  f.diagnostics.clear(); release(Response.json({ data: [{ b64_json: base64 }] }))
  await waitFor(() => !!f.jobs.list()[0].delivered)
  assert.deepEqual(f.diagnostics.list().events, [])
})

test('failed avatar and feed image jobs are visible without a chat message and support task filtering', async t => {
  const f = fixture(t, { fetch: async () => new Response('captcha required PRIVATE_PROMPT', { status: 403 }) })
  f.jobs.create({ id: 'avatar-failure-task', kind: 'image', purpose: 'avatar', prompt: 'PRIVATE_PROMPT' })
  await waitFor(() => f.jobs.list()[0].status === 'failed')
  f.jobs.create({ id: 'feed-failure-task', kind: 'image', purpose: 'feed', prompt: 'PRIVATE_PROMPT' })
  await waitFor(() => f.jobs.list()[1].status === 'failed')
  const cards = aggregateDiagnosticMessages(f.diagnostics.list().events)
  assert.equal(visibleDiagnosticMessages(cards, 'failed').length, 2)
  assert.ok(cards.some(card => card.preview.startsWith('头像生成')))
  assert.ok(cards.some(card => card.preview.startsWith('动态配图')))
  assert.ok(f.diagnostics.list('avatar-failure-task').events.every(event => event.mediaJobId === 'avatar-failure-task'))
  assert.doesNotMatch(JSON.stringify(f.diagnostics.list()), /PRIVATE_|captcha/)
})

for (const provider of ['compatible', 'imagefree'] as const) test(`unsubmitted image uses the latest ${provider} settings instead of failing configuration checks`, async t => {
  const requests: string[] = []
  const f = fixture(t, { fetch: async (url: string) => { requests.push(url); return Response.json({ image: uri }) } })
  f.create()
  Object.assign(f.config.image, { provider, endpoint: provider === 'imagefree' ? 'https://imagefree.net' : 'https://new-provider.test/v1', model: 'gemini-3.1-flash-image', imageApi: 'auto' })
  await waitFor(() => ['ready', 'failed', 'unknown'].includes(f.jobs.list()[0].status))
  assert.equal(f.jobs.list()[0].status, 'ready', f.jobs.list()[0].error)
  assert.deepEqual(requests, [provider === 'imagefree' ? 'https://imagefree.net/api/generate' : 'https://new-provider.test/v1/chat/completions'])
  assert.equal(f.diagnostics.list().events.at(-1)?.mediaProvider, provider)
})

for (const result of ['imageUrl', 'providerTaskId'] as const) test(`old configuration failure resumes ${result} using its original result after changing channels`, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-image-route-resume-'))
  const route = { enabled: true, provider: 'imagefree', endpoint: 'https://imagefree.net', model: '', imageApi: 'auto' }
  writeFileSync(join(directory, 'media-jobs.json'), JSON.stringify({ jobs: [{ id: 'old-config-failure', kind: 'image', purpose: 'chat', status: 'failed', at: new Date().toISOString(), route, submission: true, error: '任务的服务配置已改变', [result]: result === 'imageUrl' ? 'https://cdn.test/result.jpg' : 'imagefree-original-task' }] }))
  const requests: string[] = []
  const f = fixture(t, { directory, fetch: async (url: string, init: RequestInit) => {
    requests.push(url); assert.notEqual(init?.method, 'POST'); assert.equal((init?.headers as any)?.Authorization, undefined)
    return result === 'imageUrl' ? new Response(bytes) : Response.json({ status: 'completed', image: uri })
  } })
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  f.config.image.enabled = false
  f.jobs.retry('old-config-failure')
  await waitFor(() => ['ready', 'failed', 'unknown'].includes(f.jobs.list()[0].status))
  assert.equal(f.jobs.list()[0].status, 'ready', f.jobs.list()[0].error)
  assert.equal(requests.length, 1)
  assert.equal(requests[0], result === 'imageUrl' ? 'https://cdn.test/result.jpg' : 'https://imagefree.net/api/generate/status?taskId=imagefree-original-task')
})

test('a known pre-submission failure does not consume the autonomous image cooldown', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-image-cooldown-'))
  const settings = defaultExperience(); settings.image = { enabled: true, provider: 'compatible', endpoint: 'https://provider.test/v1', model: 'gpt-image-1' }
  let posts = 0
  const runtime = experienceRuntime({ directory, settings, getImage: () => uri, saveImage: () => ({ id: assetId }), deliver: async () => {}, wake: async () => true,
    fetch: async () => ++posts === 1 ? new Response('', { status: 401 }) : Response.json({ image: uri }) })
  t.after(async () => { await runtime.stop(); rmSync(directory, { recursive: true, force: true }) })
  const decision = { mobileActions: [{ kind: 'image', purpose: 'chat', scene: 'a cat', willingness: 1 }] }
  await runtime.committed(decision, 101, true)
  await waitFor(() => runtime.jobs.list()[0].status === 'failed')
  await runtime.committed(decision, 102, true)
  assert.equal(runtime.jobs.list().length, 2, 'a fresh attempt after explicit refusal must not wait 30 minutes')
  await waitFor(() => !!runtime.jobs.list()[1].delivered)
  await runtime.committed(decision, 103, true)
  assert.equal(runtime.jobs.list().length, 2, 'successful images still consume the configured cooldown')
})
