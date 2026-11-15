import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const onboardingStorageKey = 'hds.onboarding.v1'
const steps = [
  { target: 'welcome', title: '欢迎来到 HDS', body: 'HDS 是一个陪伴式角色叙事 App。选一个角色，聊聊日常，让你们的经历慢慢成为故事。接下来一起认认基本功能。' },
  { target: 'library', title: '先认识故事的主角', body: '在角色库里，可以导入角色卡，也可以点“手动创建”写下一个人。以后从顶栏切换角色，或到“空间 → 角色与故事”就能管理角色。' },
  { target: 'models', title: '连接会回话的模型', body: '在“空间 → 模型与任务分工”添加模型连接，填写服务地址、模型名称与密钥并测试；再切换到“任务分工”为故事选择主叙事模型，角色即可开口对话。' },
  { target: 'chat', title: '唤醒角色，开始对话', body: '回到“故事”主页，点“唤醒”让本机故事核心运行；也可随时点击右上角状态胶囊切换休眠。角色与模型就绪后，写一句“你好”就能聊起来。' },
  { target: 'story', title: '在见闻与动态里记录生活', body: '“见闻”会记下故事时间线、长期记忆与此刻心绪；底部“动态”可以分享近况、点赞与评论，和角色互动。' },
  { target: 'help', title: '消息排查与个性化设置', body: '没收到回复时，打开“空间 → 备份、诊断与帮助”中的消息诊断查看每一步链路；还能在同一页里导出存档、重看引导或调整界面个性化。' },
] as const
export type OnboardingTarget = typeof steps[number]['target']
type Box = { left: number; top: number; width: number; height: number }
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function Onboarding({ targets, background, prepare, close }: {
  targets: Record<OnboardingTarget, React.RefObject<HTMLElement>>
  background: React.RefObject<HTMLElement>
  prepare: (target: OnboardingTarget) => void
  close: () => void
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const [cardTop, setCardTop] = useState<number>()
  const dialog = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const prepareRef = useRef(prepare)
  prepareRef.current = prepare
  const step = steps[index]

  useLayoutEffect(() => {
    const shell = background.current
    const previous = document.activeElement as HTMLElement | null
    const wasInert = shell?.inert ?? false
    const hidden = shell?.getAttribute('aria-hidden')
    const overflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    if (shell) { shell.inert = true; shell.setAttribute('aria-hidden', 'true') }
    dialog.current?.focus({ preventScroll: true })
    return () => {
      clearTimeout(timer.current)
      document.documentElement.style.overflow = overflow
      if (shell) {
        shell.inert = wasInert
        if (hidden == null) shell.removeAttribute('aria-hidden')
        else shell.setAttribute('aria-hidden', hidden)
      }
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [background])

  useLayoutEffect(() => {
    setVisible(false); setBox(null)
    prepareRef.current(step.target)
    let frame = 0
    // The destination must mount and restore its layout before measuring the ref.
    const first = requestAnimationFrame(() => {
      targets[step.target].current?.scrollIntoView({ block: 'center', behavior: 'instant' })
      frame = requestAnimationFrame(() => { measure(); setVisible(true) })
    })
    const measure = () => {
      const rect = targets[step.target].current?.getBoundingClientRect()
      const gap = 12, width = innerWidth, height = innerHeight
      const next = rect ? {
        left: Math.max(gap, rect.left - 8), top: Math.max(gap, rect.top - 8),
        width: Math.max(0, Math.min(width - gap, rect.right + 8) - Math.max(gap, rect.left - 8)),
        height: Math.max(0, Math.min(height - gap, rect.bottom + 8) - Math.max(gap, rect.top - 8)),
      } : null
      setBox(next)
      const cardHeight = card.current?.getBoundingClientRect().height ?? 280
      const below = next ? next.top + next.height + 16 : height - cardHeight - 24
      const above = next ? next.top - cardHeight - 16 : 24
      setCardTop(Math.max(gap, Math.min(height - cardHeight - gap, below + cardHeight <= height - gap ? below : above >= gap ? above : height - cardHeight - 24)))
    }
    const resize = () => measure()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', resize, { passive: true })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize) }
  }, [index, step.target, targets])

  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => dialog.current?.style.setProperty('--guide-height', `${viewport?.height ?? innerHeight}px`)
    update(); viewport?.addEventListener('resize', update)
    return () => viewport?.removeEventListener('resize', update)
  }, [])

  const move = (next: number) => {
    clearTimeout(timer.current)
    if (reducedMotion()) { setIndex(next); return }
    setVisible(false)
    timer.current = setTimeout(() => setIndex(next), 75)
  }
  return <div ref={dialog} className={`onboarding-overlay${visible ? ' is-visible' : ''}${box ? ' has-target' : ''}`} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-body" tabIndex={-1} data-step={index + 1} onTouchMove={event => { if (event.target === event.currentTarget) event.preventDefault() }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus() }
  }}>
    {box && <div className="onboarding-highlight" aria-hidden="true" style={box} />}
    <div ref={card} className="onboarding-card" style={{ top: cardTop }}>
      <p className="onboarding-progress" aria-live="polite">新手引导 · {index + 1} / {steps.length}</p>
      <h2 id="onboarding-title">{step.title}</h2>
      <p id="onboarding-body">{step.body}</p>
      <div className="onboarding-actions"><button className="text-button" onClick={close}>跳过</button><button className="secondary" disabled={index === 0} onClick={() => move(index - 1)}>上一步</button><button className="primary" onClick={() => index === steps.length - 1 ? close() : move(index + 1)}>{index === steps.length - 1 ? '开始使用' : '下一步'}</button></div>
    </div>
  </div>
}
