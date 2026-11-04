import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MessageDiagnostics, runMessageDiagnostics, diagnosticEvent, diagnosticCall, diagnosticError, withDeliveryDiagnostics } from '../runtime/message-diagnostics'
import { emptyLibrary, importIntoPack, poolLibrary, stickerEntryVisible, stickerSyncPacks } from '../apps/mobile-ui/sticker-state'

const first = 'diagnostic-request-first', second = 'diagnostic-request-second'
const temporary = () => { const directory = mkdtempSync(join(tmpdir(), 'hds-diagnostics-')); return { directory, file: join(directory, 'events.json') } }

test('retrieval coalescing keeps background and unrelated messages isolated', () => {
  const { directory, file } = temporary()
  try {
    const store = new MessageDiagnostics(file)
    store.retrieval([], 'embedding', 'fallback', { reason: 'authentication', providerSlot: 1 }, store.epoch)
    store.retrieval([first], 'embedding', 'fallback', { reason: 'authentication', providerSlot: 1 }, store.epoch)
    store.retrieval([second], 'embedding', 'fallback', { reason: 'authentication', providerSlot: 1 }, store.epoch)
    store.retrieval([second], 'embedding', 'fallback', { reason: 'authentication', providerSlot: 1 }, store.epoch)
    store.retrieval([first], 'embedding', 'succeeded', { providerSlot: 1 }, store.epoch)
    assert.equal(store.list().events.length, 4)
    assert.equal(store.list(second).events[0].count, 2)
    assert.ok(store.list(first).events.every(event => !event.requestIds.includes(second)))
    assert.equal(store.list().events.filter(event => !event.requestIds.length).length, 1)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('diagnostics isolate overlapping async scopes, correlate delayed delivery and suppress cleared work', async () => {
  const { directory, file } = temporary()
  try {
    const store = new MessageDiagnostics(file)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const pending = runMessageDiagnostics(store, [first], async () => { await gate; diagnosticEvent('model', 'succeeded') })
    await runMessageDiagnostics(store, [second], async () => {
      await diagnosticCall('model', async () => 1)
      diagnosticEvent('commit', 'succeeded', { entryId: 42 })
    })
    release(); await pending
    assert.deepEqual(store.list().events.filter(row => row.requestIds.includes(first)).map(row => row.outcome), ['succeeded'])
    await withDeliveryDiagnostics(store, [42], async () => { diagnosticEvent('delivery', 'delivered', { messageId: 'diagnostic-reply-second' }) })
    const linked = store.list('diagnostic-reply-second').events
    assert.ok(linked.some(row => row.stage === 'model'))
    assert.ok(linked.every(row => row.requestIds.includes(second)))
    await withDeliveryDiagnostics(store, [999], async () => { diagnosticEvent('delivery', 'delivered') })
    assert.equal(store.list().events.filter(row => row.stage === 'delivery').length, 1)
    await runMessageDiagnostics(store, [first], async () => { store.clear(); await Promise.resolve(); diagnosticEvent('model', 'failed') })
    assert.deepEqual(store.list().events, [])
    assert.deepEqual(new MessageDiagnostics(file).list().events, [])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('diagnostics persist sanitized fields, mark only unfinished work after restart and tolerate unavailable storage', () => {
  const { directory, file } = temporary()
  try {
    const store = new MessageDiagnostics(file)
    store.record([first, 'https://private.invalid/key'], 'submission', 'accepted', { reason: 'safe_code', content: 'PRIVATE_CHAT', apiKey: 'sk-PRIVATE', elapsedMs: Infinity } as any)
    store.record([second], 'processing', 'settled')
    store.record([second], 'commit', 'succeeded', { entryId: 42 })
    store.record([second], 'submission', 'accepted', { reason: 'duplicate' })
    const restored = new MessageDiagnostics(file)
    assert.equal(restored.list(first).events.filter(row => row.outcome === 'interrupted').length, 1)
    assert.equal(restored.list(second).events.filter(row => row.outcome === 'interrupted').length, 0)
    withDeliveryDiagnostics(restored, [42], () => diagnosticEvent('delivery', 'delivered', { messageId: 'diagnostic-restored-reply' }))
    assert.ok(restored.list('diagnostic-restored-reply').events.some(row => row.requestIds.includes(second) && row.stage === 'delivery'))
    const silent = 'diagnostic-silent-request'
    restored.record([silent], 'decision', 'none')
    restored.record([silent], 'processing', 'settled')
    assert.equal(new MessageDiagnostics(file).list(silent).events.filter(row => row.outcome === 'interrupted').length, 0)
    assert.doesNotMatch(readFileSync(file, 'utf8'), /PRIVATE|https:|Infinity/)
    const unavailable = new MessageDiagnostics(join(directory, 'absent', 'events.json'))
    unavailable.record([first], 'model', 'started')
    assert.equal(unavailable.list().storageAvailable, false)
    assert.equal(unavailable.list().events.length, 1)
    writeFileSync(file, '{broken')
    assert.deepEqual(new MessageDiagnostics(file).list().events, [])
    writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))
    assert.deepEqual(new MessageDiagnostics(file).list().events, [])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('diagnostic retention enforces age, count and byte limits on persisted input', () => {
  const { directory, file } = temporary()
  try {
    const now = Date.now()
    const row = (n: number, at = now) => ({ id: `diagnostic-event-${n}`, at, requestIds: [first], stage: 'processing', outcome: 'settled' })
    writeFileSync(file, JSON.stringify([row(0, now - 8 * 86400000), row(1)]))
    assert.equal(new MessageDiagnostics(file).list().events.length, 1)
    writeFileSync(file, JSON.stringify(Array.from({ length: 2100 }, (_, n) => row(n))))
    const store = new MessageDiagnostics(file)
    assert.equal(store.list().events.length, 2000)
    // Large multi-message batches exercise byte rotation independently of the count cap.
    const large = Array.from({ length: 100 }, (_, n) => `diagnostic-request-${n}-${'a'.repeat(35)}`)
    for (let n = 0; n < 220; n++) store.record(large, 'processing', 'settled')
    assert.ok(statSync(file).size <= 1024 * 1024)
    assert.ok(store.list().events.length < 2000)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('provider classification distinguishes explicit quota, auth, throttling, budgets and network errors', () => {
  const fixtures: [unknown, string][] = [
    [{ response: { status: 402 } }, 'provider_quota'],
    [{ response: { status: 429, data: { error: { code: 'insufficient_quota', message: 'sk-PRIVATE' } } } }, 'provider_quota'],
    [{ response: { status: 401 } }, 'authentication'], [{ status: 403 }, 'permission'],
    [{ response: { status: 429, data: { error: { code: 'rate_limit_exceeded' } } } }, 'rate_limit'],
    [{ status: 429 }, 'throttled_or_quota'], [{ code: 'HDS_MOBILE_BUDGET' }, 'background_budget'],
    [new Error('HTTP 503'), 'provider_error'], [new Error('fetch failed'), 'network'],
    [new Error('request timed out'), 'timeout'], [null, 'unknown_error'],
  ]
  for (const [error, expected] of fixtures) assert.equal(diagnosticError(error), expected)
})

test('legacy sticker packs stay in user pool; character copies can change independently and keep history', () => {
  const asset = { id: 'a'.repeat(64), path: '/private/sticker', size: 32, mime: 'image/png' }
  let library = importIntoPack(emptyLibrary(), 'user-pack', '我的', [asset]).library
  library.messages[first] = asset
  library.packs[0].pool = undefined // Legacy metadata.
  assert.equal(stickerEntryVisible(library), true)
  assert.equal(poolLibrary(library, 'character').packs.length, 0)
  assert.equal(stickerSyncPacks(library)[0].pool, 'user')
  library = importIntoPack(library, 'character-pack', '角色', [asset], Date.now(), 'character').library
  assert.throws(() => importIntoPack(library, 'user-pack', '错误', [asset], Date.now(), 'character'))
  library.packs = library.packs.filter(pack => pack.id !== 'user-pack')
  assert.equal(stickerEntryVisible(library), false)
  assert.equal(poolLibrary(library, 'character').packs[0].stickers[0].id, asset.id)
  assert.equal(library.messages[first].id, asset.id)
})
