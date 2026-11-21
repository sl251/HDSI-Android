import type { Page } from '../navigation'

export interface IconProps {
  name: Page | 'arrow' | 'plus'
}

export function Icon({ name }: IconProps) {
  const paths = {
    feed: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l3 3m6 6 3 3M6 18l3-3m6-6 3-3',
    inbox: 'M3 5h18v14H3V5Zm0 0 9 8 9-8',
    chat: 'M5 4h14v12H9l-4 4V4Z',
    cards: 'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6M21 20v-2a7 7 0 0 0-4-6',
    story: 'M5 5h14M5 12h10M5 19h14',
    settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
