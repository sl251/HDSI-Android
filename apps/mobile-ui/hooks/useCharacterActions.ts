import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { fromBase64, parseCard, type Card } from '../../../packages/card-format'
import type { NativeBridge, SavedCard } from '../../../packages/contracts'
import { parsePersona } from '../../../packages/persona-format'
import { prepareCharacterImport, type CharacterImport } from '../character-import'

interface CharacterActionOptions {
  bridge: NativeBridge
  cards: SavedCard[]
  setCards: Dispatch<SetStateAction<SavedCard[]>>
  selected: string
  selectedRef: MutableRefObject<string>
  refreshCards: () => Promise<unknown>
  storyChanged: () => Promise<void>
  clearDeletedStory: () => void
  act: (task: () => Promise<unknown>, success?: string) => Promise<void>
  setBusy: (busy: boolean) => void
  setNotice: (text: string) => void
}

export function useCharacterActions({
  bridge, cards, setCards, selected, selectedRef, refreshCards, storyChanged, clearDeletedStory, act, setBusy, setNotice,
}: CharacterActionOptions) {
  const [preview, setPreview] = useState<CharacterImport | null>(null)
  const [importChoices, setImportChoices] = useState<CharacterImport[]>([])
  const [editingCard, setEditingCard] = useState<SavedCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedCard | null>(null)
  const [newName, setNewName] = useState('')
  const [newProfile, setNewProfile] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [importCodeOpen, setImportCodeOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportCardId, setExportCardId] = useState('')
  const openCardExport = (id: string) => { setExportCardId(id); setExportOpen(true) }

  const importCard = () => act(async () => {
    const file = await bridge.pickCard()
    const original = fromBase64(file.base64)
    const choices = parsePersona(original).map(card => prepareCharacterImport(card, original))
    if (choices.length === 1) setPreview(choices[0])
    else setImportChoices(choices)
  })
  const saveImportedCard = async (input: CharacterImport, useNow = false) => {
    const saved = await bridge.saveCard({ card: input.card, base64: input.base64 })
    const duplicate = cards.some(row => row.id === saved.id)
    setCards(rows => rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved])
    // Publish the library entry even if switching to the saved card fails.
    await refreshCards()
    if ((useNow || !selectedRef.current) && selectedRef.current !== saved.id) {
      try { await bridge.selectCard({ id: saved.id }); await storyChanged() }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`「${saved.card.name}」已保存到角色库，切换未完成：${reason}。可稍后从角色库选择。`)
      }
    }
    setNotice(duplicate ? `「${saved.card.name}」已在角色库中，保留已有编辑与故事。` : `「${saved.card.name}」已加入角色库。`)
  }
  const savePreview = (useNow: boolean) => act(async () => {
    if (!preview) return
    await saveImportedCard(preview, useNow)
    setPreview(null)
  })
  const previewNewCard = () => {
    const raw = JSON.stringify({
      spec: 'chara_card_v2', spec_version: '2.0',
      data: { name: newName.trim(), description: newProfile, personality: '', scenario: '', first_mes: '', mes_example: '', extensions: {} },
    })
    const bytes = new TextEncoder().encode(raw)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    setPreview({ card: parseCard(bytes), base64: btoa(binary) })
    setCreateOpen(false)
    setNewName('')
    setNewProfile('')
  }
  const saveEdit = async (card: Card) => {
    if (!editingCard) return
    setBusy(true)
    try {
      await bridge.updateCard({ id: editingCard.id, card })
      setEditingCard(null)
      await refreshCards()
      setNotice('人设已修改，剧情与记忆保留。重新启动 HDS 后生效。')
    } finally { setBusy(false) }
  }
  const confirmDelete = () => act(async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    await bridge.deleteCard({ id })
    setDeleteTarget(null)
    if (selected === id) clearDeletedStory()
    await refreshCards()
  }, '角色已从库中移除，历史保留。')

  return {
    preview, setPreview, importChoices, setImportChoices, editingCard, setEditingCard, deleteTarget, setDeleteTarget,
    newName, setNewName, newProfile, setNewProfile, createOpen, setCreateOpen, importCodeOpen, setImportCodeOpen,
    exportOpen, setExportOpen, exportCardId, openCardExport, importCard, saveImportedCard, savePreview,
    previewNewCard, saveEdit, confirmDelete,
  }
}

export type CharacterActions = ReturnType<typeof useCharacterActions>
