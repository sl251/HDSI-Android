import type { RefObject } from 'react'
import type { SavedCard } from '../../../packages/contracts'
import type { CharacterActions } from '../hooks/useCharacterActions'
import { Icon } from './Icon'

interface CharacterLibraryProps {
  guideRef?: RefObject<HTMLElement>
  cards: SavedCard[]
  selected: string
  native: boolean
  busy: boolean
  switchDisabled: boolean
  switchCard: (id: string) => void
  actions: Pick<CharacterActions, 'importCard' | 'setCreateOpen' | 'setImportCodeOpen' | 'openCardExport' | 'setPreview' | 'setEditingCard' | 'setDeleteTarget'>
}

export function CharacterLibrary({ guideRef, cards, selected, native, busy, switchDisabled, switchCard, actions }: CharacterLibraryProps) {
  return <>
    <section className="settings-group cards-import-panel" ref={guideRef}>
      <div className="actions">
        <button className="primary" disabled={!native || busy} onClick={actions.importCard}><Icon name="plus" />导入角色卡</button>
        <button className="secondary" disabled={!native || busy} onClick={() => actions.setCreateOpen(true)}>手动创建</button>
        <button className="secondary" disabled={!native || busy} onClick={() => actions.setImportCodeOpen(true)}>用导入码导入</button>
        <button className="secondary" disabled={!native || busy || !selected} onClick={() => actions.openCardExport(selected)}>导出</button>
      </div>
    </section>
    <div className="card-list">{cards.map((saved, index) => <article className={`character ${saved.id === selected ? 'chosen' : ''}`} key={saved.id}>
      <div className="character-number">{String(index + 1).padStart(2, '0')}</div>
      <div className="character-body">
        <div className="character-title"><h2>{saved.card.name}</h2>{saved.id === selected && <span className="tag">当前角色</span>}</div>
        <p>{saved.card.description || saved.card.personality || '尚未填写角色描述'}</p>
        <span className="caption">{saved.card.format.toUpperCase()} · {saved.card.lorebook ? '含世界书' : '独立人设'} · {new Date(saved.importedAt).toLocaleDateString('zh-CN')}</span>
        <div className="card-actions">
          <button disabled={switchDisabled || saved.id === selected} onClick={() => switchCard(saved.id)}>{saved.id === selected ? '正在使用' : '使用这个角色'}</button>
          <button onClick={() => actions.setPreview({ card: saved.card, base64: '' })}>查看人设</button>
          <button disabled={busy} onClick={() => actions.setEditingCard(saved)}>编辑</button>
          <button disabled={busy} onClick={() => actions.openCardExport(saved.id)}>导出角色卡</button>
          <button disabled={busy} className="danger" onClick={() => actions.setDeleteTarget(saved)}>删除</button>
        </div>
      </div>
    </article>)}</div>
    {!cards.length && <div className="quiet-empty">角色库还很安静。<br />为第一段故事选一个主角吧。</div>}
  </>
}
