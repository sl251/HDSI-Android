import type { RefObject } from 'react'
import { Icon } from '../components/Icon'
import type { WakeStageProps } from '../components/WakeStage'
import { spaceEntries, spaceSections } from '../navigation'
import type { useAppNavigation } from '../hooks/useAppNavigation'

interface SpaceHomeProps {
  wake: WakeStageProps
  wakeStatusNote: string
  busy: boolean
  sending: boolean
  healthy: boolean
  rest: () => void
  inboxUnread: number
  navigation: Pick<ReturnType<typeof useAppNavigation>, 'spaceMotion' | 'openSpace' | 'openInbox'>
  onboardingTargets: { models: RefObject<HTMLElement>; help: RefObject<HTMLElement> }
}

export function SpaceHome({ wake, wakeStatusNote, busy, sending, healthy, rest, inboxUnread, navigation, onboardingTargets }: SpaceHomeProps) {
  const { active, avatar, characterName, modelReady, runtime, transitioning, runtimeLabel, wakeActionLabel, chatWakeDisabled, triggerPrimaryWake, cancelInstall } = wake
  const { spaceMotion, openSpace, openInbox } = navigation
  return <div key="space-home" className={`space-home${spaceMotion === 'back' ? ' space-enter-back' : ''}`}>
    <section className="space-wake">
      <div className="space-wake-head">
        <div className="space-wake-identity">
          <span className="space-wake-avatar" aria-hidden="true" data-initial={avatar ? undefined : (characterName || '此').slice(0, 1)}>
            {avatar && <img src={avatar} alt="" />}
          </span>
          <div>
            <b>{active?.card.name || '未选定角色'}</b>
            {(!active || !modelReady) && <small>{!active ? '请在下方“角色与故事”选定主角' : '尚未配置主对话模型连接'}</small>}
          </div>
        </div>
        {runtime?.state === 'failed' && <span className="tag is-failed">{runtimeLabel}</span>}
      </div>
      {transitioning ? (
        <div className="space-wake-progress" role="status">
          <progress aria-label={runtimeLabel} />
          {wakeStatusNote && <p className="caption">{wakeStatusNote}</p>}
          {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={cancelInstall}>取消准备</button>}
        </div>
      ) : healthy ? (
        <button type="button" className="secondary wide space-wake-action" disabled={busy || sending} onClick={rest}>让故事休息一下</button>
      ) : (
        <button type="button" className="primary wide wake-button space-wake-action" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>{wakeActionLabel}<Icon name="arrow" /></button>
      )}
      {runtime?.error && <p className="error" role="alert">{runtime.error}</p>}
    </section>
    {spaceSections.map(section => (
      <section className="space-group" key={section.title}>
        <span className="space-section-label">{section.title}</span>
        <div className="space-grid">
          {section.keys.map(key => {
            const item = spaceEntries.find(entry => entry.key === key)!
            const guideRef = key === 'models' ? onboardingTargets.models : key === 'system' ? onboardingTargets.help : undefined
            return (
              <button
                ref={guideRef as RefObject<HTMLButtonElement> | undefined}
                className="settings-entry"
                key={item.key}
                onClick={() => openSpace(item.key, 1)}
              >
                <span>{item.label}<small>{item.caption}</small></span>
              </button>
            )
          })}
          {section.includeInbox && (
            <button className="settings-entry" onClick={() => openInbox('space', 1)}>
              <span>外部连接与信箱<small>来信、QQ 接入与会话管理{inboxUnread > 0 ? ` · ${inboxUnread} 条未读` : ''}</small></span>
            </button>
          )}
        </div>
      </section>
    ))}
  </div>
}
