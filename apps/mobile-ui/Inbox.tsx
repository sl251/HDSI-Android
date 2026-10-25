import React, { useEffect, useRef, useState } from 'react'
import { newQQUser, newQQGroup, newQQWillingness, type NativeBridge, type QQStatus, type QQConversation, type QQMessage, type QQPolicy, type QQUserAccount, type QQGroupRule, type QQWillingnessPreset } from '../../packages/contracts'

const phases: Record<string, string> = { stopped: '尚未连接', installing: '准备组件', starting: '启动中', qr: '等待扫码', confirming: '等待确认', connecting: '连接消息通道', online: '在线', offline: '已离线', failed: '需要检查' }
const formatTime = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
export function Inbox({ bridge, healthy, native, configure, onRootBack, backHandler, onUnread }: { onRootBack?: () => void; backHandler?: React.MutableRefObject<(() => boolean) | null>; onUnread?: (count: number) => void; bridge: NativeBridge; healthy: boolean; native: boolean; configure: () => void }) {
  const [status, setStatus] = useState<QQStatus | null>(null)
  const [conversations, setConversations] = useState<QQConversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<QQMessage[]>([])
  const [draft, setDraft] = useState(''), [peer, setPeer] = useState(''), [kind, setKind] = useState('private')
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [showLogin, setShowLogin] = useState(true)
  const [policyOpen, setPolicyOpen] = useState(false), [groupsOpen, setGroupsOpen] = useState(false)
  const [policy, setPolicy] = useState<QQPolicy>({ enabled: false, users: [], groups: [] })
  const [accounts, setAccounts] = useState<{ uin: string; nickName: string; isQuickLogin: boolean }[]>([])
  const [githubProxy, setGithubProxy] = useState('')
  const request = useRef<{ requestId: string; content: string; conversation: string } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const rpc = async <T,>(method: string, payload?: Record<string, unknown>) => (await bridge.rpc({ method, payload })).data as T
  const act = async (task: () => Promise<unknown>) => { setBusy(true); setNotice(''); try { await task() } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  useEffect(() => {
    if (!healthy || !native) { setStatus(null); return }
    let cancelled = false, running = false
    const poll = async () => {
      if (cancelled || running) return
      running = true
      try {
        const next = await rpc<QQStatus>('qq.status')
        if (cancelled) return
        setStatus(next)
        const rows = await rpc<QQConversation[]>('qq.conversations')
        if (!cancelled) setConversations(rows)
        if (selected) { const history = await rpc<QQMessage[]>('qq.history', { conversation: selected }); if (!cancelled) setMessages(history) }
      } catch (error) { if (!cancelled) setNotice(error instanceof Error ? error.message : String(error)) } finally { running = false }
    }
    void poll(); const timer = setInterval(() => { if (!document.hidden) void poll() }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [healthy, native, selected])
  useEffect(() => { scroll.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length])
  const select = (id: string) => { setSelected(id); setMessages([]); setDraft(''); request.current = null }
  useEffect(() => {
    if (!backHandler) return
    backHandler.current = () => {
      if (policyOpen) { setPolicyOpen(false); return true }
      if (selected) { select(''); return true }
      return false
    }
    return () => { backHandler.current = null }
  }, [backHandler, policyOpen, selected])
  useEffect(() => { if (healthy && native) onUnread?.(conversations.reduce((sum, row) => sum + row.unread, 0)) }, [conversations, healthy, native, onUnread])
  const send = () => act(async () => {
    const content = draft.trim()
    if (!request.current || request.current.content !== content || request.current.conversation !== selected) request.current = { requestId: crypto.randomUUID(), content, conversation: selected }
    await rpc('qq.send', request.current); setDraft(''); request.current = null
    setMessages(await rpc('qq.history', { conversation: selected }))
  })
  const editPolicy = () => { setPolicy(structuredClone(status?.policy || policy)); setPolicyOpen(true) }
  const editUser = (index: number, patch: Partial<QQUserAccount>) => setPolicy(current => ({ ...current, users: current.users.map((row, i) => i === index ? { ...row, ...patch } : row) }))
  const editGroup = (index: number, patch: Partial<QQGroupRule>) => setPolicy(current => ({ ...current, groups: current.groups.map((row, i) => i === index ? { ...row, ...patch } : row) }))
  const presets: Record<QQWillingnessPreset, string> = { off: '关闭', quiet: '极少', reserved: '谨慎', normal: '标准', active: '活跃', eager: '热情', auto: '跟随她的日常', custom: '自定义' }
  const groupBadge = (row: QQGroupRule) => !row.enabled ? '已停用' : `${row.responseMode === 'always' ? '全部消息' : '仅@'} · ${row.willingnessPreset === 'off' ? `冷却${row.cooldownSeconds}s` : `${presets[row.willingnessPreset]} · ${row.willingnessPreset} 档`}`
  const numeric = (label: string, value: number, min: number, max: number, change: (value: number) => void, step: number | 'any' = 1) => <label>{label}<input type="number" required inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={event => change(event.target.value === '' ? NaN : Number(event.target.value))} /></label>
  const renderRows = (rows: QQConversation[]) => rows.map(row => <button className="letter-row" key={row.id} onClick={() => select(row.id)}><span className="letter-avatar">{row.id.startsWith('group:') ? '群' : row.name.slice(0, 1)}</span><span className="letter-content"><span className="letter-title">{row.name}<time>{formatTime(row.time)}</time></span><span className="letter-preview">{row.last || '新会话'}</span></span>{row.unread > 0 && <span className="letter-unread" aria-label={`${row.unread} 条未读`}>{row.unread > 99 ? '99+' : row.unread}</span>}</button>)
  return <section className="inbox-page accordion">
    <div className="page-heading"><div><div className="eyebrow">LETTERS FROM EVERYDAY LIFE</div><h1>信箱<span>。</span></h1><p>把故事，接进真实的日常。</p></div><span className="chapter">02 / QQ</span></div>
    {!selected && onRootBack && <button className="text-button" onClick={onRootBack}>返回空间</button>}
    {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="关闭 QQ 提示">×</button></div>}
    {!healthy ? <div className="qq-onboarding"><span className="letter-stamp">待启封</span><h2>先让故事开始运行</h2><p>在设置中准备环境、保存模型并启动 HDS，然后回来下载 QQ 组件、扫码登录。</p><ol><li>准备本机环境与角色</li><li>下载 QQ 组件并扫码</li><li>选择允许角色回复的人</li></ol><button className="primary" onClick={configure}>前往设置 →</button><p className="caption">手机本地运行 · 无需电脑常驻或终端配置</p></div> : <>
      <div className="qq-account"><span className={`qq-indicator ${status?.online ? 'online' : ''}`} /><div><strong>{status?.nickname || 'QQ 本地连接'}{status?.account && <small>{status.account}</small>}</strong><span>{phases[status?.phase || 'stopped'] || '等待状态'} · {status?.policy.enabled ? '白名单自动回复' : '自动回复关闭'}</span></div><button onClick={() => setShowLogin(!showLogin)} aria-expanded={showLogin}>{showLogin ? '收起' : '管理'}</button></div>
      {showLogin && <section className="qq-login">
        <div className="section-title"><h2>{status?.online ? '已经连接' : status?.loggedIn ? 'QQ 已登录' : status?.installed ? '扫码，让角色上线' : '准备 QQ 组件'}</h2><span className="tag">实验接入</span></div>
        <p>{status?.progress || '从腾讯与 NapCat 官方来源下载，完成校验后在手机内运行。下载约 235 MiB，安装时需 1.6 GiB 可用空间。'}</p>
        {status?.error && <p className="qq-error" role="alert">{status.error}</p>}
        {status?.qr && !status.online && <div className="qq-qr"><img src={status.qr} width="256" height="256" alt="QQ 登录二维码，请使用官方 QQ 扫描" /><p>用官方 QQ 扫描并确认登录。<br />同机可尝试保存后从相册识别；不支持时请用另一台设备展示二维码。</p><button className="secondary" disabled={busy} onClick={() => act(async () => { const result = await bridge.saveQQQr({ base64: status.qr.split(',')[1] }); setNotice(result.cancelled ? '已取消保存' : '二维码已保存，请及时扫码；二维码过期后重新获取。') })}>保存二维码</button></div>}
        {status?.phase === 'installing' && <div className="download-progress" role="status">
          <progress aria-label={status.download ? `${status.download.component} 下载进度` : status.progress} max={status.download?.totalBytes || 1} value={status.download?.totalBytes ? Math.min(status.download.receivedBytes, status.download.totalBytes) : undefined} />
          {status.download && <span>{(status.download.receivedBytes / 1048576).toFixed(1)} MiB{status.download.totalBytes ? ` / ${(status.download.totalBytes / 1048576).toFixed(1)} MiB · ${Math.min(100, Math.floor(status.download.receivedBytes / status.download.totalBytes * 100))}%` : ' · 总大小未知'} · {(status.download.bytesPerSecond / 1048576).toFixed(1)} MiB/s</span>}
        </div>}
        {!status?.installed && <details className="download-options"><summary>下载网络设置</summary><label>GitHub 加速地址（可选）<input type="url" value={githubProxy} disabled={busy || status?.phase === 'installing'} onChange={event => setGithubProxy(event.target.value)} placeholder="https://你信任的加速服务/" autoCapitalize="none" spellCheck={false} /></label><p className="caption">默认直连。无法访问 GitHub 时，可填写支持“加速地址/https://github.com/…”的 HTTPS 服务，仅用于 NapCat 下载。QQ 仍从腾讯下载，文件均校验 SHA-256。</p></details>}
        <div className="actions">
          {!status?.installed && <button className="primary" disabled={busy || status?.phase === 'installing'} onClick={() => act(async () => setStatus(await rpc('qq.install', { githubProxy })))}>下载并准备组件</button>}
          {status?.installed && !status.running && <button className="primary" disabled={busy || status.phase === 'installing'} onClick={() => act(async () => setStatus(await rpc('qq.start')))}>启动 QQ · 获取二维码</button>}
          {status?.running && !status.loggedIn && <button className="secondary" disabled={busy} onClick={() => act(async () => setStatus(await rpc('qq.refreshQr')))}>刷新二维码</button>}
          {(status?.running || status?.phase === 'installing') && <button className="secondary" disabled={busy} onClick={() => act(async () => setStatus(await rpc('qq.stop')))}>{status.phase === 'installing' ? '取消下载' : '停止 QQ'}</button>}
          {status?.running && !status.loggedIn && <button className="secondary" disabled={busy} onClick={() => act(async () => setAccounts(await rpc('qq.accounts')))}>已登录过的账号</button>}
        </div>
        {!status?.loggedIn && accounts.filter(account => account.isQuickLogin).map(account => <button className="secondary wide" disabled={busy} key={account.uin} onClick={() => act(() => rpc('qq.quickLogin', { uin: account.uin }))}>登录 {account.nickName || account.uin} · {account.uin}</button>)}
        {!!status?.logs.length && <details><summary>QQ 运行日志</summary><pre>{status.logs.join('\n')}</pre></details>}
        <p className="caption">登录态独立保存在本机，切换角色不清除。停止 HDS 会同时停止 QQ。建议先用测试账号验证，QQ 风控可能要求额外确认。</p>
      </section>}
      <button className="qq-policy-link" onClick={editPolicy}><span><strong>角色自动回复</strong><small>私聊 {status?.policy.users.filter(row => row.enabled).length || 0} 人 · 群聊 {status?.policy.groups.filter(row => row.enabled).length || 0} 个 · {status?.policy.enabled ? '已开启' : '已暂停'}</small></span><span>设置 →</span></button>
      {!selected ? <>
        <div className="section-title inbox-title"><h2>往来信件</h2><span className="caption">{conversations.length} 个会话</span></div>
        {renderRows(conversations.filter(row => row.id.startsWith('private:')))}
        {!!conversations.some(row => row.id.startsWith('group:')) && <details open={groupsOpen} onToggle={event => setGroupsOpen(event.currentTarget.open)} className="qq-groups"><summary>群聊 · {conversations.filter(row => row.id.startsWith('group:')).length}</summary>{renderRows(conversations.filter(row => row.id.startsWith('group:')))}</details>}
        {!conversations.length && <div className="quiet-empty">还没有收到来信。<br /><span className="caption">连接后收到的消息会显示在这里，最多保留最近 2,000 条。</span></div>}
        <details className="qq-new"><summary>按 QQ 号或群号打开会话</summary><form onSubmit={event => { event.preventDefault(); if (/^[1-9]\d{4,14}$/.test(peer)) select(`${kind}:${peer}`); else setNotice('请输入有效的 QQ 号或群号') }}><label>会话类型<select value={kind} onChange={event => setKind(event.target.value)}><option value="private">私聊</option><option value="group">群聊</option></select></label><label>QQ 号 / 群号<input inputMode="numeric" value={peer} onChange={event => setPeer(event.target.value.replace(/\D/g, ''))} maxLength={15} /></label><button className="secondary">打开会话</button></form></details>
      </> : <section className="letter-thread"><div className="section-title"><button onClick={() => select('')}>← 返回信件</button><h2>{conversations.find(row => row.id === selected)?.name || selected.split(':')[1]}</h2></div><p className="caption">{selected.startsWith('group:') ? '群聊' : '私聊'} · {selected.split(':')[1]} · 以登录的 QQ 账号发送</p><div className="letter-messages">{messages.map(message => <article className={`message ${message.outgoing ? 'user' : 'qq-peer'}`} key={message.id}><div className="message-label">{message.name}<time>{formatTime(message.time)}</time></div><div className="bubble">{message.content}</div></article>)}{!messages.length && <p className="quiet-empty">暂无本机记录</p>}<div ref={scroll} /></div><form className="qq-composer" onSubmit={event => { event.preventDefault(); void send() }}><textarea aria-label="QQ 消息内容" placeholder={status?.online ? '写一封短笺…' : 'QQ 在线后可发送'} value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={2} /><button className="primary" disabled={busy || !status?.online || !draft.trim()}>发送</button></form></section>}
    </>}
    {policyOpen && <div className="modal-backdrop"><section className="modal qq-policy-editor" role="dialog" aria-modal="true" aria-label="QQ 自动回复设置">
      <div className="section-title"><h2>允许角色回复谁</h2><button aria-label="关闭" onClick={() => setPolicyOpen(false)}>×</button></div>
      <p>每个角色单独保存这份设置。填好身份卡，她就能在第一次私聊前认识这位朋友。</p>
      <form onSubmit={event => { event.preventDefault(); void act(async () => {
        await rpc('qq.policy', { ...policy, groups: policy.groups.map(row => ({ ...row, keywords: row.keywords.map(word => word.trim()).filter(Boolean) })) })
        setStatus(await rpc('qq.status')); setPolicyOpen(false)
      }) }}><fieldset disabled={busy}>
        <label className="checkbox"><input type="checkbox" checked={policy.enabled} onChange={event => setPolicy({ ...policy, enabled: event.target.checked })} />启用角色自动回复</label>
        <h3>私聊的朋友</h3>
        {policy.users.map((row, index) => <fieldset className="qq-policy-row" key={index}><legend>朋友 {index + 1}</legend>
          <label className="checkbox"><input type="checkbox" checked={row.enabled} onChange={event => editUser(index, { enabled: event.target.checked })} />允许往来</label>
          <div className="field-pair"><label>QQ 号<input required inputMode="numeric" pattern="[1-9][0-9]{4,14}" maxLength={15} value={row.qq} onChange={event => editUser(index, { qq: event.target.value.replace(/\D/g, '') })} /></label><label>称呼<input maxLength={200} value={row.label} onChange={event => editUser(index, { label: event.target.value })} placeholder="她会怎么称呼这位朋友" /></label></div>
          <details><summary>身份卡<span className="tag">{!row.enabled ? '已停用' : row.personId || row.profile || row.relationship ? '已填写' : '待填写'}</span></summary>
            <label>人物标识<input maxLength={200} value={row.personId} onChange={event => editUser(index, { personId: event.target.value })} placeholder="同一个人可在不同账号复用" /></label>
            <label>她知道的背景<textarea rows={3} maxLength={12000} value={row.profile} onChange={event => editUser(index, { profile: event.target.value })} /></label>
            <label>初始关系<textarea rows={3} maxLength={12000} value={row.relationship} onChange={event => editUser(index, { relationship: event.target.value })} placeholder="例如：熟悉但近来联系不多" /></label>
          </details>
          <button type="button" className="text-button" onClick={() => setPolicy({ ...policy, users: policy.users.filter((_, i) => i !== index) })}>移除这位朋友</button>
        </fieldset>)}
        <button type="button" className="secondary" disabled={policy.users.length >= 100} onClick={() => setPolicy({ ...policy, users: [...policy.users, newQQUser()] })}>添加朋友</button>
        <h3>她参与的群聊</h3>
        {policy.groups.map((row, index) => <fieldset className="qq-policy-row" key={index}><legend>群聊 {index + 1}</legend>
          <label className="checkbox"><input type="checkbox" checked={row.enabled} onChange={event => editGroup(index, { enabled: event.target.checked })} />参与这个群</label>
          <div className="field-pair"><label>群号<input required inputMode="numeric" pattern="[1-9][0-9]{4,14}" maxLength={15} value={row.groupId} onChange={event => editGroup(index, { groupId: event.target.value.replace(/\D/g, '') })} /></label><label>群备注<input maxLength={200} value={row.label} onChange={event => editGroup(index, { label: event.target.value })} /></label></div>
          <details><summary>群设置<span className="tag">{groupBadge(row)}</span></summary>
            <label>这个群的日常<textarea rows={3} maxLength={12000} value={row.purpose} onChange={event => editGroup(index, { purpose: event.target.value })} placeholder="大家聚在这里做什么" /></label>
            <label>她在群里的身份<textarea rows={3} maxLength={12000} value={row.characterRole} onChange={event => editGroup(index, { characterRole: event.target.value })} /></label>
            <label>什么时候关注群消息<select value={row.responseMode} onChange={event => editGroup(index, { responseMode: event.target.value as QQGroupRule['responseMode'] })}><option value="mention-only">仅在被 @ 时</option><option value="always">全部消息</option></select></label>
            <label>发言意愿<select value={row.willingnessPreset} onChange={event => editGroup(index, { willingnessPreset: event.target.value as QQWillingnessPreset, ...(event.target.value === 'off' && row.willingness ? { willingness: { ...row.willingness, enabled: false } } : {}) })}>{Object.entries(presets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <p className="caption">选「全部消息」后，她会结合意愿与冷却决定是否接话。关闭意愿门时，只受响应模式与冷却控制。</p>
            <label>让她留意的关键词<textarea rows={2} value={row.keywords.join('\n')} onChange={event => editGroup(index, { keywords: event.target.value.split(/[\n,，]/) })} placeholder="每行一个，最多 30 个" /></label>
            <details className="qq-policy-advanced"><summary>高级<span className="tag">上下文 {row.contextLimit} 条 · 冷却 {row.cooldownSeconds}s</span></summary>
              {numeric('群上下文条数', row.contextLimit, 4, 100, value => editGroup(index, { contextLimit: value }))}
              {numeric('消息合并等待（秒）', row.debounceSeconds, 0, 10, value => editGroup(index, { debounceSeconds: value }), 'any')}
              {numeric('发言冷却（秒）', row.cooldownSeconds, 0, 86400, value => editGroup(index, { cooldownSeconds: value }))}
              {numeric('历史图片上限', row.historicalImageLimit, 0, 6, value => editGroup(index, { historicalImageLimit: value }))}
              {row.willingnessPreset === 'custom' && <fieldset><legend>自定义发言意愿</legend>
                <label className="checkbox"><input type="checkbox" checked={(row.willingness || newQQWillingness()).enabled} onChange={event => editGroup(index, { willingness: { ...(row.willingness || newQQWillingness()), enabled: event.target.checked } })} />启用自定义数值门</label>
                {([
                  ['maxScore', '意愿累积上限', 0.1, 10, 0.05], ['threshold', '发言阈值', 0, 10, 0.01],
                  ['probabilityAmplifier', '发言概率增幅', 0, 10, 0.05], ['decayHalfLifeSeconds', '意愿衰减半衰期（秒）', 10, 86400, 1],
                  ['replyCost', '每次发言消耗', 0, 10, 0.05], ['baseGain', '普通消息意愿增量', 0, 10, 0.01],
                  ['quoteGain', '引用消息意愿增量', 0, 10, 0.01], ['keywordGain', '关键词意愿增量', 0, 10, 0.01],
                ] as const).map(([key, label, min, max, step]) => <React.Fragment key={key}>{numeric(label, (row.willingness || newQQWillingness())[key], min, max, value => editGroup(index, { willingness: { ...(row.willingness || newQQWillingness()), [key]: value } }), step)}</React.Fragment>)}
              </fieldset>}
            </details>
          </details>
          <button type="button" className="text-button" onClick={() => setPolicy({ ...policy, groups: policy.groups.filter((_, i) => i !== index) })}>移除这个群</button>
        </fieldset>)}
        <button type="button" className="secondary" disabled={policy.groups.length >= 100} onClick={() => setPolicy({ ...policy, groups: [...policy.groups, newQQGroup()] })}>添加群聊</button>
        <p className="caption">未允许的账号与群消息只显示在信箱，不提交给模型。暂停自动回复或停用一行，也会停止向对应对象主动投递。</p>
        <button className="primary wide" disabled={busy}>保存回复范围</button>
      </fieldset></form>
    </section></div>}
  </section>
}
