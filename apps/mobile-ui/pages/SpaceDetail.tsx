import type { ReactElement } from 'react'
import type { NativeBridge, RuntimeStatus } from '../../../packages/contracts'
import { AppearanceSettings, type useAppearance } from '../AppearanceSettings'
import { AvatarSettings, type useCharacterAvatar } from '../CharacterAvatar'
import { ExperiencePanel, type useExperience } from '../Experience'
import { LifeSettings } from '../LifeSettings'
import { ModelCenter } from '../ModelCenter'
import { NotificationSettings } from '../NotificationSettings'
import { PowerSettings } from '../PowerSettings'
import { RetrievalSettings } from '../RetrievalSettings'
import { SettingsSubpageHeader } from '../SettingsSubpageHeader'
import { StoryManagement } from '../StoryManagement'
import { VoiceSettings, type useVoices } from '../Voice'
import { WeatherStatus } from '../WeatherStatus'
import { SpaceSubtabs } from '../components/SpaceSubtabs'
import type { useAppNavigation } from '../hooks/useAppNavigation'
import type { useSettingsPersistence } from '../hooks/useSettingsPersistence'
import { spaceDetailGroup, spaceEntries, type SpacePage } from '../navigation'
import { settingEffects, settingEffectLabels } from '../setting-effects'
import { libraryBytes, type StickerLibrary } from '../sticker-state'

interface SpaceDetailProps {
  spacePage: SpacePage
  navigation: Pick<ReturnType<typeof useAppNavigation>, 'spaceMotion' | 'openSpace' | 'worldTab' | 'systemTab' | 'setDetail' |
    'setPage' | 'startOnboarding' | 'setWorldTab' | 'setSystemTab' | 'setSpacePage'>
  persistence: Pick<ReturnType<typeof useSettingsPersistence>, 'settings' | 'setSettings' | 'saveState' | 'saveError' | 'persistSettings'>
  bridge: NativeBridge
  profile: { selected: string; cardName: string; characterName: string; scopedBridge: NativeBridge }
  core: {
    native: boolean
    healthy: boolean
    busy: boolean
    sending: boolean
    transitioning: boolean
    runtime: RuntimeStatus | null
    setRuntime: (value: RuntimeStatus) => void
  }
  experience: ReturnType<typeof useExperience>
  avatar: ReturnType<typeof useCharacterAvatar>
  appearance: ReturnType<typeof useAppearance>
  voices: ReturnType<typeof useVoices>
  stickers: StickerLibrary
  diagnostic: Record<string, unknown> | null
  setDiagnostic: (value: Record<string, unknown>) => void
  act: (task: () => Promise<unknown>, success?: string) => Promise<void>
  setNotice: (text: string) => void
  diagnose: (id: string) => void
  openSettingEditor: () => void
  openStickerManager: () => void
  openQuickStart: () => void
  storyChanged: (historyReplaced?: boolean) => Promise<void>
  library: ReactElement
}

export function SpaceDetail({
  spacePage, navigation, persistence, bridge, profile, core, experience, avatar, appearance, voices, stickers,
  diagnostic, setDiagnostic, act, setNotice, diagnose, openSettingEditor, openStickerManager, openQuickStart,
  storyChanged, library,
}: SpaceDetailProps) {
  const { selected, cardName, characterName, scopedBridge } = profile
  const { native, healthy, busy, sending, transitioning, runtime, setRuntime } = core
  const { spaceMotion, openSpace, worldTab, systemTab, setDetail, setPage, startOnboarding } = navigation
  const { settings, setSettings, persistSettings, saveState, saveError } = persistence
  const entry = spaceEntries.find(item => item.key === spacePage) as { title: string; label: string } | undefined

  const renderExperience = (mode: 'chat' | 'media' | 'visual') => <ExperiencePanel
    cardId={selected} jobs={experience.snapshot.jobs} refreshJobs={experience.refresh} diagnose={diagnose}
    characterName={characterName} key={`${selected}:${mode}`} value={experience.settings}
    save={async value => { await persistSettings(); await experience.save(value) }}
    bridge={scopedBridge} native={native} healthy={healthy} mode={mode}
  >
    {mode === 'chat' && <label className="toggle"><input type="checkbox" checked={settings.modelOptions.mainStreamingMode === 'experimental'} onChange={e => setSettings(previous => ({ ...previous, modelOptions: { ...previous.modelOptions, mainStreamingMode: e.target.checked ? 'experimental' : 'off', ...(e.target.checked ? { mainResponseFormat: 'json-object' as const } : {}) } }))} />流式输出 · 回复边生成边显示</label>}
    {mode === 'chat' && <label>连续消息合并等待（秒）<input type="number" min={0} max={30} step={0.5} value={Number(settings.mobileConfig?.sections?.runtime?.userMessageDebounceSeconds ?? 1)} onChange={e => setSettings(previous => ({ ...previous, mobileConfig: { ...previous.mobileConfig, sections: { ...previous.mobileConfig?.sections, runtime: { ...previous.mobileConfig?.sections?.runtime, userMessageDebounceSeconds: Number(e.target.value) } } } }))} /><small>等你连续说完再回复；保存后重启核心生效。</small></label>}
  </ExperiencePanel>
  const renderModels = (mode: 'connections' | 'tasks' | 'advanced') => <ModelCenter
    key={spacePage} mode={mode} onNavigate={openSpace} settings={settings} setSettings={setSettings}
    native={native} busy={busy || sending} bridge={bridge} act={act} notify={setNotice}
  >
    {mode === 'tasks' && <RetrievalSettings settings={settings} setSettings={setSettings} bridge={bridge} native={native} healthy={healthy} busy={busy || sending} saveState={saveState} saveError={saveError} />}
  </ModelCenter>
  const renderLife = (area: 'daily' | 'advanced') => <LifeSettings
    openRetrieval={() => openSpace('tasks')} area={area} value={settings.mobileConfig}
    change={mobileConfig => setSettings(previous => ({ ...previous, mobileConfig }))}
    bridge={bridge} healthy={healthy} native={native} notify={setNotice}
  />
  const renderManagement = (scope: 'story' | 'backup') => <StoryManagement
    scope={scope} bridge={bridge} cardId={selected} name={cardName} native={native} healthy={healthy}
    busy={busy || sending || transitioning} act={act} changed={storyChanged} notify={setNotice}
  />

  const panels: Record<SpacePage, () => ReactElement> = {
    avatar: () => <AvatarSettings key={selected} avatar={avatar} bridge={scopedBridge} cardId={selected} name={characterName} native={native} healthy={healthy} imageEnabled={experience.settings.image.enabled} snapshot={experience.snapshot} refresh={experience.refresh} />,
    visual: () => renderExperience('visual'),
    media: () => renderExperience('media'),
    chat: () => <>
      {renderExperience('chat')}
      <button className="settings-entry" onClick={openStickerManager}><span>表情包管理<small>我的表情与角色表情 · 独立素材池</small></span></button>
    </>,
    life: () => <>
      <WeatherStatus bridge={scopedBridge} healthy={healthy} />
      <PowerSettings bridge={bridge} notify={setNotice} />
      <label className="toggle"><input type="checkbox" checked={settings.autoAdvance} onChange={event => setSettings({ ...settings, autoAdvance: event.target.checked })} /><div><b>持续生活与主动联系</b><p>默认关闭。开启后核心可在后台调用模型，产生 API 费用。保存后重启生效。</p></div></label>
      {renderLife('daily')}
    </>,
    appearance: () => <AppearanceSettings appearance={appearance} native={native} busy={busy} act={act} />,
    notifications: () => <NotificationSettings bridge={bridge} native={native} notify={setNotice} />,
    voice: () => <VoiceSettings bridge={bridge} state={voices.state} accept={voices.accept} cardId={selected} name={cardName} native={native} notify={setNotice} />,
    models: () => renderModels('connections'),
    tasks: () => renderModels('tasks'),
    advanced: () => <>{renderModels('advanced')}{renderLife('advanced')}</>,
    world: () => worldTab === 'library' ? library : <>
      <button className="settings-entry" disabled={!native || !healthy || busy} onClick={openSettingEditor}><span>修改故事设定<small>主角、世界、关系、视角与时区</small></span></button>
      <section className="settings-group world-identity-card"><details>
        <summary><span><b>故事与身份</b><small>你的称呼与人设 · {settingEffectLabels[settingEffects.identity.timing]}</small></span></summary>
        <label>你的称呼<input value={settings.userName} onChange={event => setSettings({ ...settings, userName: event.target.value })} maxLength={128} /></label>
        <label>你的故事人设<textarea rows={3} value={settings.userProfile} onChange={event => setSettings({ ...settings, userProfile: event.target.value })} maxLength={12000} placeholder="你在这个世界中的身份、与角色的关系…" /></label>
        <p className="caption">离开输入框时自动保存；仅用于新故事，已有故事会保留原设定。</p>
      </details></section>
      <button className="settings-entry" onClick={() => { setDetail('memory'); setPage('story') }}><span>记忆与故事<small>维护事实与故事中的经历</small></span></button>
      {renderManagement('story')}
    </>,
    system: () => systemTab === 'diagnostics' ? <>
      <button className="settings-entry" onClick={() => diagnose('')}><span>消息诊断<small>聊天、生图、发图与检索的排查建议</small></span></button>
      <button className="settings-entry" onClick={openQuickStart}><span>首次对话准备<small>检查角色、聊天连接与唤醒状态</small></span></button>
      <button className="settings-entry" onClick={startOnboarding}><span>重看新手引导<small>认识角色、模型连接与基本功能</small></span></button>
    </> : <>
      {renderManagement('backup')}
      <section className="settings-group"><details>
        <summary><span><b>核心维护与诊断</b><small>运行组件、设备信息与日志</small></span></summary>
        <p className="caption">遇到运行问题时，可重新准备核心组件。角色与故事会保留。</p>
        <button className="secondary" disabled={!native || busy || transitioning || healthy} onClick={() => act(async () => { await bridge.install(); setRuntime(await bridge.status()) })}>重新准备核心组件</button>
        <h3>设备与诊断</h3><dl>
          <div><dt>设备</dt><dd>{runtime?.device.model || '待原生读取'}</dd></div>
          <div><dt>Android / API</dt><dd>{runtime ? `${runtime.device.android} / ${runtime.device.sdk}` : '—'}</dd></div>
          <div><dt>ABI / 页大小</dt><dd>{runtime ? `${runtime.device.abi} / ${runtime.device.pageSize} B` : '—'}</dd></div>
          <div><dt>表情包占用</dt><dd>{(libraryBytes(stickers) / 1024 ** 2).toFixed(2)} MiB（含已发送原件）</dd></div>
          <div><dt>可用空间</dt><dd>{runtime ? `${(runtime.device.availableBytes / 1024 ** 3).toFixed(2)} GiB` : '—'}</dd></div>
          <div><dt>应用 / HDS</dt><dd>{runtime?.version || '—'} / rc57</dd></div>
        </dl>
        <div className="actions">
          <button className="secondary" disabled={!native || busy} onClick={() => act(async () => setDiagnostic(await bridge.diagnostics({ probe: true })))}>查看安装诊断</button>
          <button className="secondary" disabled={!native || busy} onClick={() => act(() => bridge.copyDiagnostics(), '安装诊断已复制，不含密钥、人设和聊天。')}>复制诊断</button>
          <button className="secondary" disabled={!native || busy} onClick={() => act(async () => { const result = await bridge.saveDiagnostics(); setNotice(result.cancelled ? '已取消保存' : '安装诊断已保存。') })}>保存诊断</button>
        </div>
        {diagnostic && <pre aria-label="安装诊断">{JSON.stringify(diagnostic, null, 2)}</pre>}
        <details><summary>查看运行日志</summary><pre role="log" aria-label="运行日志">{runtime?.logs.join('\n') || '暂无日志'}</pre></details>
        <p className="caption">请反馈错误阶段、页大小与日志；分享前检查是否包含个人聊天内容。16 KB 页、后台存活与 QQ 能力均需真机验证。</p>
      </details></section>
    </>,
  }

  return <>
    <SettingsSubpageHeader title={entry?.title || entry?.label || '设置'} onBack={() => openSpace(null, -1)} />
    <div key={`space-${spaceDetailGroup(spacePage)}`} className={`space-detail${spaceMotion === 'forward' ? ' space-enter-forward' : ''}`} data-settings-category={spacePage}>
      <SpaceSubtabs page={spacePage} navigation={navigation} />
      {(!native || saveError) && <div className={`save-status${saveError ? ' is-error' : ''}`} role={saveError ? 'alert' : 'status'}>
        {!native ? <span>界面预览 · 设置不会保存</span> : <>
          <p className="error">{saveError}</p>
          <button className="text-button" disabled={busy} onClick={() => void persistSettings().catch(() => {})}>重试保存</button>
        </>}
      </div>}
      {panels[spacePage]()}
    </div>
  </>
}
