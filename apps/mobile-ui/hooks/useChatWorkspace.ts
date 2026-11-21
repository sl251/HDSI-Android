import { useLayoutEffect } from 'react'
import type { NativeBridge } from '../../../packages/contracts'
import type { useExperience } from '../Experience'
import { useMessageActivity } from '../MessageFailureHint'
import type { useAppNavigation } from './useAppNavigation'
import { useChatComposer, useChatComposerLayout } from './useChatComposer'
import { useChatHistory } from './useChatHistory'
import { useChatImages } from './useChatImages'
import { useChatMedia } from './useChatMedia'
import { useChatSend } from './useChatSend'
import type { RuntimeSession } from './useRuntimeSession'
import { useScrollRestoration } from './useScrollRestoration'
import type { useSettingsPersistence } from './useSettingsPersistence'

interface ChatWorkspaceOptions {
  bridge: NativeBridge
  native: boolean
  busy: boolean
  setBusy: (busy: boolean) => void
  setNotice: (text: string) => void
  session: RuntimeSession
  navigation: Pick<ReturnType<typeof useAppNavigation>, 'page' | 'setPage' | 'detail' | 'spacePage' | 'onboardingOpen'>
  persistence: ReturnType<typeof useSettingsPersistence>
  experience: Pick<ReturnType<typeof useExperience>, 'refresh'>
  fontSize: number
}

// Keep drafts, delivery and reading positions alive across page navigation.
export function useChatWorkspace({ bridge, native, busy, setBusy, setNotice, session, navigation, persistence, experience, fontSize }: ChatWorkspaceOptions) {
  const { selected, selectedRef, profileRevision, runtime, runtimeRef, scopedBridge, story } = session
  const { page, detail, spacePage, onboardingOpen, setPage } = navigation
  const { settings, settingsRef, savedSettings, persistSettings } = persistence
  const healthy = runtime?.state === 'healthy'
  const composerState = useChatComposer(selected, selectedRef, page, setNotice)
  const media = useChatMedia(bridge, selected, page, composerState.updateDraft, setNotice)
  const history = useChatHistory({
    bridge, scopedBridge, selected, selectedRef, profileRevision, setNotice,
    onRows: (id, rows): void => delivery.reconcileHistory(id, rows),
    historyAppended: (previous, next): void => reading.historyAppended(previous, next),
    preparePrepend: (id): void => reading.preparePrepend(id),
  })
  const reading = useScrollRestoration({
    selected, page, detail, spacePage, onboardingOpen, storyReady: !!story, messages: history.messages,
  })
  const delivery = useChatSend({
    bridge, scopedBridge, selectedRef, profileRevision, runtimeRef, settingsRef, healthy, busy, history, media,
    composer: composerState, persistSettings, refreshExperience: experience.refresh, followNextMessage: reading.followNextMessage, setNotice,
  })
  const images = useChatImages({
    bridge, native, healthy, busy, sending: delivery.sending, settings, settingsRef, runtimeRef, savedSettings, profileRevision,
    composer: composerState, persistSettings, openSettings: () => setPage('settings'), setBusy, setNotice,
  })
  useChatComposerLayout(composerState, selected, page, media.voiceBar, fontSize)
  const { messages, hasOlder } = history
  const { restoreAfterPrepend } = reading
  // Measure prepended history after the composer has settled at its new height.
  useLayoutEffect(restoreAfterPrepend, [messages, hasOlder, restoreAfterPrepend])
  const activity = useMessageActivity(bridge, native && healthy && page === 'chat', `${selected}:${profileRevision.current}`, settings.modelOptions.mobileTurnDeadlineMs ?? 240000)
  return { history, reading, delivery, composerState, media, images, activity }
}
