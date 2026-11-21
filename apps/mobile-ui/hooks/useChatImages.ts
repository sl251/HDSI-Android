import { useRef, type MutableRefObject } from 'react'
import { imageEntryReason, visionProjection, visionRouteReason, type ModelSettings, type NativeBridge, type RuntimeStatus } from '../../../packages/contracts'
import { clipboardJpeg } from '../clipboard-image'
import type { useChatComposer } from './useChatComposer'

export async function checkVision(bridge: NativeBridge, desired: ModelSettings) {
  const result = await bridge.rpc({ method: 'preset.syncStatus', payload: { currentVision: visionProjection(desired) } })
  const status = result.data as { visionRestartRequired?: boolean; activeVision?: ReturnType<typeof visionProjection> }
  if (status.visionRestartRequired !== false || !status.activeVision) throw new Error('识图配置尚未生效，请先重启核心；无法查询时请稍后重试')
  const reason = visionRouteReason(status.activeVision)
  if (reason) throw new Error(reason)
}

interface ImageOptions {
  bridge: NativeBridge
  native: boolean
  healthy: boolean
  busy: boolean
  sending: boolean
  settings: ModelSettings
  settingsRef: MutableRefObject<ModelSettings>
  runtimeRef: MutableRefObject<RuntimeStatus | null>
  profileRevision: MutableRefObject<number>
  savedSettings: MutableRefObject<string>
  composer: ReturnType<typeof useChatComposer>
  persistSettings: () => Promise<void>
  openSettings: () => void
  setBusy: (busy: boolean) => void
  setNotice: (text: string) => void
}

export function useChatImages({
  bridge, native, healthy, busy, sending, settings, settingsRef, runtimeRef, savedSettings, profileRevision,
  composer: { attachments, setAttachments }, persistSettings, openSettings, setBusy, setNotice,
}: ImageOptions) {
  const imageLock = useRef(false)
  const attachmentReason = imageEntryReason({ native, healthy, busy, sending, count: attachments.length, enabled: settings.modelOptions.visionEnabled === true })
  const pickImage = async (pasted?: File[], source: 'gallery' | 'camera' = 'gallery') => {
    if (imageLock.current) return
    if (attachmentReason) { setNotice(attachmentReason); if (!settingsRef.current.modelOptions.visionEnabled) openSettings(); return }
    imageLock.current = true
    const revision = profileRevision.current
    const fingerprint = JSON.stringify(settingsRef.current)
    // Saving may replace secrets/public rows; capture the post-save version for subsequent checks.
    let savedFingerprint = fingerprint
    const stillCurrent = () => revision === profileRevision.current && runtimeRef.current?.state === 'healthy' && JSON.stringify(settingsRef.current) === savedFingerprint
    setBusy(true); setNotice('')
    try {
      const original = settingsRef.current
      await persistSettings()
      if (revision !== profileRevision.current || runtimeRef.current?.state !== 'healthy') return
      // A concurrent edit must not open the picker for a different route.
      if (settingsRef.current !== original && savedSettings.current !== JSON.stringify(settingsRef.current)) return
      savedFingerprint = JSON.stringify(settingsRef.current)
      await checkVision(bridge, settingsRef.current)
      if (!stillCurrent()) return
      const result = pasted ? { cancelled: false, images: await Promise.all(pasted.slice(0, 3 - attachments.length).map(async file => ({ dataUri: await clipboardJpeg(file) }))), truncated: pasted.length > 3 - attachments.length } : await bridge.pickImage({ limit: 3 - attachments.length, source })
      if (result.cancelled || !stillCurrent()) return
      const images = result.images ?? (result.dataUri ? [{ dataUri: result.dataUri }] : [])
      const errors = (result.errors ?? []).map(error => `第 ${error.index + 1} 张：${error.message}`)
      for (const image of images.slice(0, 3 - attachments.length)) {
        if (!stillCurrent()) return
        try {
          const upload = await bridge.rpc({ method: 'images.upload', payload: { dataUri: image.dataUri } })
          if (!stillCurrent()) return
          const id = (upload.data as { id: string }).id
          setAttachments(current => current.some(item => item.id === id) ? current : [...current, { id, dataUri: image.dataUri }].slice(0, 3))
        } catch { errors.push('图片上传失败，已成功的图片仍保留') }
      }
      if (!images.length && !errors.length) errors.push('图库未返回图片，请重新选择')
      if (result.truncated || images.length > 3 - attachments.length) errors.push('已按剩余名额截取图片，最多 3 张')
      if (errors.length) setNotice(errors.join('；'))
    } catch (error) { if (revision === profileRevision.current) setNotice(error instanceof Error ? error.message : String(error)) }
    finally { imageLock.current = false; setBusy(false) }
  }

  return { pickImage, attachmentReason }
}
