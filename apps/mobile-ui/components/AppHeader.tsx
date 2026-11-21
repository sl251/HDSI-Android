import React from 'react'
import type { SavedCard } from '../../../packages/contracts'
import type { Page } from '../navigation'

export interface AppHeaderProps {
  headerRef: React.RefObject<HTMLElement>
  switcherAnchorRef: React.RefObject<HTMLDivElement>
  welcomeRef: React.RefObject<HTMLDivElement>
  switcher: boolean
  toggleSwitcher: () => void
  avatarSource?: string
  characterName: string
  cards: SavedCard[]
  selected: string
  switchDisabled: boolean
  statusDisabled: boolean
  switchCard: (id: string) => void
  openLibrary: () => void
  page: Page
  openChatSettings: () => void
  native: boolean
  healthy: boolean
  runtimeLabel: string
  onStatusClick: () => void
}

export function AppHeader({
  headerRef, switcherAnchorRef, welcomeRef, switcher, toggleSwitcher, avatarSource,
  characterName, cards, selected, switchDisabled, statusDisabled, switchCard,
  openLibrary, page, openChatSettings, native, healthy, runtimeLabel, onStatusClick,
}: AppHeaderProps) {
  return (
    <header ref={headerRef}>
      <div className="header-leading" ref={switcherAnchorRef}>
        <button
          type="button"
          className={`character-switch header-character-switch${switcher ? ' is-open' : ''}`}
          aria-label="切换角色或故事"
          aria-expanded={switcher}
          aria-haspopup="dialog"
          aria-controls="header-character-dropdown"
          onClick={toggleSwitcher}
        >
          <span className="header-char-avatar" aria-hidden="true" data-initial={avatarSource ? undefined : (characterName || '此').slice(0, 1)}>
            {avatarSource && <img src={avatarSource} alt="" />}
          </span>
          <span className="header-char-name">{characterName || '此刻之外'}</span>
          <span className="header-char-chevron" aria-hidden="true">⌄</span>
        </button>
        {switcher && (
          <div id="header-character-dropdown" className="character-dropdown" role="dialog" aria-label="选择角色或故事">
            <div className="character-dropdown-list">
              {cards.map(saved => (
                <button
                  type="button"
                  className={`story-choice character-dropdown-item${saved.id === selected ? ' active' : ''}`}
                  disabled={switchDisabled}
                  key={saved.id}
                  onClick={() => switchCard(saved.id)}
                >
                  <span className="story-choice-main">
                    <span
                      className="story-choice-avatar"
                      aria-hidden="true"
                      data-initial={saved.id === selected && avatarSource ? undefined : saved.card.name.slice(0, 1)}
                    >
                      {saved.id === selected && avatarSource && <img src={avatarSource} alt="" />}
                    </span>
                    <span className="character-dropdown-name">{saved.card.name}</span>
                  </span>
                  <small>{saved.id === selected ? '当前故事' : '继续故事 →'}</small>
                </button>
              ))}
              {!cards.length && <p className="character-dropdown-empty">还没有角色，先导入或创建一个吧。</p>}
            </div>
            <div className="character-dropdown-divider" aria-hidden="true" />
            <button
              type="button"
              className="character-dropdown-library"
              aria-label="导入、创建与管理角色"
              onClick={openLibrary}
            >
              <span className="character-dropdown-library-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="12" height="16" rx="3" />
                  <path d="M16 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9" />
                  <circle cx="10" cy="10" r="2" />
                  <path d="M7.5 15.5a3.5 3.5 0 0 1 5 0" />
                </svg>
              </span>
              <span className="character-dropdown-library-copy">
                <strong>人格与角色库</strong>
                <small>导入 · 创建 · 修改人设</small>
              </span>
              <span className="character-dropdown-library-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
      <div className="header-actions" ref={welcomeRef}>
        {page === 'chat' && (
          <button type="button" className="header-chat-settings" aria-label="聊天设置" title="聊天设置" onClick={openChatSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="header-chat-settings-label">聊天设置</span>
          </button>
        )}
        <button
          className={`status ${healthy ? 'online' : ''}`}
          disabled={statusDisabled}
          title={healthy ? '点击进入休眠' : native ? '点击唤醒角色' : undefined}
          onClick={onStatusClick}
        >
          <i />{runtimeLabel}
        </button>
      </div>
    </header>
  )
}
