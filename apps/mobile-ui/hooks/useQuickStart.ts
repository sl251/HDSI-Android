import { useCallback, useEffect, useState, type ComponentProps } from 'react'
import type { Message, NativeBridge } from '../../../packages/contracts'
import { onboardingStorageKey } from '../Onboarding'
import type { QuickStart } from '../QuickStart'
import type { useSettingsPersistence } from './useSettingsPersistence'
import { mainConnection, type AppAction } from './useStoryActions'

type QuickStartView = ComponentProps<typeof QuickStart>
interface QuickStartOptions extends Pick<QuickStartView, 'character' | 'busy' | 'running' | 'select' | 'configure' | 'wake' | 'compose'> {
  bridge: NativeBridge
  messages: Message[]
  onboardingOpen: boolean
  persistence: Pick<ReturnType<typeof useSettingsPersistence>, 'settings' | 'settingsRef' | 'persistSettings'>
  act: AppAction
  setNotice: (text: string) => void
}

export function useQuickStart({ bridge, messages, onboardingOpen, persistence, act, setNotice, ...actions }: QuickStartOptions) {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem('hds.quickstart.v1') && !localStorage.getItem(onboardingStorageKey) }
    catch { return true }
  })
  const [testedConnection, setTestedConnection] = useState('')
  const { settings, settingsRef, persistSettings } = persistence
  const primary = mainConnection(settings)
  const complete = messages.some(row => row.direction === 'user' && row.status === 'accepted') &&
    messages.some(row => row.direction === 'character' && row.status === 'delivered')
  const close = useCallback(() => {
    setOpen(false)
    try { localStorage.setItem('hds.quickstart.v1', '1') } catch { /* Optional preference. */ }
  }, [])
  useEffect(() => { if (open && complete) close() }, [open, complete, close])
  const test = () => act(async () => {
    await persistSettings()
    const row = mainConnection(settingsRef.current)
    if (!row) throw new Error('请先填写聊天模型连接')
    await bridge.rpc({ method: 'models.test', payload: { ...row } })
    // The connection fingerprint can contain credentials. Keep it in memory.
    setTestedConnection(JSON.stringify(row))
    setNotice('聊天连接测试通过，可以唤醒故事了。')
  })
  const view: QuickStartView | undefined = open && !onboardingOpen && !complete ? {
    ...actions, configured: !!primary, tested: testedConnection === JSON.stringify(primary), test, close,
  } : undefined
  return { view, reopen: () => setOpen(true) }
}
