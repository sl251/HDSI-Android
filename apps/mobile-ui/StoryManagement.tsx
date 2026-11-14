import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NativeBridge } from '../../packages/contracts'
import { registerBackHandler } from './back-stack'

type ConfirmKind = 'reset' | 'restore' | 'export' | 'previous'
type Props = { scope?: 'story' | 'backup'; bridge: NativeBridge; cardId: string; name: string; native: boolean; busy: boolean; healthy: boolean; act: (task: () => Promise<unknown>, success?: string) => Promise<void>; changed: (historyReplaced?: boolean) => Promise<void>; notify: (text: string) => void }

const confirmMeta: Record<ConfirmKind, { title: string; confirmLabel: string; danger?: boolean; body: string }> = {
  reset: {
    title: '从当前人设重新开始',
    confirmLabel: '确认重新开始',
    danger: true,
    body: '当前角色的聊天、记忆、关系演化、情绪和待办将从新故事中移除，按当前保存的人设重新开始。旧内容会保留在本机备份；角色卡、模型配置、其他角色与 QQ 登录不受影响。',
  },
  previous: {
    title: '恢复最近本机备份',
    confirmLabel: '确认恢复',
    body: '将恢复当前角色最近一次重开或替换前的本机备份，当前故事也会保留为备份。恢复后保持暂停，请检查后再继续。',
  },
  restore: {
    title: '恢复故事存档',
    confirmLabel: '确认恢复',
    body: '将用所选存档替换当前角色的完整故事，原故事会备份。只能恢复此角色的兼容存档；恢复后保持暂停，已发送到真实 QQ 的消息不会撤回。',
  },
  export: {
    title: '导出完整存档',
    confirmLabel: '确认导出',
    body: '先保存并停止核心，再将当前角色的数据库、图片与角色卡导出为 ZIP 存档（不含模型密钥与 QQ 登录）。导出后故事保持休息。',
  },
}

export function StoryManagement({ scope, bridge, cardId, name, native, busy, act, changed, notify }: Props) {
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const pendingRef = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef(confirm)
  const busyRef = useRef(busy)
  confirmRef.current = confirm
  busyRef.current = busy

  const closeConfirm = () => {
    if (pendingRef.current || busyRef.current) return
    setConfirm(null)
  }

  useEffect(() => {
    if (!confirm) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const shell = document.querySelector<HTMLElement>('.app')
    document.body.style.overflow = 'hidden'
    if (shell) shell.inert = true
    const frame = requestAnimationFrame(() => cancelRef.current?.focus())

    const unregisterBack = registerBackHandler(() => {
      if (!confirmRef.current) return false
      if (!pendingRef.current && !busyRef.current) setConfirm(null)
      return true
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!pendingRef.current && !busyRef.current) setConfirm(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      unregisterBack()
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      if (shell) shell.inert = false
      if (previousFocus && previousFocus.isConnected) previousFocus.focus()
    }
  }, [confirm])

  const execute = async () => {
    const activeConfirm = confirmRef.current
    if (!activeConfirm) return
    if (activeConfirm === 'reset') { await bridge.resetStory({ cardId }); await changed(true); notify('故事已重开，旧故事保存在本机备份。唤醒后将从当前人设开始。') }
    if (activeConfirm === 'restore') { const result = await bridge.restoreStory({ cardId }); if (!result.cancelled) { await changed(true); notify('存档已恢复。唤醒后保持暂停，请在见闻检查后恢复故事。') } }
    if (activeConfirm === 'export') { const result = await bridge.exportStory(); if (!result.cancelled) { await changed(); notify('完整存档已导出；故事已休息，可随时唤醒。') } }
    if (activeConfirm === 'previous') { await bridge.restorePreviousStory({ cardId }); await changed(true); notify('最近本机备份已恢复，唤醒后请检查并恢复故事。') }
    setConfirm(null)
  }

  const handleConfirmClick = () => {
    if (pendingRef.current || busy) return
    pendingRef.current = true
    setSubmitting(true)
    void act(execute).finally(() => {
      pendingRef.current = false
      setSubmitting(false)
    })
  }

  const meta = confirm ? confirmMeta[confirm] : null
  const locked = busy || submitting

  return (
    <section className="settings-group story-management-card">
      <details>
        <summary>
          <span>
            <b>{scope === 'story' ? '故事管理' : scope === 'backup' ? '备份与恢复' : '存档与故事管理'}</b>
            <small>{name || '请先选择角色'} · {scope === 'story' ? '重开当前角色故事（保留本机备份）' : scope === 'backup' ? '导出与恢复本机存档' : '备份、恢复与重新开始'}</small>
          </span>
        </summary>
        <fieldset disabled={!native || busy || !cardId}>
          <p className="caption">仅作用于当前角色的故事（含该角色通过 QQ 产生的剧情）；角色卡、模型配置、其他角色、QQ 登录与公共信箱均保留。</p>
          <div className="archive-actions">
            {scope !== 'story' && <>
              <button className="secondary" onClick={() => setConfirm('export')}>导出完整存档</button>
              <button className="secondary" onClick={() => setConfirm('restore')}>恢复故事存档</button>
              <button className="secondary" onClick={() => setConfirm('previous')}>恢复最近本机备份</button>
            </>}
            {scope !== 'backup' && <button className="secondary danger" onClick={() => setConfirm('reset')}>从当前人设重新开始</button>}
          </div>
        </fieldset>
      </details>
      {confirm && meta && createPortal(
        <div
          className="modal-backdrop confirm-backdrop"
          onPointerDown={event => { if (event.target === event.currentTarget) closeConfirm() }}
        >
          <section className="modal confirm-sheet" role="dialog" aria-modal="true" aria-label="故事管理确认">
            <div className="confirm-sheet-header">
              <h2>{meta.title}{name ? ` · ${name}` : ''}</h2>
            </div>
            <p className="confirm-sheet-body">{meta.body}</p>
            <div className="confirm-sheet-actions">
              <button ref={cancelRef} type="button" className="secondary" disabled={locked} onClick={closeConfirm}>取消</button>
              <button
                type="button"
                className={meta.danger ? 'danger-solid' : 'primary'}
                disabled={locked}
                onClick={handleConfirmClick}
              >
                {submitting ? '正在处理…' : meta.confirmLabel}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </section>
  )
}
