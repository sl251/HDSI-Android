import { Context, h, type Session } from 'koishi'
import { OneBotBot } from 'koishi-plugin-adapter-onebot'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import QRCode from 'qrcode'
import { componentsPath, componentsReady, installComponents, githubDownloadUrl } from './qq-components'
import { availableDisplayNumber, writeDisplayAuthority, xvfbArguments } from './qq-display'
import { newQQUser, newQQGroup, newQQWillingness, type DownloadProgress, type QQPolicy, type QQUserAccount, type QQGroupRule, type QQWillingnessPreset, type QQRecovery } from '../packages/contracts'
export type { QQPolicy } from '../packages/contracts'

export type QQMessage = { id: string; conversation: string; sender: string; name: string; content: string; time: number; outgoing: boolean }
type Inbox = { messages: QQMessage[]; read: Record<string, number>; requests: Record<string, { content: string; conversation: string; status: string }> }
const atomic = (file: string, value: unknown) => { writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 }); renameSync(file + '.tmp', file) }
/** Normalize legacy numeric allowlists and validate the complete per-account policy. */
export function qqPolicy(value: any): QQPolicy {
  const object = (row: any) => { if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('无效 QQ 设置行'); return row }
  const text = (value: any, max = 12000): string => { if (value === undefined) return ''; if (typeof value !== 'string' || value.length > max) throw new Error('QQ 设置文本无效或过长'); return value }
  const enabled = (value: any): boolean => { if (value === undefined) return true; if (typeof value !== 'boolean') throw new Error('无效 QQ 开关'); return value }
  const id = (value: any): string => { if (typeof value !== 'string' || !/^[1-9]\d{4,14}$/.test(value)) throw new Error('QQ 白名单须为数字账号，每类最多 100 个'); return value }
  const number = (value: any, fallback: number, min: number, max: number, integer = false): number => {
    if (value === undefined) return fallback
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`QQ 数值应在 ${min} 至 ${max} 之间${integer ? '，且为整数' : ''}`)
    return value
  }
  const choice = <T extends string>(value: any, choices: readonly T[], fallback: T): T => { if (value === undefined) return fallback; if (!choices.includes(value)) throw new Error('无效 QQ 设置选项'); return value }
  const list = <T,>(rows: any, key: (row: T) => string, normalize: (row: any) => T): T[] => {
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('QQ 白名单每类最多 100 个')
    const seen = new Set<string>()
    return rows.map(normalize).filter(row => { const id = key(row); if (seen.has(id)) return false; seen.add(id); return true })
  }
  if (typeof value?.enabled !== 'boolean') throw new Error('无效 QQ 设置')
  const users = list<QQUserAccount>(value.users, row => row.qq, input => {
    const row = typeof input === 'string' ? { qq: input } : object(input)
    return { ...newQQUser(), qq: id(row.qq), label: text(row.label, 200), personId: text(row.personId, 200), profile: text(row.profile), relationship: text(row.relationship), enabled: enabled(row.enabled) }
  })
  const groups = list<QQGroupRule>(value.groups, row => row.groupId, input => {
    const row = typeof input === 'string' ? { groupId: input } : object(input)
    const custom = row.willingness === undefined ? undefined : object(row.willingness)
    const keywords = row.keywords ?? custom?.keywords ?? []
    if (!Array.isArray(keywords) || keywords.length > 30 || keywords.some(item => typeof item !== 'string' || !item.trim() || item.length > 200)) throw new Error('关键词最多 30 个，每个 1 至 200 字')
    const result: QQGroupRule = { ...newQQGroup(), groupId: id(row.groupId), label: text(row.label, 200), enabled: enabled(row.enabled), purpose: text(row.purpose), characterRole: text(row.characterRole),
      responseMode: choice(row.responseMode, ['mention-only', 'always'], 'mention-only'),
      contextLimit: number(row.contextLimit, 20, 4, 100, true), debounceSeconds: number(row.debounceSeconds, 1, 0, 10),
      cooldownSeconds: number(row.cooldownSeconds, 60, 0, 86400, true), historicalImageLimit: number(row.historicalImageLimit, 3, 0, 6, true),
      willingnessPreset: choice<QQWillingnessPreset>(row.willingnessPreset, ['off', 'quiet', 'reserved', 'normal', 'active', 'eager', 'auto', 'custom'], 'off'), keywords: [...new Set(keywords.map(item => item.trim()))],
    }
    if (custom) {
      const defaults = newQQWillingness()
      result.willingness = { ...defaults, enabled: custom.enabled === undefined ? defaults.enabled : enabled(custom.enabled) }
      for (const key of ['maxScore', 'threshold', 'probabilityAmplifier', 'decayHalfLifeSeconds', 'replyCost', 'baseGain', 'quoteGain', 'keywordGain'] as const) {
        result.willingness[key] = number(custom[key], defaults[key], key === 'maxScore' ? 0.1 : key === 'decayHalfLifeSeconds' ? 10 : 0, key === 'decayHalfLifeSeconds' ? 86400 : 10, key === 'decayHalfLifeSeconds')
      }
    }
    if (row.willingnessAuto !== undefined) {
      const auto = object(row.willingnessAuto)
      result.willingnessAuto = Object.fromEntries(['busy', 'idle', 'asleep'].filter(key => auto[key] !== undefined).map(key => [key, choice(auto[key], ['quiet', 'reserved', 'normal', 'active', 'eager'], 'quiet')]))
    }
    return result
  })
  return { enabled: value.enabled, users, groups }
}
export function plainMessage(content: string) {
  const text = h.parse(content).map(part => part.type === 'text' ? part.attrs.content : part.type === 'at' ? `@${part.attrs.name || part.attrs.id || '成员'} ` : `[${({ image: '图片', audio: '语音', video: '视频', file: '文件', face: '表情', quote: '引用' } as Record<string, string>)[part.type] || '消息'}]`).join('')
  // Bound a 200-message history below the native bridge's 4 MiB response cap.
  return text.length > 4000 ? text.slice(0, 4000) + '…（信箱显示已截断）' : text
}
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

const RESTART_INTERVAL = 30000
const MAX_RECOVERIES = 5
const STABLE_LOGIN = 60000
const QUICK_LOGIN_TIMEOUT = 30000
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Both launchers are session leaders. Keep their pgids even after exit: Electron
 * descendants can outlive the launcher and continue holding the QQ login lock.
 * Never signal the surrounding HDS/PRoot group or find processes by name. */
export async function terminateQQProcesses(children: readonly ChildProcess[], graceMs = 1500) {
  const groups = [...new Set(children.flatMap(child => child.pid ? [child.pid] : []))]
  const signal = (pid: number, value: NodeJS.Signals | 0) => {
    try { process.kill(-pid, value); return true } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
  }
  for (const pid of groups) signal(pid, 'SIGTERM')
  if (groups.some(pid => signal(pid, 0))) await sleep(graceMs)
  // Escalate the entire group even when its leader exited on SIGTERM.
  for (const pid of groups) signal(pid, 'SIGKILL')
  await Promise.all(children.map(child => child.pid && child.exitCode === null && child.signalCode === null
    ? new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { child.off('exit', exited); reject(new Error('QQ 进程清理超时，请停止 QQ 后重试')) }, 2000)
      const exited = () => { clearTimeout(timeout); resolve() }
      child.once('exit', exited)
    }) : Promise.resolve()))
  // SIGKILL delivery is asynchronous. Wait for group members to stop executing
  // before a new QQ can touch the login cache; zombies hold no files/locks.
  const liveMembers = () => readdirSync('/proc').some(name => {
    if (!/^\d+$/.test(name)) return false
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      return groups.includes(Number(fields[2])) && !['Z', 'X'].includes(fields[0])
    } catch (error) {
      // Android may hide other UIDs' /proc entries; they cannot belong to the
      // private groups we spawned. Our own children remain visible in PRoot.
      if (['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code || '')) return false
      throw error
    }
  })
  if (groups.length) {
    const deadline = Date.now() + 2000
    while (liveMembers()) {
      if (Date.now() >= deadline) throw new Error('QQ 残留进程未退出，已停止自动重启')
      await sleep(25)
    }
  }
}

/** Runs in the same PRoot as HDS. No shell interpolation, remote command API, or UI tokens. */
export class QQRuntime {
  private child?: ChildProcess
  private display?: ChildProcess
  private fork?: ReturnType<Context['plugin']>
  private webToken = ''; private credential = ''; private credentialAt = 0; private wsToken = ''
  private webPort = 0; private wsPort = 0; private startedAt = 0
  private phase = 'stopped'; private progress = ''; private error = ''; private logs: string[] = []
  private download?: DownloadProgress
  private account = ''; private nickname = ''; private qr = ''; private qrImage = ''
  private loginOnline = false; private polling = false; private closing = false
  private installation?: Promise<void>; private cancellation?: AbortController
  private timer: ReturnType<typeof setInterval>
  private policy: QQPolicy = { enabled: false, users: [], groups: [] }
  private inbox: Inbox = { messages: [], read: {}, requests: {} }
  private sending = Promise.resolve()
  private control = Promise.resolve()
  private generation = 0
  private ownedProcesses = new Set<ChildProcess>()
  private recovery: QQRecovery = { state: 'idle', attempts: 0, nextRetryAt: 0, reason: '' }
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private recoveryEpoch = 0
  private watchdogEnabled = false
  private hadLogin = false; private onlineSince = 0; private loginFailures = 0; private quickLoginDeadline = 0
  constructor(private app: Context, private directory: string, private profile: string, private config: any, private bindStory?: (account: string, users: QQUserAccount[]) => Promise<void>) {
    mkdirSync(directory, { recursive: true }); mkdirSync(join(directory, 'home'), { recursive: true }); mkdirSync(join(directory, 'config'), { recursive: true })
    if (existsSync(join(profile, 'qq-policy.json'))) this.policy = qqPolicy(JSON.parse(readFileSync(join(profile, 'qq-policy.json'), 'utf8')))
    void this.applyPolicy()
    const seen = new Set<string>()
    app.on('bot-added', bot => {
      // The adapter constructs its platform fields immediately after Bot's constructor.
      queueMicrotask(() => {
        if (bot.platform !== 'onebot') return
        const dispatch = bot.dispatch.bind(bot)
        bot.dispatch = session => {
          if (session.type === 'message' || session.type === 'message-created') {
            if (session.userId === session.selfId) return
            const id = `${session.selfId}:${session.messageId}`
            if (session.messageId) {
              if (seen.has(id) || this.inbox.messages.some(message => message.id === id)) return
              seen.add(id); if (seen.size > 4096) seen.delete(seen.values().next().value!)
            }
          }
          return dispatch(session)
        }
      })
    })
    app.middleware((session, next) => {
      if (session.platform !== 'onebot') return next()
      if (session.selfId !== this.account || session.userId === this.account || !this.policy.enabled) return
      const allowed = session.isDirect ? this.policy.users.some(row => row.enabled && row.qq === session.userId) : this.policy.groups.some(row => row.enabled && row.groupId === (session.guildId || session.channelId))
      if (allowed) return next()
    }, true)
    // Observe incoming messages before HDS's own middleware; group/private gates remain authoritative.
    app.on('message', session => { if (session.platform === 'onebot' && session.selfId === this.account) this.record(session, false) })
    app.on('send', session => { if (session.platform === 'onebot' && session.selfId === this.account) this.record(session, true) })
    app.before('send', session => {
      if (session.platform !== 'onebot') return
      const id = session.channelId?.replace(/^private:/, '') || ''
      const allowed = session.channelId?.startsWith('private:') ? this.policy.users.some(row => row.enabled && row.qq === id) : this.policy.groups.some(row => row.enabled && row.groupId === id)
      if (!this.policy.enabled || !allowed || session.selfId !== this.account || !this.loginOnline) throw new Error('QQ 自动投递已暂停或目标未授权')
    })
    this.timer = setInterval(() => void this.poll(), 2000)
  }
  private bot() { return this.app.bots.find(bot => bot.platform === 'onebot' && bot.selfId === this.account) as OneBotBot<Context> | undefined }
  private async applyPolicy() {
    Object.assign(this.config.onebot, { enabled: true, ignoreSelfMessages: true,
      botAccounts: this.policy.enabled && this.account ? [{ qq: this.account, enabled: true }] : [],
      userAccounts: this.policy.users.map(row => ({ ...row, enabled: this.policy.enabled && row.enabled })),
      groupChats: this.policy.groups.map(({ keywords, ...rule }) => ({ ...rule, enabled: this.policy.enabled && rule.enabled, assignee: this.account, willingness: { ...rule.willingness, keywords } })),
    })
    if (!this.account || !this.loginOnline) return
    // Binding and enrollment precede opening the adapter: no first chat is needed.
    await this.bindStory?.(this.account, this.policy.enabled ? this.policy.users.filter(row => row.enabled && row.qq !== this.account) : [])
    for (const group of this.policy.groups) if (this.policy.enabled && group.enabled) await this.app.database.upsert('channel', [{ platform: 'onebot', id: group.groupId, assignee: this.account }])
  }
  private inboxFile() { if (!/^[1-9]\d{4,14}$/.test(this.account)) throw new Error('QQ 账号尚未就绪'); return join(this.directory, `inbox-${this.account}.json`) }
  private saveInbox() { atomic(this.inboxFile(), this.inbox) }
  private record(session: Session, outgoing: boolean) {
    if (!outgoing && !session.userId) return
    const conversation = session.isDirect || session.channelId?.startsWith('private:') ? `private:${session.channelId?.replace(/^private:/, '') || session.userId}` : `group:${session.guildId || session.channelId}`
    const id = `${this.account}:${session.messageId}`
    if (!session.messageId || this.inbox.messages.some(message => message.id === id)) return
    this.inbox.messages.push({ id, conversation, sender: outgoing ? this.account : session.userId!, name: outgoing ? this.nickname : session.username || session.userId!, content: plainMessage(session.content || ''), time: session.timestamp || Date.now(), outgoing })
    this.inbox.messages = this.inbox.messages.slice(-2000); this.saveInbox()
  }
  private diagnostic(text: string) {
    const safe = text.replace(/https?:\/\/\S+/g, '[URL]').replaceAll(this.directory, '[qq-data]').replaceAll(this.webToken || '\0', '[token]').replaceAll(this.wsToken || '\0', '[token]').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 600)
    this.logs.push(safe); this.logs = this.logs.slice(-30)
  }
  private cancelRecovery() {
    this.watchdogEnabled = false; this.recoveryEpoch++
    clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined
  }
  private enqueueRecovery(task: () => Promise<void>) {
    const result = this.control.then(task)
    this.control = result.catch(error => this.giveUp(`QQ 自动恢复失败：${error instanceof Error ? error.message : '未知错误'}`))
  }
  private giveUp(reason: string) {
    this.cancelRecovery(); this.loginOnline = false; this.qr = ''; this.qrImage = ''
    this.recovery = { ...this.recovery, state: 'gave-up', nextRetryAt: 0, reason }
    this.phase = 'failed'; this.progress = 'QQ 自动恢复已停止，需要人工介入：请停止 QQ 后重新启动'
    this.error = reason; this.diagnostic(reason)
  }
  /** All offline sources enter here. Duplicate events from the same dying
   * process cannot queue extra launches; control serializes cleanup with UI RPCs. */
  private handleOffline(reason: string, source: 'status' | 'log' | 'process' | 'api' = 'status') {
    if (this.closing || !this.watchdogEnabled || ['cleaning', 'backoff', 'gave-up'].includes(this.recovery.state)) return
    if (this.recovery.state === 'waiting-qr' && !this.hadLogin && (source === 'status' || source === 'log')) return
    if (this.recovery.state === 'quick-login' && (source === 'status' || source === 'log')) {
      // A rejected cached login needs a scan, not another process restart.
      const generation = this.generation
      this.recovery.state = 'waiting-qr'
      this.enqueueRecovery(() => this.fallbackQr(reason, generation))
      return
    }
    this.generation++; this.loginOnline = false; this.onlineSince = 0; this.qr = ''; this.qrImage = ''
    this.recovery = { ...this.recovery, state: 'cleaning', nextRetryAt: 0, reason: reason.slice(0, 200) }
    this.phase = 'starting'; this.progress = 'QQ 自动恢复中：正在清理离线进程'; this.error = ''
    this.diagnostic(reason)
    const epoch = this.recoveryEpoch
    this.enqueueRecovery(async () => {
      if (this.closing || epoch !== this.recoveryEpoch) return
      await this.cleanupProcesses()
      if (this.closing || epoch !== this.recoveryEpoch) return
      if (this.recovery.attempts >= MAX_RECOVERIES) { this.giveUp(`QQ 连续 ${MAX_RECOVERIES} 次自动恢复未能稳定登录：${this.recovery.reason}`); return }
      const delay = Math.max(0, this.startedAt + RESTART_INTERVAL - Date.now())
      this.recovery.state = 'backoff'; this.recovery.nextRetryAt = Date.now() + delay
      this.progress = `QQ 自动恢复中：等待 ${Math.ceil(delay / 1000)} 秒后重启（${this.recovery.attempts + 1}/${MAX_RECOVERIES}）`
      this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = undefined
        this.enqueueRecovery(async () => {
          if (this.closing || epoch !== this.recoveryEpoch) return
          this.recovery.state = 'restarting'; this.recovery.attempts++; this.recovery.nextRetryAt = 0
          this.startedAt = Date.now()
          try { await this.launch() } catch (error) { this.handleOffline(`QQ 重启失败：${error instanceof Error ? error.message : '启动失败'}`, 'process') }
        })
      }, delay)
    })
  }
  private async cleanupProcesses() {
    const fork = this.fork; this.fork = undefined
    const children = [...new Set([...this.ownedProcesses, ...[this.child, this.display].filter((child): child is ChildProcess => !!child)])]
    const dispose = async () => {
      if (!fork) return
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([Promise.resolve().then(() => fork.dispose()), new Promise<void>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('QQ 消息通道关闭超时')), 2000)
        })])
      } finally { clearTimeout(timeout) }
    }
    // A stuck adapter must not prevent OS cleanup, nor allow a second adapter.
    const [processes, adapter] = await Promise.allSettled([terminateQQProcesses(children), dispose()])
    if (processes.status === 'fulfilled') {
      this.ownedProcesses.clear(); this.child = undefined; this.display = undefined
      this.credential = ''; this.credentialAt = 0
    } else throw processes.reason
    if (adapter.status === 'rejected') throw adapter.reason
  }
  private async fallbackQr(reason: string, generation: number) {
    if (this.closing || generation !== this.generation) return
    this.recovery.state = 'waiting-qr'; this.recovery.reason = reason.slice(0, 200)
    this.qr = ''; this.qrImage = ''; this.quickLoginDeadline = 0
    try {
      await this.api('QQLogin/RefreshQRcode')
      if (this.closing || generation !== this.generation) return
      this.phase = 'qr'; this.progress = 'QQ 自动恢复未能快速登录，请用官方 QQ 扫码确认登录'; this.error = ''
      this.diagnostic(reason)
    } catch (error) {
      if (this.closing || generation !== this.generation) return
      this.handleOffline(`QQ 二维码刷新失败：${error instanceof Error ? error.message : '接口未就绪'}`, 'api')
    }
  }
  private async recoveryLogin(generation: number) {
    try {
      // Same source as the UI's “已登录过的账号”; never guess from inbox files.
      const accounts = await this.api('QQLogin/GetQuickLoginListNew')
      if (this.closing || generation !== this.generation) return
      const cached = Array.isArray(accounts) ? accounts.find(row => row.isQuickLogin && /^[1-9]\d{4,14}$/.test(String(row.uin)) && (!this.account || String(row.uin) === this.account)) : undefined
      if (!cached) { await this.fallbackQr('没有可用的已登录账号缓存', generation); return }
      this.recovery.state = 'quick-login'; this.quickLoginDeadline = Date.now() + QUICK_LOGIN_TIMEOUT
      this.progress = `QQ 自动恢复中：正在快速登录 ${cached.uin}`
      await this.api('QQLogin/SetQuickLogin', { uin: String(cached.uin) })
    } catch (error) {
      await this.fallbackQr(`QQ 快速登录失败：${error instanceof Error ? error.message : '登录失败'}`, generation)
    }
  }
  private watchChild(child: ChildProcess, generation: number) {
    for (const stream of [child.stdout, child.stderr]) {
      let pending = ''
      const line = (text: string) => {
        if (this.child !== child || generation !== this.generation || this.closing) return
        if (/\[SelfOffline\]|\[KickedOffLine\]|账号状态变更为离线/.test(text)) this.handleOffline('QQ 离线通知（SelfOffline / KickedOffLine）', 'log')
        if (/error|fatal|sandbox|failed|not found|undefined symbol|cannot|失败/i.test(text) && !/qrcode|二维码|token|message content/i.test(text)) this.diagnostic(text)
      }
      stream?.on('data', data => {
        pending += data.toString()
        const lines = pending.split(/\r?\n/); pending = lines.pop()!.slice(-8192)
        for (const text of lines) line(text)
        if (/\[SelfOffline\]|\[KickedOffLine\]|账号状态变更为离线/.test(pending)) line(pending)
      })
      stream?.on('end', () => { if (pending) line(pending) })
    }
    child.once('error', error => { if (this.child === child && generation === this.generation) this.handleOffline(`QQ 无法启动：${error.message}`, 'process') })
    child.once('exit', (code, signal) => { if (this.child === child && generation === this.generation) this.handleOffline(`QQ 进程退出（${signal || code}）`, 'process') })
  }
  async api(method: string, data: unknown = {}, authenticate = true): Promise<any> {
    const generation = this.generation
    const current = () => { if (this.closing || generation !== this.generation) throw new Error('QQ 请求所属进程已失效') }
    if (authenticate && (!this.credential || Date.now() - this.credentialAt > 3000000)) {
      const login = await this.api('auth/login', { hash: createHash('sha256').update(this.webToken + '.napcat').digest('hex') }, false)
      current()
      if (typeof login.Credential !== 'string') throw new Error('QQ 本地管理接口认证失败')
      this.credential = login.Credential; this.credentialAt = Date.now()
    }
    current()
    const response = await fetch(`http://127.0.0.1:${this.webPort}/api/${method}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', ...(authenticate ? { Authorization: `Bearer ${this.credential}` } : {}) }, body: JSON.stringify(data) })
    if (!response.ok) throw new Error(`QQ 本地接口 HTTP ${response.status}`)
    const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let bytes = 0
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1024 * 1024) throw new Error('QQ 响应过大'); chunks.push(chunk.value) } } finally { await reader.cancel() }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    current()
    if (result.code !== 0) { this.credential = ''; throw new Error(String(result.message || 'QQ 请求失败').slice(0, 200)) }
    return result.data
  }
  private async poll() {
    if (!this.child || this.polling || this.closing || ['cleaning', 'backoff', 'gave-up'].includes(this.recovery.state)) return
    this.polling = true
    const generation = this.generation
    let stage: 'login' | 'channel' = 'login'
    try {
      const status = await this.api('QQLogin/CheckLoginStatus')
      if (this.closing || !this.child || generation !== this.generation) return
      this.loginFailures = 0
      if (status.isOffline || (this.hadLogin && status.isLogin !== true)) {
        this.handleOffline('QQ 状态变更为离线', 'status')
        if (this.recovery.state !== 'waiting-qr') return
      }
      this.loginOnline = status.isLogin === true && status.coreReady === true
      if (this.loginOnline) {
        this.hadLogin = true
        if (!this.onlineSince) this.onlineSince = Date.now()
        // A brief login between crashes does not reset the circuit breaker.
        if (Date.now() - this.onlineSince >= STABLE_LOGIN) this.recovery.attempts = 0
        this.recovery.state = 'idle'; this.recovery.nextRetryAt = 0; this.recovery.reason = ''
        stage = 'channel'
        this.qr = ''; this.qrImage = ''; this.progress = 'QQ 已登录，正在连接消息通道'
        const info = await this.api('QQLogin/GetQQLoginInfo')
        if (this.closing || generation !== this.generation) return
        const account = String(info.uin || '')
        if (!/^[1-9]\d{4,14}$/.test(account)) throw new Error('QQ 返回无效账号')
        if (this.account !== account || !this.fork) {
          if (this.fork) { await this.fork.dispose(); this.fork = undefined }
          this.account = account; this.nickname = String(info.nick || account).slice(0, 100)
          this.inbox = existsSync(this.inboxFile()) ? JSON.parse(readFileSync(this.inboxFile(), 'utf8')) : { messages: [], read: {}, requests: {} }
          await this.applyPolicy()
          if (this.closing || generation !== this.generation) return
          // A named export avoids CJS/ESM default wrapping in the APK bundle.
          // Validate before plugin registration: Cordis records schema errors
          // on a failed scope instead of always throwing them to this caller.
          const options = OneBotBot.Config({ selfId: account, protocol: 'ws', endpoint: `ws://127.0.0.1:${this.wsPort}`, token: this.wsToken, retryTimes: 60, retryInterval: 3000, retryLazy: 3000, responseTimeout: 15000 })
          this.fork = this.app.plugin(OneBotBot, options)
        }
        this.qr = ''; this.qrImage = ''; this.phase = this.bot()?.status === 1 ? 'online' : 'connecting'; this.error = ''
        this.progress = this.phase === 'online' ? 'QQ 与 HDS 消息通道已连接' : 'QQ 已登录，正在连接消息通道'
      } else {
        this.onlineSince = 0
        if (this.recovery.state === 'restarting') { await this.recoveryLogin(generation); return }
        if (this.recovery.state === 'quick-login') {
          if (status.loginError || Date.now() >= this.quickLoginDeadline) await this.fallbackQr(String(status.loginError || 'QQ 快速登录超时'), generation)
          return
        }
        this.phase = status.isOffline && this.recovery.state !== 'waiting-qr' ? 'offline' : ['qrcode_scanned', 'initializing'].includes(status.loginPhase) ? 'confirming' : 'qr'
        this.progress = this.phase === 'confirming' ? '已扫码，等待手机确认与 QQ 初始化' : this.recovery.state === 'waiting-qr' ? 'QQ 自动恢复未能快速登录，请用官方 QQ 扫码确认登录' : this.phase === 'offline' ? 'QQ 已离线，请重新登录' : '请用官方 QQ 扫码确认登录'
        this.error = String(status.loginError || '').slice(0, 200)
        const qr = String(status.qrcodeurl || '')
        if (qr !== this.qr) {
          const image = qr && qr.length < 4096 ? await QRCode.toDataURL(qr, { width: 320, margin: 2 }) : ''
          if (this.closing || generation !== this.generation) return
          this.qr = qr; this.qrImage = image
        }
      }
    } catch (error) {
      if (this.closing || generation !== this.generation) return
      if (stage === 'login') {
        this.loginOnline = false; this.onlineSince = 0; this.loginFailures++
        const booting = !this.hadLogin && this.recovery.state !== 'waiting-qr' && ['starting', 'restarting', 'quick-login'].includes(this.recovery.state === 'idle' ? this.phase : this.recovery.state)
        if (booting && Date.now() - this.startedAt < 120000) return
        if (booting || this.loginFailures >= 3) {
          this.handleOffline(`QQ 状态接口持续不可用：${error instanceof Error ? error.message : '连接中断'}`, 'api'); return
        }
      }
      this.phase = 'failed'
      this.progress = stage === 'channel' ? 'QQ 已登录，消息通道未连接，将自动重试' : '暂时无法确认 QQ 状态，将自动重试'
      this.error = `${stage === 'channel' ? 'QQ 消息通道初始化失败' : 'QQ 状态未就绪'}：${error instanceof Error ? error.message : '连接中断'}`
      this.qrImage = ''
    } finally { this.polling = false }
  }
  async start() {
    if (this.child || this.installation || this.phase === 'starting') throw new Error('QQ 正在运行、安装或自动恢复，请先停止')
    if (!componentsReady(this.directory)) throw new Error('请先下载 QQ 组件')
    this.cancelRecovery(); this.watchdogEnabled = true
    this.recovery = { state: 'idle', attempts: 0, nextRetryAt: 0, reason: '' }
    try { await this.launch() } catch (error) {
      this.handleOffline(`QQ 启动失败：${error instanceof Error ? error.message : '启动失败'}`, 'process')
      throw error
    }
  }
  private async launch() {
    if (this.child || this.installation) throw new Error('QQ 正在运行或安装，请先停止')
    if (!componentsReady(this.directory)) throw new Error('请先下载 QQ 组件')
    this.generation++; this.closing = false; this.phase = 'starting'; this.progress = this.recovery.state === 'restarting' ? `QQ 自动恢复中：正在重启（${this.recovery.attempts}/${MAX_RECOVERIES}）` : '启动本机 QQ，首次加载可能需要两分钟'; this.error = ''; this.startedAt = Date.now()
    const generation = this.generation
    this.hadLogin = false; this.onlineSince = 0; this.loginFailures = 0; this.quickLoginDeadline = 0
    this.webToken = randomBytes(32).toString('hex'); this.wsToken = randomBytes(32).toString('hex'); this.credential = ''
    this.webPort = await freePort(); this.wsPort = await freePort()
    if (this.closing || generation !== this.generation) return
    const configDir = join(this.directory, 'config')
    atomic(join(configDir, 'webui.json'), { host: '127.0.0.1', port: this.webPort, token: this.webToken, autoLoginAccount: '', loginRate: 100, disableWebUI: false })
    const network = { network: { websocketServers: [{ name: 'hds-local', enable: true, host: '127.0.0.1', port: this.wsPort, token: this.wsToken, messagePostFormat: 'array', reportSelfMessage: false, enableForcePushEvent: true }] } }
    for (const filename of ['onebot11.json', ...readdirSync(configDir).filter(name => /^onebot11_\d+\.json$/.test(name))]) atomic(join(configDir, filename), network)
    const root = componentsPath(this.directory), qq = join(root, 'opt/QQ/resources/app')
    // Use the upstream installer path: official QQ + NapCat application entry,
    // with a private virtual display. No window is shown outside the container.
    const displayNumber = availableDisplayNumber()
    const authority = join(this.directory, 'display.auth')
    writeDisplayAuthority(authority, displayNumber)
    const display = spawn('/usr/bin/Xvfb', xvfbArguments(displayNumber, authority), { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    this.display = display; this.ownedProcesses.add(display)
    display.stderr?.on('data', data => this.diagnostic(String(data)))
    let displayFailure = ''
    const displayFailed = (reason: string) => {
      displayFailure = reason
      if (this.display === display && generation === this.generation) this.handleOffline(reason, 'process')
    }
    display.once('error', error => displayFailed(`Xvfb 无法启动：${error.message}`))
    display.once('exit', code => displayFailed(`Xvfb 退出：${code}`))
    const deadline = Date.now() + 10000
    while (!existsSync(`/tmp/.X11-unix/X${displayNumber}`)) {
      if (this.closing || generation !== this.generation) return
      if (displayFailure || Date.now() > deadline) throw new Error(displayFailure || 'QQ 虚拟显示初始化超时')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (this.closing || generation !== this.generation) return
    if (displayFailure || display.exitCode !== null) throw new Error(displayFailure || `Xvfb 退出：${display.exitCode}`)
    const environment: NodeJS.ProcessEnv = { ...process.env,
      DISPLAY: `:${displayNumber}`, XAUTHORITY: authority, NAPCAT_MAIN_PATH: join(root, 'napcat/napcat.mjs'),
      HOME: join(this.directory, 'home'), XDG_CONFIG_HOME: join(this.directory, 'home/.config'), NAPCAT_WORKDIR: this.directory,
      NAPCAT_WRAPPER_PATH: join(qq, 'wrapper.node'), NAPCAT_QQ_PACKAGE_INFO_PATH: join(qq, 'package.json'),
      NAPCAT_DISABLE_PIPE: '1', NAPCAT_DISABLE_TIME_SYNC: '1', NAPCAT_DISABLE_BYPASS: '1',
      // Linux QQ's libbugly references GnuTLS symbols supplied by its desktop
      // process. Node needs the same library in the global loader namespace.
      LD_PRELOAD: '/usr/lib/aarch64-linux-gnu/libgnutls.so.30',
      LD_LIBRARY_PATH: [qq, join(qq, 'sharp-lib'), join(qq, 'lib'), join(root, 'opt/QQ'), '/usr/lib/aarch64-linux-gnu'].join(':'),
    }
    delete environment.ELECTRON_RUN_AS_NODE
    const child = spawn(join(root, 'opt/QQ/qq'), ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], { cwd: join(root, 'opt/QQ'), env: environment, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child; this.ownedProcesses.add(child)
    this.watchChild(child, generation)
    await this.poll()
  }
  async stop() {
    this.cancelRecovery()
    this.generation++; this.closing = true; this.loginOnline = false; this.qrImage = ''; this.qr = ''
    this.cancellation?.abort(); await this.installation
    await this.cleanupProcesses()
    this.recovery = { state: 'idle', attempts: 0, nextRetryAt: 0, reason: '' }
    this.phase = 'stopped'; this.progress = 'QQ 已停止，登录记录保留'; this.error = ''
  }
  async close() {
    this.cancelRecovery(); this.closing = true; this.generation++
    clearInterval(this.timer); await this.control; await this.stop(); await this.sending
  }
  status() { return { phase: this.phase, installed: componentsReady(this.directory), running: !!this.child, loggedIn: this.loginOnline, progress: this.progress, download: this.download, error: this.error, account: this.account, nickname: this.nickname, qr: this.qrImage, policy: this.policy, logs: this.logs, online: this.loginOnline && this.bot()?.status === 1, recovery: { ...this.recovery } } }
  async dispatch(method: string, payload: any) {
    // Invalidate queued/timed recovery immediately, even while a launch is awaiting I/O.
    if (method === 'qq.stop') { this.cancelRecovery(); this.closing = true; this.generation++ }
    if (['qq.install', 'qq.start', 'qq.stop', 'qq.refreshQr', 'qq.quickLogin', 'qq.policy'].includes(method)) {
      const result = this.control.then(() => this.handle(method, payload))
      this.control = result.then(() => {}, () => {})
      return result
    }
    return this.handle(method, payload)
  }
  private async handle(method: string, payload: any) {
    if (method === 'qq.status') return this.status()
    if (method === 'qq.install') {
      if (this.child || this.installation || this.phase === 'starting') throw new Error('请先停止 QQ 或等待当前安装')
      const proxy = payload?.githubProxy ?? ''
      githubDownloadUrl('https://github.com/NapNeko/NapCatQQ', proxy)
      this.cancellation = new AbortController(); this.phase = 'installing'; this.error = ''
      this.download = undefined; this.progress = '检查组件与可用空间'
      const timeout = setTimeout(() => this.cancellation?.abort(), 15 * 60 * 1000)
      this.installation = installComponents(this.directory, this.cancellation.signal, (text, download) => { this.progress = text; this.download = download }, proxy)
        .then(() => { this.phase = 'stopped' }).catch(error => { this.phase = 'failed'; this.error = this.cancellation?.signal.aborted ? '安装已取消或超时，可重新下载' : error.message }).finally(() => { clearTimeout(timeout); this.installation = undefined; this.download = undefined })
      return this.status()
    }
    if (method === 'qq.start') { await this.start(); return this.status() }
    if (method === 'qq.stop') { await this.stop(); return this.status() }
    if (['qq.refreshQr', 'qq.quickLogin'].includes(method) && ['cleaning', 'backoff', 'restarting', 'quick-login'].includes(this.recovery.state)) throw new Error('QQ 自动恢复中，请稍候或先停止 QQ')
    if (method === 'qq.refreshQr') {
      if (!this.child) throw new Error('请先启动 QQ')
      if ((await this.api('QQLogin/CheckLoginStatus')).isLogin !== true) { await this.api('QQLogin/RefreshQRcode'); this.qr = '' }
      await this.poll(); return this.status()
    }
    if (method === 'qq.accounts') return this.child ? await this.api('QQLogin/GetQuickLoginListNew') : []
    if (method === 'qq.quickLogin') {
      if (!/^[1-9]\d{4,14}$/.test(payload.uin || '')) throw new Error('无效 QQ 账号')
      if (!this.child) throw new Error('请先启动 QQ')
      if ((await this.api('QQLogin/CheckLoginStatus')).isLogin === true) { await this.poll(); return { accepted: false, alreadyLoggedIn: true } }
      await this.api('QQLogin/SetQuickLogin', { uin: payload.uin }); return { accepted: true }
    }
    if (method === 'qq.policy') { this.policy = qqPolicy(payload); atomic(join(this.profile, 'qq-policy.json'), this.policy); await this.applyPolicy(); return this.policy }
    if (method === 'qq.conversations') {
      const map = new Map<string, any>()
      for (const message of this.inbox.messages) { const row = map.get(message.conversation) || { id: message.conversation, unread: 0 }; Object.assign(row, { last: message.content, time: message.time, name: message.conversation.startsWith('group:') ? `群 ${message.conversation.slice(6)}` : message.outgoing ? row.name || message.conversation.slice(8) : message.name }); if (!message.outgoing && message.time > (this.inbox.read[message.conversation] || 0)) row.unread++; map.set(row.id, row) }
      return [...map.values()].sort((a, b) => b.time - a.time)
    }
    if (method === 'qq.history') {
      if (!/^(private|group):[1-9]\d{4,14}$/.test(payload.conversation || '')) throw new Error('无效会话')
      if (this.account) { this.inbox.read[payload.conversation] = Date.now(); this.saveInbox() }
      return this.inbox.messages.filter(message => message.conversation === payload.conversation).slice(-200)
    }
    if (method === 'qq.send') {
      const { conversation, requestId } = payload, content = String(payload.content || '').trim()
      if (!/^(private|group):[1-9]\d{4,14}$/.test(conversation || '') || !/^[a-zA-Z0-9-]{8,64}$/.test(requestId || '') || !content || content.length > 4000) throw new Error('无效 QQ 消息')
      const send = async () => {
        const bot = this.bot(); if (!bot || !this.status().online) throw new Error('QQ 消息通道尚未在线')
        const old = this.inbox.requests[requestId]
        if (old) { if (old.content !== content || old.conversation !== conversation) throw new Error('消息编号冲突'); if (old.status !== 'sent') throw new Error('上次发送结果不明，请先在官方 QQ 核对，避免重复发送'); return { sent: true, duplicate: true } }
        this.inbox.requests[requestId] = { conversation, content, status: 'pending' }; this.saveInbox()
        const peer = conversation.split(':')[1]
        // Text segment prevents CQ-code injection; manual sending is a distinct user action.
        const message = [{ type: 'text', data: { text: content } }]
        const receipt = conversation.startsWith('private:') ? await bot.internal.sendPrivateMsg(peer, message) : await bot.internal.sendGroupMsg(peer, message)
        this.inbox.requests[requestId].status = 'sent'
        this.inbox.messages.push({ id: `${this.account}:${receipt}`, conversation, sender: this.account, name: this.nickname, content, time: Date.now(), outgoing: true }); this.inbox.messages = this.inbox.messages.slice(-2000)
        const keys = Object.keys(this.inbox.requests); for (const key of keys.slice(0, Math.max(0, keys.length - 2000))) delete this.inbox.requests[key]
        this.saveInbox(); return { sent: true }
      }
      const result = this.sending.then(send); this.sending = result.then(() => {}, () => {}); return result
    }
    throw new Error('不允许的 QQ 方法')
  }
}
