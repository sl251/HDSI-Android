import { useEffect, useRef } from 'react'

export function useAppChrome(native: boolean) {
  const appShell = useRef<HTMLDivElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // 原生环境由 MainActivity WindowInsetsCompat.Type.ime() 权威驱动 :root.ime-visible，避免横竖屏切换时 visualViewport 基线漂移产生冲突
    if (native) {
      appShell.current?.classList.remove('keyboard-open')
      return
    }
    const viewport = window.visualViewport
    if (!viewport) return
    let baseline = viewport.height
    const resize = () => {
      const editing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      if (!editing) baseline = viewport.height
      appShell.current?.classList.toggle('keyboard-open', innerWidth < 768 && editing && baseline - viewport.height > 150)
    }
    viewport.addEventListener('resize', resize); document.addEventListener('focusout', resize)
    return () => { viewport.removeEventListener('resize', resize); document.removeEventListener('focusout', resize) }
  }, [native])
  useEffect(() => {
    document.documentElement.classList.remove('native-insets')
    const navEl = navigation.current
    const headerEl = headerRef.current
    // 同步顶部状态栏与底部导航栏真实高度，保证见闻页切换栏与输入框精确对齐
    const syncChromeMetrics = () => {
      if (navEl) document.documentElement.style.setProperty('--nav-height', `${navEl.getBoundingClientRect().height}px`)
      if (headerEl) document.documentElement.style.setProperty('--header-height', `${Math.ceil(headerEl.getBoundingClientRect().height)}px`)
    }
    syncChromeMetrics()
    const observer = new ResizeObserver(syncChromeMetrics)
    if (navEl) observer.observe(navEl)
    if (headerEl) observer.observe(headerEl)
    return () => observer.disconnect()
  }, [native])
  return { appShell, navigation, headerRef }
}
