import type { MediaConnection } from '../packages/contracts/experience'
import { diagnosticError } from './message-diagnostics'

export const imageLimit = 16 * 1024 * 1024
// JSON/SSE carries Base64, which is larger than the decoded image.
export const imageResponseLimit = Math.ceil(imageLimit * 4 / 3) + 1024 * 1024
export const mediaErrors: Record<string, string> = {
  authentication: '媒体服务拒绝密钥，请检查 API Key。', permission: '媒体服务拒绝访问，请检查模型权限。',
  provider_quota: '媒体服务余额或额度不足。', rate_limit: '媒体服务限流，请稍后再试。',
  throttled_or_quota: '媒体服务返回 429，请检查限流和额度。', provider_error: '媒体服务发生错误。',
  invalid_request: '媒体服务拒绝请求参数，请检查模型和接口格式。', media_route: '媒体接口不存在或不支持此方法，请检查地址和接口格式。',
  image_verification: '免费渠道需要网页验证，请点击“打开免费生图”继续完成。',
  image_busy: '免费渠道已有任务在处理，请等待该任务结束。', image_blocked: '服务拒绝了本次图片内容，请调整画面描述。',
  image_response: '生图响应格式无法识别。', image_empty: '服务返回成功，但没有返回可用图片。',
  image_async: '服务返回异步生图任务，但未提供受支持的查询协议。',
  image_download: '图片下载地址不可用。', image_save: '图片保存失败，请检查图片格式、大小和本机存储。',
  image_delivery: '图片已生成，但投递失败，可重试投递。', media_size: '媒体响应超过大小限制。',
  media_disabled: '请先在语音识别与生图设置中启用对应服务。', media_configuration: '旧任务被渠道配置检查中断；可重试继续处理。',
  media_submission_unknown: '旧任务可能已提交，尚未取得结果，请先在原服务端核实。',
  media_pending: '已有同类媒体任务正在处理。', media_input: '媒体任务参数无效，请检查画面描述或录音。',
  timeout: '媒体任务超时，远端完成及计费情况尚未确认。', network: '媒体服务连接失败，请检查网络和服务地址。',
  unknown_error: '媒体处理失败，未获得可安全分类的错误信息。',
}
export class MediaError extends Error {
  constructor(public reason: string, public status?: number) {
    super(`${mediaErrors[reason] ?? mediaErrors.unknown_error}${status ? `（HTTP ${status}）` : ''}`)
  }
}

// Inspect provider errors only in memory. Never persist response bodies, prompts or credentials.
export function mediaFailure(value: unknown, status?: number): MediaError {
  if (value instanceof MediaError) return value
  let detail = ''
  try { detail = typeof value === 'string' ? value : JSON.stringify(value) } catch { /* untrusted response */ }
  if (value instanceof Error) detail = `${value.name}: ${value.message}`
  if (status === undefined && typeof value === 'object' && value !== null) {
    const code = (value as any).error?.code
    if (Number.isInteger(code) && code >= 400 && code <= 599) status = code
  }
  detail = (detail ?? '').slice(0, 16000)
  const reason = /turnstile|captcha|human verification|验证/i.test(detail) ? 'image_verification'
    : /FREE_(?:GENERATION_ACTIVE|TASK_BROWSER_ACTIVE|TASK_IP_ACTIVE)/.test(detail) ? 'image_busy'
    : /content_policy|safety|IMAGE_SAFETY|PROHIBITED_CONTENT|blocked|敏感|违规/i.test(detail) ? 'image_blocked'
    : [404, 405].includes(status ?? 0) ? 'media_route'
    : diagnosticError({ message: detail, status })
  return new MediaError(reason, status)
}
async function responseBytes(response: Response, max: number) {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new MediaError('media_size') }
  if (!response.body) throw new MediaError('image_response')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new MediaError('media_size'); chunks.push(value) }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
export async function boundedResponse(response: Response, max = imageLimit) {
  if (!response.ok) {
    let detail = ''
    try { detail = (await responseBytes(response, 64 * 1024)).toString() } catch { /* Preserve HTTP status even for an unreadable body. */ }
    throw mediaFailure(detail, response.status)
  }
  return responseBytes(response, max)
}
export function mediaJson(bytes: Buffer) {
  try { return JSON.parse(bytes.toString()) }
  catch { throw new MediaError('image_response') }
}
export function imageResponse(bytes: Buffer, contentType = ''): ImageResult & { completed?: boolean } {
  if (contentType.startsWith('image/') || bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    if (bytes.length > imageLimit) throw new MediaError('media_size')
    return { bytes, completed: true }
  }
  const text = bytes.toString().trim()
  // Some gateways return SSE despite stream:false. Join text deltas before parsing Markdown.
  if (contentType.includes('text/event-stream') || text.startsWith('data:')) {
    const values = text.split(/\r?\n\r?\n/).flatMap(event => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim()
      if (!data || data === '[DONE]') return []
      try { return [JSON.parse(data)] } catch { throw new MediaError('image_response') }
    })
    const failure = values.map(value => imageResult(value)).find(result => result.failed)
    if (failure) return failure
    const completed = /(?:^|\n)data:\s*\[DONE\]/.test(text) || values.some(value => value.choices?.some((choice: any) => choice.finish_reason) || value.candidates?.some((candidate: any) => candidate.finishReason || candidate.finish_reason))
    if (!completed) throw new MediaError('image_response')
    const textDeltas = values.flatMap(value => value.choices ?? []).map(choice => typeof choice.delta?.content === 'string' ? choice.delta.content : '').join('')
    const joined = imageResult(textDeltas)
    return { ...(joined.bytes || joined.url ? joined : imageResult(values)), completed: true }
  }
  if (!/^[{[\"]/.test(text)) {
    const direct = imageResult(text)
    if (direct.bytes || direct.url) return { ...direct, completed: true }
  }
  const data = mediaJson(bytes)
  return { ...imageResult(data), completed: Array.isArray(data?.choices) || Array.isArray(data?.candidates) || Array.isArray(data?.data) || ['completed', 'succeeded', 'success'].includes(data?.status) }
}

type ImageResult = { taskId?: string; url?: string; bytes?: Buffer; failed?: boolean; reason?: string }
export function imageResult(value: any, depth = 0): ImageResult {
  if (depth > 12 || value == null) return {}
  if (typeof value === 'string') {
    const text = value.trim()
    const uri = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(text)
    if (uri) {
      const encoded = uri[1].replace(/\s/g, '')
      if (encoded.length > Math.ceil(imageLimit / 3) * 4) throw new MediaError('media_size')
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.length > imageLimit) throw new MediaError('media_size')
      if (bytes.length && bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '')) return { bytes }
      return {}
    }
    if (/^https?:\/\/[^\s<>]+$/i.test(text)) return { url: text }
    if (/^(iVBORw0KGgo|\/9j\/|UklGR)[A-Za-z0-9+/=\s]+$/.test(text)) return imageResult(`data:image/png;base64,${text}`, depth + 1)
    const markdown = /!\[[^\]]*\]\(<?(data:image\/[^\s)]+|https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\)/i.exec(text)
    return markdown ? imageResult(markdown[1], depth + 1) : {}
  }
  if (Array.isArray(value)) {
    let pending: ImageResult = {}, linked: ImageResult | undefined, failure: ImageResult | undefined
    for (const item of value) {
      const found = imageResult(item, depth + 1)
      if (found.bytes) return found
      if (found.url && !linked) linked = found
      if (found.failed) failure = found
      if (found.taskId) pending = found
    }
    return linked ?? failure ?? pending
  }
  if (typeof value !== 'object') return {}
  if (value.error || value.success === false || ['failed', 'error', 'cancelled'].includes(String(value.status).toLowerCase())) return { failed: true, reason: mediaFailure(value).reason }
  if (value.promptFeedback?.blockReason || value.prompt_feedback?.block_reason || value.refusal || /SAFETY|PROHIBITED_CONTENT|IMAGE_SAFETY|content_filter/.test(String(value.finishReason ?? value.finish_reason))) return { failed: true, reason: 'image_blocked' }
  // Completion IDs identify responses, not resumable provider jobs.
  const id = value.taskId ?? value.task_id ?? (!value.choices && !value.candidates && !value.object ? value.id : undefined)
  const taskId = typeof id === 'string' && id.length <= 256 ? id : undefined
  const inline = value.inlineData ?? value.inline_data
  if (inline?.data && /^image\/(png|jpe?g|webp)$/i.test(inline.mimeType ?? inline.mime_type ?? '')) return imageResult(`data:${inline.mimeType ?? inline.mime_type};base64,${inline.data}`, depth + 1)
  for (const key of ['b64_json', 'base64']) if (typeof value[key] === 'string') {
    const found = imageResult(`data:image/png;base64,${value[key]}`, depth + 1)
    if (found.bytes) return found
  }
  let pending: ImageResult = taskId ? { taskId } : {}
  for (const key of ['image', 'imageUrl', 'image_url', 'url', 'data', 'result', 'output', 'images', 'choices', 'message', 'delta', 'content', 'candidates', 'parts', 'text', 'fileData', 'file_data', 'fileUri', 'file_uri']) {
    if (value[key] == null) continue
    const found = imageResult(value[key], depth + 1)
    if (found.bytes || found.url || found.failed) return found
    if (found.taskId) pending = found
  }
  return pending
}
export function imageApi(connection: MediaConnection): 'images' | 'chat' | 'gemini' {
  if (connection.imageApi && connection.imageApi !== 'auto') return connection.imageApi
  const url = new URL(connection.endpoint)
  if (/:generateContent\/?$/.test(url.pathname)) return 'gemini'
  if (/\/images\/(generations|edits)\/?$/.test(url.pathname)) return 'images'
  if (/\/chat\/completions\/?$/.test(url.pathname)) return 'chat'
  if (url.hostname === 'generativelanguage.googleapis.com' && !url.pathname.includes('/openai')) return 'gemini'
  return /gemini.*image|nano[-_ ]?banana/i.test(connection.model) ? 'chat' : 'images'
}

/** Follow CDN redirects without sending API credentials or allowing private/local targets. */
export async function downloadImage(address: string, request: typeof fetch, signal: AbortSignal) {
  let url: URL
  try { url = new URL(address) } catch { throw new MediaError('image_download') }
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (url.protocol !== 'https:' || url.username || url.password || /^(localhost(?:\.|$)|0\.|127\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) throw new MediaError('image_download')
    const response = await request(url.href, { signal, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return boundedResponse(response, imageLimit)
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects === 5) throw new MediaError('image_download')
    try { url = new URL(location, url) } catch { throw new MediaError('image_download') }
  }
  throw new MediaError('image_download')
}
export function imageSize(model: string, ratio?: string) {
  if (ratio === '1:1' || /dall-e-2/i.test(model)) return '1024x1024'
  const long = /dall-e-3/i.test(model) ? 1792 : 1536
  return ['3:4', '9:16'].includes(ratio ?? '') ? `1024x${long}` : `${long}x1024`
}
export function geminiImageEndpoint(base: string, model: string) {
  const url = new URL(base)
  if (!/:generateContent\/?$/.test(url.pathname)) {
    const path = url.pathname.replace(/\/$/, '').replace(/\/(?:chat\/completions|images\/(?:generations|edits))$/, '').replace(/\/(openai|models)$/, '').replace(/\/v1$/, '/v1beta')
    url.pathname = `${path || '/v1beta'}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`
  }
  return url.href
}
