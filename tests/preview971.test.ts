import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultExperience } from '../packages/contracts/experience'
import { experienceRuntime } from '../runtime/experience-runtime'
import { MessageDiagnostics } from '../runtime/message-diagnostics'
import { aggregateDiagnosticMessages, latestRetrieval, visibleDiagnosticMessages } from '../apps/mobile-ui/message-diagnostics'

const imageId = 'a'.repeat(64)
async function waitFor(check: () => boolean) { const until = Date.now() + 5000; while (!check()) { assert.ok(Date.now() < until); await new Promise(resolve => setTimeout(resolve, 20)) } }

for (const purpose of ['feed', 'chat', 'avatar', 'preview'] as const) test(`free web result resumes original ${purpose} task without a new generation`, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-free-'))
  let calls = 0, deliveries = 0
  const settings = defaultExperience(); settings.image.enabled = true
  const diagnostics = new MessageDiagnostics(join(directory, 'diagnostics.json'))
  const runtime = experienceRuntime({ directory, settings, diagnostics, getImage: () => '', saveImage: () => ({ id: imageId }), deliver: async () => { deliveries++ }, wake: async () => true,
    fetch: async () => { calls++; return new Response('captcha verification required', { status: 403 }) } })
  t.after(async () => { await runtime.stop(); rmSync(directory, { recursive: true, force: true }) })
  const id = `free-recovery-${purpose}`
  runtime.jobs.create({ id, kind: 'image', purpose, prompt: 'a ceramic cup', caption: '今日的杯子' })
  await waitFor(() => runtime.jobs.list()[0].status === 'failed')
  assert.equal(runtime.jobs.list()[0].provider, 'imagefree')
  assert.match(runtime.jobs.freeInput(id).prompt!, /ceramic cup/)
  runtime.jobs.completeFree(id, imageId)
  assert.equal(runtime.jobs.freeInput(id).completed, true, 'lost acknowledgements are idempotent even before delivery')
  runtime.jobs.completeFree(id, imageId)
  await waitFor(() => !!runtime.jobs.list()[0].delivered)
  assert.equal(calls, 1)
  assert.equal(deliveries, purpose === 'feed' ? 0 : 1)
  if (purpose === 'feed') { assert.equal(runtime.snapshot().posts.length, 1); assert.deepEqual(runtime.snapshot().posts[0].images, [imageId]) }
  assert.equal(aggregateDiagnosticMessages(diagnostics.list().events)[0].failure, undefined)
})

test('same-turn text post and image action attach to one dynamic post and remain idempotent', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hds-feed-image-'))
  const settings = defaultExperience(); settings.image = { enabled: true, provider: 'compatible', endpoint: 'https://fixture.test/v1', model: 'gpt-image-1' }
  let posts = 0
  const runtime = experienceRuntime({ directory, settings, getImage: () => '', saveImage: () => ({ id: imageId }), deliver: async () => assert.fail('feed must not send a chat message'), wake: async () => true,
    fetch: async () => { posts++; return Response.json({ data: [{ b64_json: Buffer.from([255, 216, 255, 217]).toString('base64') }] }) } })
  t.after(async () => { await runtime.stop(); rmSync(directory, { recursive: true, force: true }) })
  const decision = { mobileActions: [{ kind: 'image', purpose: 'feed', scene: 'a cat', content: '今天遇见一只猫', willingness: 1 }, { kind: 'post', content: '今天遇见一只猫' }] }
  await runtime.committed(decision, 17, true)
  await waitFor(() => !!runtime.jobs.list()[0]?.delivered)
  await runtime.committed(decision, 17, true)
  runtime.jobs.retry(runtime.jobs.list()[0].id)
  assert.equal(posts, 1); assert.equal(runtime.snapshot().posts.length, 1)
  assert.equal(runtime.snapshot().posts[0].id, 'role-action-17-1')
  assert.deepEqual(runtime.snapshot().posts[0].images, [imageId])
})

test('retrieval degradation and recovered errors do not masquerade as current image failures', () => {
  const events = [
    { id: 'retrieve-failed', at: 1, requestIds: ['input-message'], stage: 'embedding', outcome: 'fallback', reason: 'authentication', providerSlot: 1 },
    { id: 'retrieve-ready', at: 2, requestIds: ['input-message'], stage: 'embedding', outcome: 'succeeded', providerSlot: 1 },
    { id: 'reply-delivered', at: 3, requestIds: ['input-message'], stage: 'delivery', outcome: 'delivered' },
  ]
  assert.equal(latestRetrieval(events).length, 1)
  assert.equal(latestRetrieval(events)[0].outcome, 'succeeded')
  assert.equal(visibleDiagnosticMessages(aggregateDiagnosticMessages(events), 'failed').length, 0)
  assert.equal(visibleDiagnosticMessages(aggregateDiagnosticMessages(events), 'images').length, 0)
})
