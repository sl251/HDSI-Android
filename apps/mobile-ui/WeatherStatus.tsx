import React, { useEffect, useState } from 'react'
import type { NativeBridge } from '../../packages/contracts'

export function WeatherStatus({ bridge, healthy }: { bridge: NativeBridge; healthy: boolean }) {
  const [value, setValue] = useState<Record<string, unknown>>()
  useEffect(() => { if (!healthy) return; let alive = true; const read = () => bridge.rpc({ method: 'weather.status' }).then(r => { if (alive) setValue(r.data as Record<string, unknown>) }).catch(() => {}); void read(); const timer = setInterval(() => { if (!document.hidden) void read() }, 15000); return () => { alive = false; clearInterval(timer) } }, [bridge, healthy])
  return <section className="settings-group"><h3>天气获取状态</h3><p className="caption">{!healthy ? '唤醒核心后可查看实际地点与最近结果。' : value?.state === 'ready' ? `${value.city ?? value.source ?? '当前地点'} · ${value.text ?? ''}` : value?.error ? String(value.error) : '尚无天气结果；请开启天气并等待下一次故事检查。'}</p>{value?.latitude !== undefined && <p className="caption">来源：{String(value.source)} · {String(value.latitude)}, {String(value.longitude)}</p>}{typeof value?.fetchedAt === 'number' && <p className="caption">更新于 {new Date(value.fetchedAt).toLocaleString('zh-CN')}</p>}</section>
}
