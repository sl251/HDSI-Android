import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, open, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { spawn } from 'node:child_process'
import type { DownloadProgress } from '../packages/contracts'

type Progress = (text: string, download?: DownloadProgress) => void
export function githubDownloadUrl(url: string, proxy: unknown = ''): string {
  if (typeof proxy !== 'string' || proxy.length > 2048) throw new Error('GitHub 加速地址无效')
  if (!proxy.trim()) return url
  let base: URL
  try { base = new URL(proxy.trim()) } catch { throw new Error('GitHub 加速地址须为 HTTPS URL') }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('GitHub 加速地址须为 HTTPS URL，不能含账号、参数或片段')
  return new URL(url).hostname === 'github.com' ? `${base.href.replace(/\/$/, '')}/${url}` : url
}

// Official upstream artifacts, never a user-provided executable or install script.
export const QQ_COMPONENTS = {
  version: 'napcat-4.18.38-qq-53644-xvfb1',
  qq: { url: 'https://qqdl.gtimg.cn/qqfile/QQNT/9.9.36/beta/9ee04bef/linuxqq_3.2.34-53644_arm64.deb', sha256: '181b895cb573548e396e54bb0548cca92ffdc1b1a4b018fa4551bb062385fdca', maxBytes: 230 * 1024 * 1024 },
  napcat: { url: 'https://github.com/NapNeko/NapCatQQ/releases/download/v4.18.38/NapCat.Shell.zip', sha256: '735f2e633247df3ffd6e8ee8b84d7039c315b2655f5807e5f0029f93d2c30016', maxBytes: 40 * 1024 * 1024 },
}
export async function command(executable: string, args: string[], signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], signal })
    let error = ''
    child.stderr.on('data', data => { error = (error + data).slice(-1000) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${executable.split('/').pop()} 执行失败 (${code}): ${error}`)))
  })
}
export async function verifiedDownload(spec: { url: string; sha256: string; maxBytes: number }, target: string, signal: AbortSignal, progress: Progress, component = '组件') {
  const hash = createHash('sha256')
  const response = await fetch(spec.url, { signal, redirect: 'follow' }).catch(error => {
    signal.throwIfAborted()
    const code = (error.cause as NodeJS.ErrnoException | undefined)?.code
    throw new Error(`${component} 下载连接失败${code ? ` (${code})` : ''}`, { cause: error })
  })
  if (!response.ok || !response.body || !response.url.startsWith('https://')) throw new Error(`组件下载失败：HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length'))
  const totalBytes = !response.headers.get('content-encoding') && Number.isSafeInteger(length) && length > 0 ? length : undefined
  if (totalBytes && totalBytes > spec.maxBytes) { await response.body.cancel(); throw new Error('组件大小超过上限') }
  let bytes = 0, last = 0
  const started = Date.now()
  const report = () => progress(`正在下载 ${component}`, { component, receivedBytes: bytes, totalBytes, bytesPerSecond: bytes / Math.max((Date.now() - started) / 1000, 0.001) })
  report()
  const check = new Transform({ transform(chunk, _, done) {
    bytes += chunk.length
    if (bytes > spec.maxBytes) { done(new Error('组件大小超过上限')); return }
    hash.update(chunk)
    if (Date.now() - last > 500) { last = Date.now(); report() }
    done(null, chunk)
  } })
  await pipeline(Readable.fromWeb(response.body as never), check, createWriteStream(target, { mode: 0o600 }), { signal })
  report()
  progress(`正在校验 ${component} SHA-256`)
  if (hash.digest('hex') !== spec.sha256) throw new Error('组件 SHA-256 不匹配，已拒绝安装')
}
export function componentsPath(directory: string) { return join(directory, QQ_COMPONENTS.version) }
export function componentsReady(directory: string) {
  const root = componentsPath(directory)
  return existsSync(join(root, '.complete')) && existsSync(join(root, 'opt/QQ/resources/app/wrapper.node')) && existsSync(join(root, 'napcat/napcat.mjs'))
}
export async function installComponents(directory: string, signal: AbortSignal, progress: Progress, githubProxy = '') {
  await mkdir(directory, { recursive: true })
  if (componentsReady(directory)) return
  const space = await statfs(directory)
  if (space.bavail * space.bsize < 1600 * 1024 * 1024) throw new Error('QQ 组件安装需要至少 1.6 GiB 可用空间')
  const staging = join(directory, '.installing')
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, 'napcat'), { recursive: true })
  try {
    progress('连接 QQ 官方下载源（1/2）')
    await verifiedDownload(QQ_COMPONENTS.qq, join(staging, 'qq.deb'), signal, progress, 'QQ · 1/2')
    progress('连接 NapCat 下载源（2/2）')
    await verifiedDownload({ ...QQ_COMPONENTS.napcat, url: githubDownloadUrl(QQ_COMPONENTS.napcat.url, githubProxy) }, join(staging, 'napcat.zip'), signal, progress, 'NapCat · 2/2')
    progress('校验通过，正在解包 QQ / NapCat')
    // Extract the ar data member without invoking package maintainer scripts.
    const deb = await open(join(staging, 'qq.deb'), 'r')
    try {
      const magic = Buffer.alloc(8); await deb.read(magic, 0, 8, 0)
      if (magic.toString() !== '!<arch>\n') throw new Error('无效 Debian 包')
      let offset = 8, found = false
      const size = (await deb.stat()).size
      while (offset + 60 <= size) {
        const header = Buffer.alloc(60); await deb.read(header, 0, 60, offset)
        const length = Number(header.subarray(48, 58).toString().trim())
        if (!Number.isSafeInteger(length) || length < 0 || offset + 60 + length > size) throw new Error('无效 Debian 包条目')
        if (header.subarray(0, 16).toString().trim().replace(/\/$/, '') === 'data.tar.xz') {
          await pipeline(createReadStream(join(staging, 'qq.deb'), { start: offset + 60, end: offset + 59 + length }), createWriteStream(join(staging, 'data.tar.xz')), { signal })
          found = true; break
        }
        offset += 60 + length + length % 2
      }
      if (!found) throw new Error('QQ 包缺少 data.tar.xz')
    } finally { await deb.close() }
    await command('/bin/tar', ['-xJf', join(staging, 'data.tar.xz'), '-C', staging, './opt/QQ'], signal)
    await command('/usr/bin/unzip', ['-q', join(staging, 'napcat.zip'), '-d', join(staging, 'napcat')], signal)
    for (const name of ['qq.deb', 'data.tar.xz', 'napcat.zip']) await rm(join(staging, name))
    if (!existsSync(join(staging, 'napcat/napcat.mjs')) || !existsSync(join(staging, 'opt/QQ/resources/app/wrapper.node'))) throw new Error('组件内容不完整')
    // Same bootstrap mechanism as the upstream NapCat Linux installer. NapCat
    // remains unchanged; QQ's application entry loads the local NapCat module.
    const packageFile = join(staging, 'opt/QQ/resources/app/package.json')
    const qqPackage = JSON.parse(await (await import('node:fs/promises')).readFile(packageFile, 'utf8'))
    qqPackage.main = './hds-load.cjs'
    await writeFile(packageFile, JSON.stringify(qqPackage, null, 2))
    await writeFile(join(staging, 'opt/QQ/resources/app/hds-load.cjs'), "void import(require('node:url').pathToFileURL(process.env.NAPCAT_MAIN_PATH).href)\n")
    await writeFile(join(staging, '.complete'), QQ_COMPONENTS.version)
    signal.throwIfAborted()
    await rm(componentsPath(directory), { recursive: true, force: true })
    await rename(staging, componentsPath(directory))
    progress('QQ 组件已安装，可以启动扫码')
  } finally { await rm(staging, { recursive: true, force: true }) }
}
