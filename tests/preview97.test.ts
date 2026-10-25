import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJsonCard } from '../packages/card-format'
import { defaultExperience, type Message } from '../packages/contracts'
import { mediaJobs } from '../runtime/media-jobs'
import { historyQuery } from '../runtime/message-history'
import { appendHistory, recentHistory } from '../apps/mobile-ui/history-state'
import type { HostConfig } from '../runtime/host'
const { startHost } = createRequire(import.meta.url)('../runtime/generated/host.cjs') as typeof import('../runtime/host')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const directory = () => mkdtempSync(join(tmpdir(), 'hds-preview97-'))
async function until(check: () => boolean | Promise<boolean>) { const deadline = Date.now() + 8000; while (!await check()) { assert.ok(Date.now() < deadline, 'operation should complete'); await sleep(20) } }
const base = (dataDir: string): HostConfig => ({ card: parseJsonCard(JSON.stringify({ name: '星禾', description: '朋友' })), endpoint: 'http://127.0.0.1:1/v1', model: 'fixture', userName: '我', userProfile: '', autoAdvance: false, token: 'preview97-test-token-at-least-32-characters', port: 0, dataDir })

test('restored host holds queued and ready media and feed until explicit resume', { timeout: 20000 }, async () => {
  let posts = 0
  const api = createServer(async (request, response) => { for await (const _ of request) { /* Drain. */ } posts++; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDecAAAAASUVORK5CYII=' }] })) })
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve))
  const dataDir = directory(), experience = defaultExperience()
  experience.image = { enabled: true, provider: 'compatible', endpoint: `http://127.0.0.1:${(api.address() as any).port}/v1`, model: 'image' }
  writeFileSync(join(dataDir, 'restore-held.json'), '{}')
  writeFileSync(join(dataDir, 'media-jobs.json'), JSON.stringify({ jobs: [
    { id: 'restored-queued', kind: 'image', purpose: 'chat', status: 'queued', prompt: '窗边', createdAt: new Date().toISOString() },
    { id: 'restored-ready', kind: 'image', purpose: 'feed', status: 'ready', imageId: 'a'.repeat(64), caption: '过去的动态', createdAt: new Date().toISOString() },
  ] }))
  let host: Awaited<ReturnType<typeof startHost>> | undefined
  try {
    host = await startHost({ ...base(dataDir), experience })
    await sleep(1100)
    assert.equal((await host.dispatch('story.snapshot', {}) as any).story.status, 'paused')
    assert.equal(posts, 0)
    assert.equal((await host.dispatch('messages.history', {}) as any[]).length, 0)
    assert.equal((await host.dispatch('experience.snapshot', {}) as any).posts.length, 0)
    await assert.rejects(host.dispatch('media.create', { id: 'held-request', kind: 'image', purpose: 'chat', prompt: '新图片' }), /暂停/)
    await assert.rejects(host.dispatch('feed.mutate', { action: 'post', operationId: 'held-feed-post', content: '新动态' }), /暂停/)
    await host.dispatch('story.resume', {})
    await until(async () => (await host!.dispatch('messages.history', {}) as any[]).some(row => row.id === 'restored-queued'))
    await until(async () => (await host!.dispatch('experience.snapshot', {}) as any).posts.length === 1)
    assert.equal(posts, 1)
    await host.dispatch('story.pause', {})
    await assert.rejects(host.dispatch('media.create', { id: 'paused-request', kind: 'image', purpose: 'chat', prompt: '新图片' }), /暂停/)
  } finally { await host?.stop(); api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve())) }
})

test('transcription proceeds while an image request is held; each lane stays single worker', async () => {
  const path = directory(), config = defaultExperience(), audioId = 'b'.repeat(64)
  writeFileSync(join(path, `${audioId}.wav`), Buffer.from('recording'))
  config.image = { enabled: true, provider: 'compatible', endpoint: 'https://fixture.test/v1', model: 'image' }
  config.stt = { enabled: true, provider: 'compatible', endpoint: 'https://fixture.test/v1', model: 'stt' }
  let imagePosts = 0, sttPosts = 0, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const jobs = mediaJobs({ directory: path, audioDirectory: path, config: () => config, getImage: () => '', saveImage: () => ({ id: 'a'.repeat(64) }), delivered: async () => {}, fetch: async url => {
    if (String(url).endsWith('transcriptions')) { sttPosts++; return Response.json({ text: '这句话无需等图片' }) }
    imagePosts++; await gate; return Response.json({ data: [{ b64_json: Buffer.from('image').toString('base64') }] })
  } })
  try {
    jobs.create({ id: 'slow-image-one', kind: 'image', purpose: 'chat', prompt: '第一张' })
    assert.throws(() => jobs.create({ id: 'slow-image-two', kind: 'image', purpose: 'chat', prompt: '第二张' }), /正在处理/)
    await until(() => imagePosts === 1)
    jobs.create({ id: 'interactive-stt', kind: 'stt', purpose: 'input', audioId, duration: 3 })
    await until(() => jobs.list().some(row => row.text === '这句话无需等图片' && row.delivered))
    assert.equal(sttPosts, 1); assert.equal(imagePosts, 1)
    release(); await until(() => jobs.list().every(row => row.delivered)); assert.equal(imagePosts, 1)
  } finally { release(); await jobs.stop() }
})

test('pause aborts ambiguous submission without resubmitting it on resume', async () => {
  const config = defaultExperience(); config.image.enabled = true
  let submitted = 0
  const jobs = mediaJobs({ directory: directory(), config: () => config, getImage: () => '', saveImage: () => ({ id: 'a'.repeat(64) }), delivered: async () => { assert.fail('paused uncertain task must not deliver') }, fetch: async (_url, init) => {
    submitted++; await new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); throw new Error('unreachable')
  } })
  try {
    jobs.create({ id: 'pause-submission', kind: 'image', purpose: 'chat', prompt: '街景' })
    await until(() => submitted === 1); jobs.setPaused(true); jobs.setPaused(false)
    await until(() => jobs.list()[0].status === 'unknown'); await sleep(600)
    assert.equal(submitted, 1); assert.throws(() => jobs.retry('pause-submission'), /未知/)
  } finally { await jobs.stop() }
})

test('SQLite history traverses over 200 records with timestamp ties and literal search', { timeout: 15000 }, async () => {
  const host = await startHost(base(directory()))
  try {
    const rows = Array.from({ length: 255 }, (_, i) => ({ id: `record-${String(i).padStart(4, '0')}`, direction: 'user', content: i === 7 ? 'Needle.* 一段回忆' : `普通消息 ${i}`, occurredAt: new Date(1700000000000 + Math.floor(i / 5)), status: 'accepted', images: [], audio: {} }))
    await host.app.database.upsert('mobile_message', rows)
    let before: unknown, collected: Message[] = []
    for (let page = 0; page < 10; page++) {
      const result = await host.dispatch('messages.history', { limit: 50, ...(before ? { before } : {}) }) as Message[]
      collected = [...result, ...collected]
      if (page === 0) await host.app.database.create('mobile_message', { ...rows[0], id: 'new-arrival', occurredAt: new Date() })
      if (result.length < 50) break
      before = { id: result[0].id, occurredAt: result[0].occurredAt }
    }
    assert.deepEqual(collected.map(row => row.id), rows.map(row => row.id))
    const search = await host.dispatch('messages.history', { query: 'needle.*' }) as Message[]
    assert.deepEqual(search.map(row => row.id), ['record-0007'])
    assert.equal((await host.dispatch('messages.history', { until: rows[5].occurredAt.toISOString() }) as Message[]).length, 5)
    const refreshed = appendHistory(collected, await host.dispatch('messages.history', { limit: 50 }) as Message[])
    assert.equal(refreshed.length, 256); assert.equal(refreshed[0].id, 'record-0000')
    const missedPushes = await recentHistory(collected.slice(0, 5), async before => await host.dispatch('messages.history', { limit: 50, ...(before ? { before } : {}) }) as Message[])
    assert.equal(missedPushes.replace, false)
    assert.equal(appendHistory(collected.slice(0, 5), missedPushes.rows).length, 256, 'background reconciliation fills the gap')
    for (const payload of [{ limit: 0 }, { limit: 201 }, { before: { id: 'abc', occurredAt: 'bad' } }, { query: 'x'.repeat(129) }, { until: 'invalid' }]) assert.throws(() => historyQuery(payload))
  } finally { await host.stop() }
})
