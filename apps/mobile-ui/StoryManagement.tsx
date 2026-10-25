import React, { useState } from 'react'
import type { NativeBridge } from '../../packages/contracts'

type Props = { scope?: 'story' | 'backup'; bridge: NativeBridge; cardId: string; name: string; native: boolean; busy: boolean; healthy: boolean; act: (task: () => Promise<unknown>, success?: string) => Promise<void>; changed: (historyReplaced?: boolean) => Promise<void>; notify: (text: string) => void }
export function StoryManagement({ scope, bridge, cardId, name, native, busy, act, changed, notify }: Props) {
  const [confirm, setConfirm] = useState<'reset' | 'restore' | 'export' | 'previous' | null>(null)
  const execute = async () => {
    if (confirm === 'reset') { await bridge.resetStory({ cardId }); await changed(true); notify('故事已重开，旧故事保存在本机备份。唤醒后将从当前人设开始。') }
    if (confirm === 'restore') { const result = await bridge.restoreStory({ cardId }); if (!result.cancelled) { await changed(true); notify('存档已恢复。唤醒后保持暂停，请在见闻检查后恢复故事。') } }
    if (confirm === 'export') { const result = await bridge.exportStory({ cardId }); if (!result.cancelled) { await changed(); notify('完整存档已导出；故事已休息，可随时唤醒。') } }
    if (confirm === 'previous') { await bridge.restorePreviousStory({ cardId }); await changed(true); notify('最近本机备份已恢复，唤醒后请检查并恢复故事。') }
    setConfirm(null)
  }
  return <section className="settings-group"><details><summary><span><b>{scope === 'story' ? '故事管理' : scope === 'backup' ? '备份与恢复' : '存档与故事管理'}</b><small>{name || '请先选择角色'} · {scope === 'story' ? '从当前人设重新开始' : scope === 'backup' ? '导出与恢复存档' : '备份、恢复与重新开始'}</small></span></summary><fieldset disabled={!native || busy || !cardId}>
    <p className="caption">操作范围是当前角色的故事，包含该角色通过 QQ 产生的 HDS 剧情。完整存档不包含模型密钥和 QQ 登录。</p><div className="archive-actions">{scope !== 'story' && <><button className="secondary" onClick={() => setConfirm('export')}>导出完整存档</button><button className="secondary" onClick={() => setConfirm('restore')}>恢复故事存档</button><button className="secondary" onClick={() => setConfirm('previous')}>恢复最近本机备份</button></>}{scope !== 'backup' && <button className="secondary danger" onClick={() => setConfirm('reset')}>从当前人设重新开始</button>}</div><p className="caption">操作会先让故事休息并保存数据。重开会保留本机旧存档，角色卡、模型配置、其他角色与 QQ 登录保留；公共 QQ 信箱独立保存。</p>
  </fieldset></details>{confirm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="故事管理确认"><h2>{confirm === 'reset' ? '重新开始' : (confirm === 'restore' || confirm === 'previous') ? '恢复存档' : '导出存档'} · {name}</h2><p>{confirm === 'reset' ? '当前角色的聊天、记忆、关系演化、情绪和待办将从新故事中移除，按当前保存的人设重新开始。旧内容仍在本机备份中。' : confirm === 'previous' ? '将恢复当前角色最近一次重开或替换前的本机备份，当前故事也会保留为备份。恢复后保持暂停，请检查后再继续。' : confirm === 'restore' ? '将用所选存档替换当前角色的完整故事，原故事会备份。只能恢复此角色的兼容存档；恢复后保持暂停，已发送到真实 QQ 的消息不会撤回。' : '先保存并停止 HDS，再将当前角色的数据库、图片与角色卡导出为 ZIP 存档。导出后故事保持休息。'}</p><div className="actions"><button disabled={busy} onClick={() => setConfirm(null)}>取消</button><button className="primary" disabled={busy} onClick={() => act(execute)}>确认继续</button></div></section></div>}</section>
}
