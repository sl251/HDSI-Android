import React, { useEffect, useRef, useState } from 'react'
import type { Appearance, NativeBridge } from '../../packages/contracts'
import { appearanceAssets } from './appearance-assets'

export const defaultAppearance: Appearance = { font: 'default', fontSize: 14, backgroundOpacity: 35, panelOpacity: 84, backgroundBlur: 0, theme: 'system', palette: 'sky' }

function supportsBridgeMethod(method: string): boolean {
  const headers = (window as unknown as { Capacitor?: { PluginHeaders?: { name: string; methods?: { name: string }[] }[] } }).Capacitor?.PluginHeaders
  const runtimeHeader = headers?.find(item => item.name === 'HdsRuntime')
  if (!runtimeHeader?.methods) return true
  return runtimeHeader.methods.some(item => item.name === method)
}

async function sampleTopBarDarkness(source: string | undefined, opacityPercent: number, effectiveDarkTheme: boolean): Promise<boolean | null> {
  if (!source || opacityPercent < 45 || typeof document === 'undefined') return null
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 8
        const ctx = canvas.getContext('2d')
        if (!ctx || img.naturalWidth <= 0 || img.naturalHeight <= 0) { resolve(null); return }
        const stripHeight = Math.max(1, Math.round(img.naturalHeight * 0.14))
        ctx.drawImage(img, 0, 0, img.naturalWidth, stripHeight, 0, 0, 16, 8)
        const pixels = ctx.getImageData(0, 0, 16, 8).data
        let luminanceSum = 0
        const count = pixels.length / 4
        const base = effectiveDarkTheme ? [15, 20, 29] : [244, 246, 251]
        const alpha = Math.min(1, Math.max(0, opacityPercent / 100))
        for (let i = 0; i < pixels.length; i += 4) {
          const imgAlpha = (pixels[i + 3] / 255) * alpha
          const r = pixels[i] * imgAlpha + base[0] * (1 - imgAlpha)
          const g = pixels[i + 1] * imgAlpha + base[1] * (1 - imgAlpha)
          const b = pixels[i + 2] * imgAlpha + base[2] * (1 - imgAlpha)
          luminanceSum += 0.299 * r + 0.587 * g + 0.114 * b
        }
        resolve(luminanceSum / count < 142)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = source
  })
}

export function useAppearance(bridge: NativeBridge, native: boolean, notify: (text: string) => void) {
  const [value, setValue] = useState<Appearance>(defaultAppearance)
  const [ready, setReady] = useState(!native)
  const current = useRef(value); current.current = value
  const queue = useRef(Promise.resolve())
  useEffect(() => { let cancelled = false; if (native) void bridge.appearance().then(result => { if (!cancelled) { setValue({ ...defaultAppearance, ...appearanceAssets(result) }); setReady(true) } }).catch(error => notify(String(error))); return () => { cancelled = true } }, [native])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = value.theme
    root.dataset.palette = value.palette || 'sky'
    root.style.setProperty('--ui-font', value.font === 'custom' && value.fontData ? 'HdsCustom' : value.font === 'serif' ? '"Noto Serif CJK SC",serif' : value.font === 'sans' ? 'sans-serif' : '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif')
    root.style.setProperty('--font-scale', String(value.fontSize / 14))
    root.style.setProperty('--panel-alpha', String(value.panelOpacity / 100))
    let font: FontFace | undefined, cancelled = false
    if (value.font === 'custom' && value.fontData) {
      font = new FontFace('HdsCustom', `url("${value.fontData}")`)
      void font.load().then(loaded => { if (!cancelled) document.fonts.add(loaded) }).catch(() => { if (!cancelled) notify('字体无法在当前 WebView 加载，请切换字体或重新导入') })
    }
    if (native && ready && supportsBridgeMethod('syncSystemBars')) {
      const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      const effectiveDark = value.theme === 'dark' ? true : value.theme === 'light' ? false : systemDark
      void sampleTopBarDarkness(value.backgroundData, value.backgroundOpacity, effectiveDark).then(wallpaperIsDark => {
        if (!cancelled) void bridge.syncSystemBars?.({ theme: value.theme, wallpaperIsDark }).catch(() => {})
      })
    }
    return () => { cancelled = true; if (font) document.fonts.delete(font) }
  }, [native, ready, value.font, value.fontData, value.fontSize, value.panelOpacity, value.theme, value.palette, value.backgroundData, value.backgroundOpacity])
  const save = (next: Appearance, removals?: { removeBackground?: boolean; removeFont?: boolean }) => {
    setValue(next)
    if (!native || !ready) return
    queue.current = queue.current.catch(() => {}).then(async () => {
      // 资源保存在原生文件目录，避免将大型 data URL 写入设置 JSON
      const { backgroundData, fontData, backgroundPath, fontPath, backgroundRevision, fontRevision, ...options } = next
      await bridge.saveAppearance({ ...options, ...removals })
    }).catch(error => { notify(String(error)) })
  }
  const pick = async (kind: 'background' | 'font') => {
    await queue.current
    const result = await bridge.pickAppearanceAsset({ kind })
    if (result.cancelled) return
    // 重新读取持久化后的资源，不把选择器回调当作落盘证明
    const persisted = await bridge.appearance()
    const saved = appearanceAssets(persisted)
    const asset = kind === 'background' ? saved.backgroundData : saved.fontData
    if (typeof asset !== 'string' || !asset || !(kind === 'background' ? persisted.backgroundPath || asset.startsWith('data:image/') : persisted.fontPath || asset.startsWith('data:font/'))) throw new Error('所选资源未能保存，请重新选择')
    setValue({ ...current.current, ...(kind === 'font' ? { font: 'custom' as const, fontData: saved.fontData, fontPath: saved.fontPath, fontRevision: saved.fontRevision, fontName: saved.fontName } : { backgroundData: saved.backgroundData, backgroundPath: saved.backgroundPath, backgroundRevision: saved.backgroundRevision }) })
    notify(kind === 'background' ? '背景图片已保存并应用，可以调整透明度。' : '字体已保存并应用。')
  }
  return { value, save, pick, ready }
}
type Props = { appearance: ReturnType<typeof useAppearance>; native: boolean; busy: boolean; act: (task: () => Promise<unknown>, success?: string) => Promise<void> }
export function AppearanceSettings({ appearance, native, busy, act }: Props) {
  const { value, save, pick } = appearance
  const update = (patch: Partial<Appearance>) => save({ ...value, ...patch })
  return <section className="settings-group"><details open><summary><span><b>界面与阅读</b><small>字体、背景、透明度与主题</small></span></summary>
    <fieldset disabled={busy || !appearance.ready}>
      <details><summary>字体与字号</summary><label>界面字体<select aria-label="界面字体" value={value.font} onChange={event => update({ font: event.target.value as Appearance['font'] })}><option value="default">默认字体</option><option value="sans">系统无衬线</option><option value="serif">衬线阅读</option>{value.fontData && <option value="custom">{value.fontName || '自定义字体'}</option>}</select></label>
        <button className="secondary" disabled={!native} onClick={() => act(() => pick('font'))}>导入 TTF / OTF 字体</button>
        <label>阅读字号 · {value.fontSize}px<input type="range" min="12" max="24" value={value.fontSize} onChange={event => update({ fontSize: Number(event.target.value) })} /></label>
        <p className="appearance-sample">幕间的生活，藏在每一次相逢里。Aa 0123</p>
      </details>
      <details><summary>背景与透明度</summary><div className="actions"><button className="secondary" disabled={!native} onClick={() => act(() => pick('background'))}>选择背景图片</button>{value.backgroundData && <button className="text-button" onClick={() => save({ ...value, backgroundData: undefined, backgroundPath: undefined, backgroundRevision: undefined }, { removeBackground: true })}>移除背景</button>}</div>
        {value.backgroundData && <img className="background-preview" src={value.backgroundData} alt="已保存的背景图片" />}
        <label>背景图片不透明度 · {value.backgroundOpacity}%<input type="range" min="0" max="100" value={value.backgroundOpacity} onChange={event => update({ backgroundOpacity: Number(event.target.value) })} /></label>
        <label>面板不透明度 · {value.panelOpacity}%<input type="range" min="0" max="100" value={value.panelOpacity} onChange={event => update({ panelOpacity: Number(event.target.value) })} /></label>
        <label>背景模糊 · {value.backgroundBlur}px<input type="range" min="0" max="20" value={value.backgroundBlur} onChange={event => update({ backgroundBlur: Number(event.target.value) })} /></label>
        <p className="caption">数值越低越透明。图片保存在手机本地；面板透明度影响消息、输入框与设置面板。</p>
      </details>
      <details><summary>主题与恢复默认</summary><label>主题<select value={value.theme} onChange={event => update({ theme: event.target.value as Appearance['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><div className="palette-options" role="group" aria-label="主题配色">{([["sky", "晴空蓝"], ["sage", "松叶绿"], ["rose", "蔷薇粉"], ["lavender", "暮光紫"], ["amber", "暖茶棕"]] as const).map(([key, label]) => <button key={key} type="button" data-swatch={key} aria-pressed={(value.palette || "sky") === key} onClick={() => update({ palette: key })}><span aria-hidden="true" />{label}</button>)}</div><button className="secondary" onClick={() => save(defaultAppearance, { removeBackground: true, removeFont: true })}>恢复默认外观</button></details>
    </fieldset>
  </details></section>
}
