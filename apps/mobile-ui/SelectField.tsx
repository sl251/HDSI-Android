import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { registerBackHandler } from './back-stack'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

/** 应用内自定义玻璃下拉选择器：替代原生 select，支持键盘操作、点击外部关闭与返回键拦截。 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  helperText,
  ariaLabel,
}: {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  helperText?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, options.findIndex(item => item.value === value)))
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const labelId = useId()
  const listboxId = useId()

  const selectedIndex = Math.max(0, options.findIndex(item => item.value === value))
  const current = options[selectedIndex] ?? options[0]

  useEffect(() => {
    if (!open) return
    setFocusedIndex(selectedIndex)
  }, [open, selectedIndex])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const navRect = document.querySelector('nav')?.getBoundingClientRect()
    const bottomLimit = navRect && navRect.height > 0 ? navRect.top - 12 : window.innerHeight - 20
    const estimatedMenuHeight = options.length * 48 + 20
    const spaceBelow = bottomLimit - rect.bottom
    const spaceAbove = rect.top - 16
    setDropUp(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow)
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const unregisterBack = registerBackHandler(() => {
      setOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
      return true
    })
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      unregisterBack()
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useEffect(() => {
    if (disabled && open) setOpen(false)
  }, [disabled, open])

  const commit = (nextValue: T) => {
    onChange(nextValue)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const moveFocus = (delta: number) => {
    const next = (focusedIndex + delta + options.length) % options.length
    setFocusedIndex(next)
    optionRefs.current[next]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
      }
      return
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1) }
    else if (event.key === 'Home') { event.preventDefault(); setFocusedIndex(0); optionRefs.current[0]?.focus() }
    else if (event.key === 'End') { event.preventDefault(); const last = options.length - 1; setFocusedIndex(last); optionRefs.current[last]?.focus() }
  }

  return (
    <div ref={rootRef} className={`select-field${open ? ' open' : ''}${dropUp ? ' drop-up' : ''}`}>
      <span id={labelId} className="select-label">{label}</span>
      <div className="select-control">
        <button
          ref={triggerRef}
          type="button"
          className="select-trigger"
          role="combobox"
          aria-labelledby={labelId}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          disabled={disabled}
          onClick={() => setOpen(prev => !prev)}
          onKeyDown={handleKeyDown}
        >
          <span className="select-value">{current?.label || ''}</span>
          <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div
            id={listboxId}
            className="select-popover"
            role="listbox"
            aria-labelledby={labelId}
            onKeyDown={handleKeyDown}
          >
            {options.map((option, index) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  ref={el => { optionRefs.current[index] = el }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`select-option${selected ? ' selected' : ''}`}
                  onClick={() => commit(option.value)}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <svg className="select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {helperText && <small className="select-helper">{helperText}</small>}
    </div>
  )
}
