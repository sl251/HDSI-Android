import type { ModelSettings, NativeBridge, SavedCard } from '../../../packages/contracts'
import { CardEditor } from '../CardEditor'
import { CharacterExportModal } from '../CharacterExportModal'
import { CharacterImportModal } from '../CharacterImportModal'
import type { CharacterActions } from '../hooks/useCharacterActions'
import { Icon } from './Icon'

interface CharacterOverlaysProps {
  actions: CharacterActions
  bridge: NativeBridge
  native: boolean
  busy: boolean
  setBusy: (busy: boolean) => void
  cards: SavedCard[]
  settingsReady: boolean
  config: ModelSettings['mobileConfig']
}

export function CharacterOverlays({ actions, bridge, native, busy, setBusy, cards, settingsReady, config }: CharacterOverlaysProps) {
  const { editingCard, deleteTarget, importChoices, preview, exportCardId, newName, newProfile } = actions
  return <>
    {editingCard && <CardEditor key={editingCard.id} saved={editingCard} busy={busy} close={() => actions.setEditingCard(null)} save={actions.saveEdit} />}
    {deleteTarget && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="删除角色确认">
      <h2>删除「{deleteTarget.card.name}」？</h2>
      <p>将从角色库移除。已有剧情、记忆与原文件仍保留在本机，重新导入原文件可恢复。当前角色运行时会先停止 HDS。</p>
      <div className="actions">
        <button className="secondary" disabled={busy} onClick={() => actions.setDeleteTarget(null)}>取消</button>
        <button className="primary" disabled={busy} onClick={() => void actions.confirmDelete()}>确认删除</button>
      </div>
    </section></div>}
    {importChoices.length > 0 && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="选择 HDS 人设">
      <div className="section-title"><h2>文件包含多个人设</h2><button aria-label="取消导入" onClick={() => actions.setImportChoices([])}>×</button></div>
      <p className="caption">选择要导入的 HDS 实例。</p>
      {importChoices.map((choice, index) => <button key={index} className="secondary wide" onClick={() => { actions.setPreview(choice); actions.setImportChoices([]) }}>{index + 1}. {choice.card.name}</button>)}
    </section></div>}
    {preview && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="角色卡预览">
      <div className="section-title"><span className="eyebrow">CHARACTER / {preview.card.format.toUpperCase()}</span><button aria-label="关闭" disabled={busy} onClick={() => actions.setPreview(null)}>×</button></div>
      <h1>{preview.card.name}</h1><p className="preview-text">{preview.card.description}</p>
      {preview.card.personality && <><h3>性格</h3><p className="preview-text">{preview.card.personality}</p></>}
      {preview.card.firstMessage && <><h3>开场白</h3><p className="preview-text">{preview.card.firstMessage}</p></>}
      <h3>兼容说明</h3><ul>{preview.card.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      {preview.base64 && <button className="primary wide" disabled={busy} onClick={() => void actions.savePreview(true)}>保存并使用这个角色<Icon name="arrow" /></button>}
      {preview.base64 && <button className="secondary wide" disabled={busy} onClick={() => void actions.savePreview(false)}>只保存到角色库</button>}
    </section></div>}
    {actions.exportOpen && <CharacterExportModal
      bridge={bridge} native={native} cardId={exportCardId} ready={native && settingsReady && !!exportCardId}
      name={cards.find(row => row.id === exportCardId)?.card.name || ''} config={config} revision={() => exportCardId}
      busy={busy} working={setBusy} close={() => actions.setExportOpen(false)}
    />}
    {actions.importCodeOpen && <CharacterImportModal busy={busy} working={setBusy} save={input => actions.saveImportedCard(input)} close={() => actions.setImportCodeOpen(false)} />}
    {actions.createOpen && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="创建角色">
      <div className="section-title"><h2>写下一个人</h2><button aria-label="关闭" onClick={() => actions.setCreateOpen(false)}>×</button></div>
      <label>角色名称<input value={newName} onChange={event => actions.setNewName(event.target.value)} maxLength={128} /></label>
      <label>角色描述<textarea rows={6} value={newProfile} onChange={event => actions.setNewProfile(event.target.value)} maxLength={262144} placeholder="身份、性格、说话方式与生活背景…" /></label>
      <button className="primary wide" disabled={!newName.trim() || !newProfile.trim()} onClick={actions.previewNewCard}>预览角色<Icon name="arrow" /></button>
    </section></div>}
  </>
}
