import type { ModelOptions, ModelProvider } from '../packages/contracts'
import { stickerVisionProviders } from './mobile-config'
import type { ModelConfig, ProviderConfig } from '../upstream/hds-interlude/src/narrator'
import { mobileRetryFilter } from './model-retry'

type Input = { providers?: (ModelProvider & { mode?: ProviderConfig['mode'] })[]; modelOptions?: Partial<ModelOptions>; endpoint: string; model: string; apiKey?: string }
export function mobileModelConfig(input: Input): Partial<ModelConfig> & { providers: ProviderConfig[] } {
  const rows: NonNullable<Input['providers']> = input.providers ?? [{ id: 'legacy-primary', preset: 'custom', credentialPresent: !!input.apiKey, label: '原有模型连接', endpoint: input.endpoint, model: input.model, protocol: 'chat-completions', apiKey: input.apiKey ?? '', enabled: true, useForMain: true, useForCompaction: true, useForAlter: true }]
  if (!rows.length || rows.length > 12) throw new Error('Expected 1–12 model connections')
  const providers = rows.map(row => {
    if (!['unknown', 'supported', 'unsupported'].includes(row.imageInput ?? 'unknown')) throw new Error('图片能力声明无效')
    const url = new URL(row.endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !row.model) throw new Error('Invalid model connection')
    return { temperature: 0.8, topP: 1, maxTokens: 4096, timeout: 60000, responseFormat: 'json-object', extraHeaders: '', extraBody: '', mode: 'openai-compatible', ...row, protocol: row.protocol ?? 'chat-completions' } as ProviderConfig
  })
  for (const role of ['useForMain', 'useForCompaction', 'useForAlter'] as const) {
    if (!providers.some(row => row.enabled && row[role])) throw new Error(`No enabled connection assigned to ${role}`)
  }
  const options = input.modelOptions ?? {}
  const integer = (value: number | undefined, fallback: number, min: number, max: number) => {
    const result = value ?? fallback
    if (!Number.isInteger(result) || result < min || result > max) throw new Error('模型重试或期限设置超出范围')
    return result
  }
  const maxAttemptsPerProvider = integer(options.maxAttemptsPerProvider, 2, 1, 3)
  if (options.mainStreamingMode === 'experimental' && options.mainResponseFormat === 'prompt-only') throw new Error('Streaming requires JSON mode')
  const visionId = options.visionProviderId || ''
  if (options.visionEnabled && visionId && !providers.some(row => row.id === visionId && row.enabled)) throw new Error('识图连接已移除或停用，请重新选择')
  return {
    providers: stickerVisionProviders(providers.map(row => ({ ...row, useForVision: !!visionId && row.id === visionId })), options),
    vision: { enabled: options.visionEnabled === true, mode: visionId ? 'sidecar' : 'native', detail: 'auto', maxImageDimension: 1024 },
    mainTemperature: options.mainTemperature ?? 0.8,
    mainMaxTokens: options.mainMaxTokens ?? 4096,
    mainTimeout: options.mainTimeout ?? 90000,
    mobileTurnDeadlineMs: integer(options.mobileTurnDeadlineMs, 240_000, 60_000, 600_000),
    mobileRetryFilter: mobileRetryFilter(maxAttemptsPerProvider),
    mainStreamingMode: options.mainStreamingMode ?? 'off',
    mainResponseFormat: options.mainResponseFormat ?? 'json-object',
    mainPayloadOrder: options.mainPayloadOrder ?? 'cache-first',
    failover: { enabled: options.failoverEnabled ?? false, strategy: options.failoverStrategy ?? 'priority', maxAttemptsPerProvider, cooldownMinutes: integer(options.cooldownMinutes, 5, 0, 60) },
  }
}
