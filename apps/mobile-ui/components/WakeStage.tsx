import type { RuntimeStatus, SavedCard } from '../../../packages/contracts'

export interface WakeStageProps {
  active?: SavedCard
  cardCount: number
  avatar: string
  characterName: string
  modelReady: boolean
  runtime: RuntimeStatus | null
  transitioning: boolean
  runtimeLabel: string
  wakeActionLabel: string
  chatWakeDisabled: boolean
  triggerPrimaryWake: () => void
  cancelInstall: () => void
}

export function WakeStage({
  active, cardCount, avatar, characterName, modelReady, runtime, transitioning, runtimeLabel,
  wakeActionLabel, chatWakeDisabled, triggerPrimaryWake, cancelInstall,
}: WakeStageProps) {
  // 抽取简短人设或开场白微摘录，避免唤醒前舞台显得空旷
  const wakeQuoteSource = (active?.card.firstMessage || active?.card.description || active?.card.personality || '').replace(/\s+/g, ' ').trim()
  const wakeQuoteText = wakeQuoteSource ? `${wakeQuoteSource.slice(0, 68)}${wakeQuoteSource.length > 68 ? '…' : ''}` : ''
  return (
    <div className="chat-wake-stage" role="status">
      {transitioning ? (
        <div className="wake-progress-inline">
          <span className="wake-core-orb is-pulsing" aria-hidden="true">
            <svg className="wake-orbit-svg" viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="1.4" strokeDasharray="18 12" opacity="0.65" />
            </svg>
            <svg className="wake-spark-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5L14.2 9.8L21.5 12L14.2 14.2L12 21.5L9.8 14.2L2.5 12L9.8 9.8L12 2.5Z" />
            </svg>
          </span>
          <progress aria-label={runtimeLabel} />
          <span className="wake-progress-label">{runtimeLabel}</span>
          {runtime?.state === 'installing' && <small>首次准备约 1 分钟，请稍候…</small>}
          {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={cancelInstall}>取消准备</button>}
        </div>
      ) : (
        <div className="wake-glass-card">
          <div className="wake-card-meta">
            <span className="wake-card-pill"><i aria-hidden="true" />{runtimeLabel}</span>
            <span className="wake-card-tag">{active ? `共 ${cardCount} 位角色 · 本地记忆` : '故事准备'}</span>
          </div>
          <div className="wake-card-identity">
            <span className="wake-card-avatar" aria-hidden="true" data-initial={avatar ? undefined : (characterName || '此').slice(0, 1)}>
              {avatar && <img src={avatar} alt="" />}
            </span>
            <div className="wake-card-copy">
              <h2>{characterName || '等候一位主角'}</h2>
              <p className={`wake-card-quote${wakeQuoteText ? '' : ' is-placeholder'}`}>
                {wakeQuoteText ? `“${wakeQuoteText}”` : !active ? '挑一位角色，或写下属于你们的设定。' : '核心在本地静候，轻触唤醒即可延续你们的故事。'}
              </p>
            </div>
          </div>
          <div className="wake-card-readiness" aria-hidden="true">
            <span className={`wake-chip${active ? ' is-ready' : ''}`}>{active ? '角色就绪' : '待选主角'}</span>
            <span className={`wake-chip${modelReady ? ' is-ready' : ''}`}>{modelReady ? '模型已连' : '待连模型'}</span>
            <span className="wake-chip is-ready">本地隐私</span>
          </div>
          <div className="wake-hero">
            <span className="wake-aura-glow" aria-hidden="true" />
            <button
              type="button"
              className={`wake-cta${runtime?.state === 'failed' ? ' is-retry' : ''}`}
              aria-label={wakeActionLabel}
              disabled={chatWakeDisabled}
              onClick={triggerPrimaryWake}
            >
              <span className="wake-core-orb" aria-hidden="true">
                <svg className="wake-orbit-svg" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="1.4" strokeDasharray="16 10 4 10" opacity="0.72" />
                </svg>
                <svg className="wake-spark-svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.5L14.2 9.8L21.5 12L14.2 14.2L12 21.5L9.8 14.2L2.5 12L9.8 9.8L12 2.5Z" />
                </svg>
              </span>
              <span className="wake-cta-copy" aria-hidden="true">
                <strong className="wake-cta-title">{wakeActionLabel}</strong>
                <small className="wake-cta-sub">{!active ? '先选择一位主角' : !modelReady ? '前往连接对话模型' : runtime?.state === 'failed' ? '连接未完成 · 点击重试' : '轻触唤醒故事核心'}</small>
              </span>
              <span className="wake-cta-wave" aria-hidden="true">
                <i /><i /><i />
              </span>
            </button>
          </div>
        </div>
      )}
      {runtime?.error && <p className="error wake-inline-error">{runtime.error}</p>}
    </div>
  )
}

export function InlineWakeBar({
  runtime, transitioning, runtimeLabel, wakeActionLabel, chatWakeDisabled, triggerPrimaryWake, cancelInstall,
}: WakeStageProps) {
  return (
    <div className="wake-inline-bar" role="status">
      <span className="wake-inline-status">{runtimeLabel}</span>
      {transitioning ? (
        <progress aria-label={runtimeLabel} />
      ) : (
        <button type="button" className="primary wake-pill" disabled={chatWakeDisabled} onClick={triggerPrimaryWake}>
          {wakeActionLabel}
        </button>
      )}
      {runtime?.state === 'installing' && <button type="button" className="text-button" onClick={cancelInstall}>取消准备</button>}
      {runtime?.error && <small className="error">{runtime.error}</small>}
    </div>
  )
}
