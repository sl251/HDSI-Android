import React, { useEffect, useState } from 'react'
import type { NativeBridge } from '../../packages/contracts'

export function PowerSettings({ bridge, notify }: { bridge: NativeBridge; notify: (text: string) => void }) {
  const [mode, setMode] = useState<'continuous' | 'balanced'>(), [busy, setBusy] = useState(false)
  useEffect(() => { let disposed = false; void bridge.powerSettings?.().then(value => { if (!disposed) setMode(value.mode) }).catch(() => {}); return () => { disposed = true } }, [bridge])
  if (!mode || !bridge.savePowerSettings) return null
  return <section className="panel"><h2>后台与电量</h2><label>运行方式<select aria-label="后台运行方式" value={mode} disabled={busy} onChange={async event => {
    const next = event.target.value as typeof mode; setBusy(true)
    try { setMode((await bridge.savePowerSettings!({ mode: next })).mode); notify('后台运行方式已保存，即时生效。') }
    catch (error) { notify(error instanceof Error ? error.message : '保存失败') } finally { setBusy(false) }
  }}><option value="continuous">持续在线</option><option value="balanced">节省电量</option></select></label>
    <p className="caption">持续在线会保持 CPU 唤醒，适合主动联系与 QQ 长时间接入，耗电较高。</p>
    <p className="caption">节省电量会在退到后台或最后一次主动操作后最多保活 10 分钟，再允许设备休眠。锁屏后的回复、主动联系与 QQ 消息可能延迟；回到前台后继续运行。</p>
  </section>
}
