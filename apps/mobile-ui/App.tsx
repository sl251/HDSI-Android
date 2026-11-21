import React, { useCallback, useEffect, useState } from 'react'
import type { DiagnosticsMessageFocus, NativeBridge } from '../../packages/contracts'
import { useExperience } from './Experience'
import { Feed } from './Feed'
import { MediaJobNotice } from './MediaJobNotice'
import { useCharacterAvatar } from './CharacterAvatar'
import { NotificationBanner } from './NotificationBanner'
import { HistorySearch } from './HistorySearch'
import { Onboarding, type OnboardingTarget } from './Onboarding'
import { StorySettingEditor } from './StorySettingEditor'
import { Inbox } from './Inbox'
import { useAppearance } from './AppearanceSettings'
import { BackgroundImage } from './BackgroundImage'
import { MessageDiagnostics } from './MessageDiagnostics'
import { useVoices } from './Voice'
import { StickerManager } from './Stickers'
import { stickerImportReason } from './sticker-state'
import { SettingsSubpageHeader } from './SettingsSubpageHeader'
import { AppHeader } from './components/AppHeader'
import { BottomNavigation } from './components/BottomNavigation'
import { CharacterLibrary } from './components/CharacterLibrary'
import { CharacterOverlays } from './components/CharacterOverlays'
import { StoryPage } from './pages/StoryPage'
import { SpaceHome } from './pages/SpaceHome'
import { SpaceDetail } from './pages/SpaceDetail'
import { useCharacterActions } from './hooks/useCharacterActions'
import { useSettingsPersistence } from './hooks/useSettingsPersistence'
import { ChatPage } from './pages/ChatPage'
import { useAppBack } from './hooks/useAppBack'
import { useAppChrome } from './hooks/useAppChrome'
import { useAppNavigation } from './hooks/useAppNavigation'
import { useChatWorkspace } from './hooks/useChatWorkspace'
import { useNativeRuntime } from './hooks/useNativeRuntime'
import { useQuickStart } from './hooks/useQuickStart'
import { useRuntimeSession } from './hooks/useRuntimeSession'
import { useStoryActions, type AppAction } from './hooks/useStoryActions'

export function App({ bridge, native }: { bridge: NativeBridge; native: boolean }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const act: AppAction = async (task, success) => {
    setBusy(true); setNotice('')
    try { await task(); if (success) setNotice(success) }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const [onboardingTargets] = useState(() => Object.fromEntries(['welcome', 'library', 'models', 'chat', 'story', 'help'].map(key => [key, React.createRef<HTMLElement>()])) as Record<OnboardingTarget, React.RefObject<HTMLElement>>)
  const [messageDiagnostic, setMessageDiagnostic] = useState<string | null>(null)
  const focusMessageDiagnostic = useCallback((message: DiagnosticsMessageFocus) => setMessageDiagnostic(message.messageId), [])
  const [settingEditor, setSettingEditor] = useState(false)
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null)
  const session = useRuntimeSession(bridge)
  const { cards, setCards, selected, selectedRef, profileRevision, runtime, runtimeRef, setRuntime, story, setStory, scopedBridge, refreshCards } = session
  const active = cards.find(card => card.id === selected)
  const characterName = story?.story?.setting?.character?.name || active?.card.name || ''
  const healthy = runtime?.state === 'healthy'
  useEffect(() => setMessageDiagnostic(null), [selected])
  const experience = useExperience(bridge, native, selected, healthy, session)
  const voices = useVoices(bridge, native)
  const avatar = useCharacterAvatar(bridge, native, selected, profileRevision.current)
  const appearance = useAppearance(bridge, native, setNotice)
  const { appShell, headerRef, navigation } = useAppChrome(native)
  const appNavigation = useAppNavigation({ savePosition: (): void => chat.reading.savePosition(), notify: setNotice })
  const {
    page, setPage, selectTab, pageMotion, beginSwipe, moveSwipe, endSwipe, cancelSwipe,
    spacePage, openSpace, detail, switcher, setSwitcher, switcherAnchorRef, inboxSource, inboxBack, leaveInbox,
    onboardingOpen, prepareOnboarding, closeOnboarding,
  } = appNavigation
  const persistence = useSettingsPersistence(bridge, native, runtimeRef)
  const { settings, settingsRef, settingsReady, persistSettings, restartNeeded, setRestartNeeded } = persistence
  const chat = useChatWorkspace({
    bridge, native, busy, setBusy, setNotice, session, navigation: appNavigation, persistence, experience, fontSize: appearance.value.fontSize,
  })
  const { history, reading, delivery, composerState, media, images, activity } = chat
  const { messages, historySearch, setHistorySearch } = history
  const { sending } = delivery
  const { toLatest, newMessages } = reading
  const { stickers, stickersRef, saveStickers, stickerManager, setStickerManager, stickerManagerBack } = media
  const { wake, restart, rest, switchCard, storyChanged, openNotification, wakeProps, wakeStatusNote } = useStoryActions({
    bridge, native, busy, avatar: avatar.source, characterName, session, navigation: appNavigation, chat, stickersRef, persistence, act, setNotice,
  })
  const { transitioning, runtimeLabel, triggerPrimaryWake } = wakeProps
  const { refreshStory, inboxUnread, setInboxUnread } = useNativeRuntime({
    bridge, native, page, session, history, persistence, openNotification, setNotice,
  })
  const characterActions = useCharacterActions({
    bridge, cards, setCards, selected, selectedRef, refreshCards, storyChanged, act, setBusy, setNotice,
    clearDeletedStory: () => { history.clearMessages(); setStory(null) },
  })
  const { exportOpen, setExportOpen, importCodeOpen, setImportCodeOpen } = characterActions

  useAppBack({
    onboarding: onboardingOpen ? closeOnboarding : undefined,
    historySearch: historySearch ? () => setHistorySearch(false) : undefined,
    stickerManager: stickerManager ? () => stickerManagerBack.current?.() : undefined,
    stickerDrawer: media.stickerDrawer ? () => media.setStickerDrawer(false) : undefined,
    mediaDrawer: media.mediaDrawer ? () => media.setMediaDrawer(false) : undefined,
    exportDialog: exportOpen ? () => { if (!busy) setExportOpen(false) } : undefined,
    importCodeDialog: importCodeOpen ? () => { if (!busy) setImportCodeOpen(false) } : undefined,
    messageDiagnostic: messageDiagnostic !== null ? () => setMessageDiagnostic(null) : undefined,
    settingEditor: settingEditor ? () => setSettingEditor(false) : undefined,
    inbox: page === 'inbox' ? leaveInbox : undefined,
    switcher: switcher ? () => setSwitcher(false) : undefined,
    spacePage: page === 'settings' && spacePage ? () => openSpace(null, -1) : undefined,
    cards: page === 'cards' ? () => setPage('chat') : undefined,
  })
  const quickStart = useQuickStart({
    bridge, messages, onboardingOpen, character: active?.card.name, running: healthy,
    busy: !native || busy || sending || transitioning || !settingsReady, persistence, act, setNotice,
    select: () => setPage('cards'), configure: () => openSpace('models'), wake,
    compose: () => { toLatest(); composerState.composer.current?.focus() },
  })
  const libraryProps = { cards, selected, native, busy, switchDisabled: busy || sending || transitioning, switchCard, actions: characterActions }

  return <>
    {appearance.value.backgroundData && <BackgroundImage source={appearance.value.backgroundData} opacity={appearance.value.backgroundOpacity} blur={appearance.value.backgroundBlur} failed={() => setNotice('背景图片无法显示，请在界面设置中重新选择图片。')} />}
    <div className={`app${appearance.value.backgroundData ? ' has-photo-bg' : ''}`} ref={appShell}><NotificationBanner bridge={bridge} native={native} cardId={selected} messages={messages} reading={page === 'chat'} name={characterName} open={() => setPage('chat')} />
    <AppHeader
      headerRef={headerRef}
      switcherAnchorRef={switcherAnchorRef}
      welcomeRef={onboardingTargets.welcome as React.RefObject<HTMLDivElement>}
      switcher={switcher}
      toggleSwitcher={() => setSwitcher(open => !open)}
      avatarSource={avatar.source}
      characterName={characterName}
      cards={cards}
      selected={selected}
      switchDisabled={busy || sending || transitioning}
      statusDisabled={busy || sending || transitioning || (native && !settingsReady)}
      switchCard={switchCard}
      openLibrary={() => { setSwitcher(false); setPage('cards') }}
      page={page}
      openChatSettings={() => openSpace('chat')}
      native={native}
      healthy={healthy}
      runtimeLabel={runtimeLabel}
      onStatusClick={() => {
        if (healthy) void rest()
        else if (native) void wake()
        else openSpace(null)
      }}
    />
    <main
      className={`accordion page-transition page-${pageMotion.phase}`}
      style={{ '--page-offset': `${pageMotion.direction * 24}px`, '--page-duration': '180ms' } as React.CSSProperties}
      key={page}
      data-page={page}
      onTouchStart={beginSwipe}
      onTouchMove={moveSwipe}
      onTouchEnd={endSwipe}
      onTouchCancel={cancelSwipe}
      onBlurCapture={() => { void persistSettings().catch(() => {}) }}
    >
      {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      {restartNeeded && <div className="restart-banner" role="status"><div><b>有新配置待重启</b></div><button disabled={busy || sending || transitioning} onClick={restart}>立即重启生效</button></div>}
      {page === 'inbox' && <Inbox bridge={bridge} healthy={healthy} native={native} configure={() => openSpace(null)} onRootBack={inboxSource === 'space' ? () => openSpace(null, -1) : undefined} backHandler={inboxBack} onUnread={setInboxUnread} />}
      {page === 'feed' && (experience.settings.feedEnabled ? <Feed avatar={avatar.source} cardId={selected} key={selected} bridge={scopedBridge} snapshot={experience.snapshot} refresh={experience.refresh} healthy={healthy} name={characterName} onWake={triggerPrimaryWake} /> : <div className="quiet-empty">动态已关闭。<button onClick={() => openSpace('chat')}>前往设置</button></div>)}
      {page === 'feed' && <div className="feed-job-dock"><MediaJobNotice jobs={experience.snapshot.jobs.filter(job => job.purpose === 'feed')} bridge={scopedBridge} healthy={healthy} refresh={experience.refresh} diagnose={setMessageDiagnostic} /></div>}
      {page === 'chat' && <ChatPage
        quickStart={quickStart.view}
        composer={{
          bridge, scopedBridge, selected, native, healthy, busy, delivery, composerState, media, images,
          snapshot: experience.snapshot, refresh: experience.refresh, enterBehavior: experience.settings.enterBehavior,
          guideRef: onboardingTargets.chat as React.RefObject<HTMLDivElement>, openVisual: () => openSpace('visual'), diagnose: setMessageDiagnostic,
        }}
        thread={{ history, userName: settings.userName, messageFailures: activity.failures, typing: activity.typing, focusMessageDiagnostic, newMessages, toLatest }}
        wake={wakeProps}
      />}
      {page === 'cards' && <>
        <SettingsSubpageHeader
          title="人格与角色库"
          backLabel="返回故事"
          onBack={() => setPage('chat')}
        />
        <CharacterLibrary {...libraryProps} guideRef={onboardingTargets.library} />
      </>}
      {page === 'story' && <StoryPage
        guideRef={onboardingTargets.story as React.RefObject<HTMLDivElement>} detail={detail} setDetail={appNavigation.setDetail}
        story={story} selected={selected} bridge={bridge} busy={busy} act={act} refresh={refreshStory} toLatest={toLatest}
        wake={wakeProps} wakeStatusNote={wakeStatusNote} editSetting={() => { openSpace('world'); setSettingEditor(true) }}
      />}
      {page === 'settings' && (spacePage ? <SpaceDetail
        spacePage={spacePage} navigation={appNavigation} persistence={persistence}
        bridge={bridge} core={{ native, healthy, busy, sending, transitioning, runtime, setRuntime }}
        profile={{ selected, cardName: active?.card.name || '', characterName, scopedBridge }}
        experience={experience} avatar={avatar} appearance={appearance} voices={voices} stickers={stickers}
        diagnostic={diagnostic} setDiagnostic={setDiagnostic}
        act={act} setNotice={setNotice} diagnose={setMessageDiagnostic} storyChanged={storyChanged}
        openSettingEditor={() => setSettingEditor(true)} openStickerManager={() => setStickerManager(true)}
        openQuickStart={() => { quickStart.reopen(); setPage('chat') }} library={<CharacterLibrary {...libraryProps} />}
      /> : <SpaceHome
        wake={wakeProps} wakeStatusNote={wakeStatusNote} busy={busy} sending={sending} healthy={healthy} rest={rest}
        navigation={appNavigation} inboxUnread={inboxUnread} onboardingTargets={onboardingTargets}
      />)}

    </main>
    <BottomNavigation navigation={navigation} page={page} selectTab={selectTab} />
    {messageDiagnostic !== null && <MessageDiagnostics jobs={experience.snapshot.jobs} refreshJobs={experience.refresh} configureImages={() => { setMessageDiagnostic(null); openSpace('media') }} key={selected} bridge={scopedBridge} healthy={healthy} messageId={messageDiagnostic} messages={messages} close={() => setMessageDiagnostic(null)} />}
    {settingEditor && <StorySettingEditor key={selected} bridge={bridge} close={() => setSettingEditor(false)} saved={async () => { await refreshStory(); setNotice('故事设定已更新。') }} />}
    {stickerManager && <StickerManager back={stickerManagerBack} library={stickers} bridge={bridge} native={native} change={value => { saveStickers(value); if (runtimeRef.current?.state === 'healthy') setRestartNeeded(true) }} close={() => setStickerManager(false)} notify={setNotice} importReason={!settingsReady ? '正在读取模型设置，请稍候…' : stickerImportReason(settings)} beforeImport={async () => { const reason = stickerImportReason(settingsRef.current); if (reason) throw new Error(reason); await persistSettings() }} configureVision={() => { setStickerManager(false); openSpace('tasks') }} />}
    <CharacterOverlays actions={characterActions} bridge={bridge} native={native} busy={busy} setBusy={setBusy}
      cards={cards} settingsReady={settingsReady} config={settings.mobileConfig} />
  </div>{historySearch && <HistorySearch key={selected} bridge={scopedBridge} background={appShell} close={() => setHistorySearch(false)} />}{onboardingOpen && <Onboarding targets={onboardingTargets} background={appShell} prepare={prepareOnboarding} close={closeOnboarding} />}</>
}
