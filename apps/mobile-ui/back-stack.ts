// 局部浮层返回拦截栈：用于在系统返回键触发前优先收起已展开的下拉框或确认弹窗
type BackHandler = () => boolean

type BackEntry = { handler: BackHandler; priority: number }
const stack: BackEntry[] = []

/** 优先级越高越先处理；相同优先级按注册顺序后进先出。 */
export function registerBackHandler(handler: BackHandler, priority = 0): () => void {
  const entry = { handler, priority }
  const index = stack.findIndex(existing => existing.priority > priority)
  if (index < 0) stack.push(entry)
  else stack.splice(index, 0, entry)
  return () => {
    const index = stack.indexOf(entry)
    if (index >= 0) stack.splice(index, 1)
  }
}

/** 按优先级及后进先出顺序执行拦截器，直到某个处理器消费返回动作。 */
export function dispatchBackOverlay(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].handler()) return true
  }
  return false
}
