import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { ModelSettings, NativeBridge, RuntimeStatus } from '../../../packages/contracts'
import { defaultOptions, newProvider } from '../ModelCenter'

export function useSettingsPersistence(bridge: NativeBridge, native: boolean, runtimeRef: MutableRefObject<RuntimeStatus | null>) {
  const [settings, setSettings] = useState<ModelSettings>({ providers: [newProvider()], modelOptions: defaultOptions, userName: '我', userProfile: '', autoAdvance: false })
  const [saveState, setSaveState] = useState('设置自动保存')
  const [saveError, setSaveError] = useState('')
  const [restartNeeded, setRestartNeeded] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Fingerprints stay in memory. Only the native settings bridge receives the snapshot.
  const savedSettings = useRef('')
  const launchedSettings = useRef('')
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const initializeSettings = useCallback((prefs: ModelSettings) => {
    savedSettings.current = JSON.stringify(prefs)
    setSettings(prefs)
    setSettingsReady(true)
  }, [])
  const markLaunchedSettings = () => { launchedSettings.current = JSON.stringify(settingsRef.current) }
  const refreshLaunchNotice = useCallback(() => {
    setRestartNeeded(!!launchedSettings.current && JSON.stringify(settingsRef.current) !== launchedSettings.current)
  }, [])

  const persistSettings = () => {
    const next = saveQueue.current.catch(() => {}).then(async () => {
      if (!native || !settingsReady) return
      const snapshot = settingsRef.current
      const fingerprint = JSON.stringify(snapshot)
      if (fingerprint === savedSettings.current) return
      setSaveState('正在保存…')
      setSaveError('')
      try {
        await bridge.saveSettings(snapshot)
        const saved = await bridge.settings()
        savedSettings.current = fingerprint
        // A native readback must not overwrite edits made during this write.
        if (settingsRef.current === snapshot) {
          const merged = { ...saved, providers: snapshot.providers.map(row => saved.providers.find(item => item.id === row.id) ?? row) }
          savedSettings.current = JSON.stringify(merged)
          settingsRef.current = merged
          setSettings(merged)
        }
        setSaveState('已自动保存')
        if (runtimeRef.current?.running) setRestartNeeded(true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Some callers surface a rejected save outside Settings. Keep both paths safe.
        const detail = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : message
        const containsKey = snapshot.providers.some(({ apiKey }) =>
          apiKey && [message, detail].some(text => text.includes(apiKey) || text.includes(JSON.stringify(apiKey).slice(1, -1)))
        )
        const feedback = containsKey ? '尚未保存' : message
        setSaveState('尚未保存')
        setSaveError(feedback)
        if (containsKey) throw new Error(feedback)
        throw error
      }
    })
    saveQueue.current = next
    return next
  }

  useEffect(() => {
    if (!native || !settingsReady || JSON.stringify(settings) === savedSettings.current) return
    setSaveState('等待保存')
    const timer = setTimeout(() => {
      const element = document.activeElement
      if (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type !== 'checkbox')) return
      void persistSettings().catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [bridge, settings, native, settingsReady])

  return {
    settings, setSettings, settingsRef, savedSettings, settingsReady, initializeSettings, persistSettings,
    saveState, saveError, restartNeeded, setRestartNeeded, markLaunchedSettings, refreshLaunchNotice,
  }
}
