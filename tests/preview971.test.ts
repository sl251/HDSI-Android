import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJsonCard } from '../packages/card-format'
import type { HostConfig } from '../runtime/host'

const { startHost } = createRequire(import.meta.url)('../runtime/generated/host.cjs') as typeof import('../runtime/host')

test('authenticated RPC preserves Chinese and emoji split across transport chunks and keeps the byte limit', { timeout: 20000 }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'hds-preview971-'))
  const token = 'preview971-transport-fixture-token-longer-than-32'
  const host = await startHost({ dataDir, token, port: 0, card: parseJsonCard('{"name":"星禾","description":"朋友"}'), endpoint: 'http://127.0.0.1:1/v1', model: 'fixture', userName: '我', userProfile: '', autoAdvance: false })
  const send = (chunks: Buffer[]) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: (host.server.address() as { port: number }).port, path: '/rpc', method: 'POST', headers: { Host: '127.0.0.1:0', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, res => {
      const received: Buffer[] = []
      res.on('data', chunk => received.push(chunk))
      res.on('end', () => { try { resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(received).toString('utf8')) }) } catch (error) { reject(error) } })
    })
    req.on('error', reject)
    void (async () => { for (const chunk of chunks) { req.write(chunk); await new Promise(resolve => setTimeout(resolve, 15)) }; req.end() })()
  })
  try {
    const content = '你好🌸，明天见'
    await host.app.database.create('mobile_message', { id: 'unicode-history-fixture', direction: 'user', content, occurredAt: new Date(), status: 'accepted', images: [], audio: {} })
    const body = Buffer.from(JSON.stringify({ method: 'messages.history', payload: { query: content } }))
    const chinese = body.indexOf(Buffer.from('你')) + 1, emoji = body.indexOf(Buffer.from('🌸')) + 2
    const result = await send([body.subarray(0, chinese), body.subarray(chinese, emoji), body.subarray(emoji)])
    assert.equal(result.status, 200)
    assert.equal(result.body.data.length, 1, 'split UTF-8 must match the original persisted message')
    assert.equal(result.body.data[0].content, content)
    const oversized = await send([Buffer.from(JSON.stringify({ method: 'messages.history', payload: { query: '中'.repeat(360000) } }))])
    assert.equal(oversized.status, 400)
    assert.match(oversized.body.error, /1 MiB/)
  } finally { await host.stop(); rmSync(dataDir, { recursive: true, force: true }) }
})
