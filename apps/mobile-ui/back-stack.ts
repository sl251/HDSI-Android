// 局部浮层返回拦截栈：用于在系统返回键触发前优先收起已展开的下拉框或确认弹窗
type BackHandler = () => boolean

const stack: BackHandler[] = []

/** 注册一个后进先出的返回拦截处理器，返回注销函数。 */
export function registerBackHandler(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const index = stack.lastIndexOf(handler)
    if (index >= 0) stack.splice(index, 1)
  }
}

/** 按后进先出顺序执行已注册的拦截器；有任一浮层消耗了返回动作则返回 true。 */
export function dispatchBackOverlay(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]()) return true
  }
  return false
}
