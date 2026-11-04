import type { MediaJob } from '../../packages/contracts'

export const mediaPhaseNames: Record<string, string> = { prepare: '准备图片', submit: '等待生图服务', poll: '等待生成结果', download: '下载图片', save: '保存图片', deliver: '发送图片' }
export function mediaRetryLabel(job: MediaJob) {
  if (job.retryMode === 'none' || job.status === 'unknown' || job.delivered) return ''
  if (job.retryMode === 'deliver' || job.status === 'ready' && job.error) return '重新发送图片'
  if (job.retryMode === 'retrieve' || job.imageUrl) return job.phase === 'save' ? '重新保存图片' : '重新获取图片'
  return job.status === 'failed' && !job.providerTaskId ? '重试生图' : ''
}
export function mediaJobSummary(job: MediaJob) {
  if (job.status === 'unknown') return '提交结果待确认'
  if (job.error || job.status === 'failed') return job.imageId ? '图片已生成，发送未完成' : `${mediaPhaseNames[job.phase ?? 'submit'] ?? '图片处理'}未完成`
  if (job.status === 'ready') return job.delivered ? '图片已完成' : '正在发送图片'
  return job.status === 'queued' ? '图片正在排队' : mediaPhaseNames[job.phase ?? 'submit'] ?? '正在生成图片'
}
