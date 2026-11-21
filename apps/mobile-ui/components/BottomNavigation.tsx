import React from 'react'
import { labels, tabs, type Page, type Tab } from '../navigation'
import { Icon } from './Icon'

export interface BottomNavigationProps {
  navigation: React.RefObject<HTMLElement>
  page: Page
  selectTab: (tab: Tab) => void
}

export function BottomNavigation({ navigation, page, selectTab }: BottomNavigationProps) {
  const activeTab = page === 'cards' ? 'chat' : page === 'inbox' ? 'settings' : page
  return (
    <nav ref={navigation} aria-label="主导航" style={{ '--active-tab': tabs.indexOf(activeTab) } as React.CSSProperties}>
      <span className="nav-indicator" aria-hidden="true" />
      {tabs.map(key => {
        const active = key === page || (key === 'chat' && page === 'cards')
        return (
          <button
            key={key}
            className={active ? 'active' : ''}
            onClick={() => selectTab(key)}
            aria-current={active ? 'page' : undefined}
            aria-label={labels[key]}
          >
            <Icon name={key} /><span>{labels[key]}</span>
          </button>
        )
      })}
    </nav>
  )
}
