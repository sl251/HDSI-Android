import React from 'react'

/** 空间二级设置页与详情页统一头部：左侧紧凑返回图标按钮，右侧单一语义标题。 */
export function SettingsSubpageHeader({
  title,
  subtitle,
  backLabel = '返回空间',
  onBack,
  trailing,
}: {
  title: string
  subtitle?: string
  backLabel?: string
  onBack: () => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="page-heading subpage-heading">
      <div className="subpage-header-row">
        <button
          type="button"
          className="subpage-back-button"
          aria-label={backLabel}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="subpage-heading-copy">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {trailing && <div className="subpage-trailing">{trailing}</div>}
      </div>
    </div>
  )
}
