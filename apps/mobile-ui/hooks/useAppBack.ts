import { useLayoutEffect, useRef } from 'react'
import { dispatchBackOverlay, registerBackHandler } from '../back-stack'

// 普通浮层使用默认优先级 0，位于引导之后、其他页面层之前。
const layers = [
  ['onboarding', 1],
  ['historySearch', -1],
  ['stickerManager', -2],
  ['stickerDrawer', -3],
  ['mediaDrawer', -4],
  ['exportDialog', -5],
  ['importCodeDialog', -6],
  ['messageDiagnostic', -7],
  ['settingEditor', -8],
  ['inbox', -9],
  ['switcher', -10],
  ['spacePage', -11],
  ['cards', -12],
] as const

/** 有值表示该层开启；动作即使不关闭该层，也会消费返回事件。 */
type AppBackActions = Partial<Record<typeof layers[number][0], () => void>>

export function useAppBack(actions: AppBackActions): void {
  const actionsRef = useRef(actions)
  // 只发布已提交的状态，避免返回事件读取尚未提交的渲染。
  useLayoutEffect(() => { actionsRef.current = actions }, [actions])

  useLayoutEffect(() => {
    const unregister = layers.map(([name, priority]) => registerBackHandler(() => {
      const action = actionsRef.current[name]
      if (!action) return false
      action()
      return true
    }, priority))
    const target = window as Window & { hdsHandleBack?: () => boolean }
    const handleBack = dispatchBackOverlay
    target.hdsHandleBack = handleBack
    return () => {
      if (target.hdsHandleBack === handleBack) delete target.hdsHandleBack
      unregister.forEach(dispose => dispose())
    }
  }, [])
}
