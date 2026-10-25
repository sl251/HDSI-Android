import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Fail before publishing if npm, Android, or release notes describe different versions. */
export function previewRelease(root = '.') {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (typeof version !== 'string' || !/^0\.1\.0-preview\.\d+(?:\.\d+)*$/.test(version)) throw new Error('Unsupported preview version')
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8')
  if (lock.version !== version || lock.packages?.['']?.version !== version || gradle.match(/^\s*versionName "([^"]+)"/m)?.[1] !== version) throw new Error('npm and Android versions differ')
  const versionCode = Number(gradle.match(/^\s*versionCode (\d+)\s*$/m)?.[1])
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error('Invalid Android versionCode')
  const notes = `docs/PREVIEW${version.slice('0.1.0-preview.'.length)}.md`
  if (!statSync(join(root, notes)).isFile() || readFileSync(join(root, notes), 'utf8').split(/\r?\n/, 1)[0] !== `# HDSI Android ${version}`) throw new Error('Release notes do not match the version')
  return { version, tag: `v${version}`, notes, apk: `HDS-Android-${version}-arm64.apk`, source: `HDS-Android-${version}-source.tar.gz` }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [key, value] of Object.entries(previewRelease())) console.log(`${key}=${value}`)
}
