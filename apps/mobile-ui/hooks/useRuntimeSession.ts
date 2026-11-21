import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { NativeBridge, RuntimeStatus, SavedCard } from '../../../packages/contracts'
import type { StorySnapshot } from '../pages/StoryPage'

export function useRuntimeSession(bridge: NativeBridge) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [cards, setCards] = useState<SavedCard[]>([])
  const [selected, setSelected] = useState('')
  const [story, setStory] = useState<StorySnapshot | null>(null)
  const runtimeRef = useRef(runtime)
  const selectedRef = useRef(selected)
  const profileRevision = useRef(0)
  useLayoutEffect(() => { runtimeRef.current = runtime }, [runtime])
  useLayoutEffect(() => () => { profileRevision.current++ }, [])

  const selectProfile = useCallback((id: string) => {
    selectedRef.current = id
    setSelected(id)
  }, [])
  const refreshCards = async () => {
    const revision = profileRevision.current
    const library = await bridge.cards()
    if (revision !== profileRevision.current) return
    setCards(library.cards)
    const prefs = await bridge.settings()
    if (revision !== profileRevision.current) return
    if (selectedRef.current && prefs.activeCard !== selectedRef.current) profileRevision.current++
    selectProfile(prefs.activeCard)
    return profileRevision.current
  }

  const scopedBridge = useMemo(() => new Proxy(bridge, {
    get(target, property) {
      if (property !== 'rpc') return Reflect.get(target, property)
      return (request: Parameters<NativeBridge['rpc']>[0]) => {
        if (selectedRef.current !== selected) return Promise.reject(new Error('故事已切换，请回到原故事继续'))
        return target.rpc({ ...request, payload: { ...request.payload, expectedCardId: selected } })
      }
    },
  }), [bridge, selected])

  return {
    runtime, runtimeRef, setRuntime, cards, setCards, selected, selectedRef, profileRevision, selectProfile,
    story, setStory, scopedBridge, refreshCards,
  }
}

export type RuntimeSession = ReturnType<typeof useRuntimeSession>
