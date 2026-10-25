import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { previewRelease } from '../scripts/preview-release.mjs'

test('preview release rejects a mismatched Android version, lockfile or release notes before publishing', () => {
  const current = previewRelease()
  const root = mkdtempSync(join(tmpdir(), 'hds-release-'))
  try {
    const files = ['package.json', 'package-lock.json', 'android/app/build.gradle', current.notes]
    for (const path of files) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), readFileSync(path)) }
    assert.deepEqual(previewRelease(root), current)
    for (const path of files) {
      const original = readFileSync(join(root, path), 'utf8')
      writeFileSync(join(root, path), original.replaceAll(current.version, '0.1.0-preview.999'))
      assert.throws(() => previewRelease(root))
      writeFileSync(join(root, path), original)
    }
    assert.equal(current.tag, `v${current.version}`)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
