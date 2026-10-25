/** Stable keyset pagination also handles messages with equal millisecond timestamps. */
export function historyQuery(payload: Record<string, unknown>) {
  const limit = payload.limit === undefined ? 200 : Number(payload.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('历史分页大小无效')
  const query: Record<string, unknown> = {}
  if (payload.before !== undefined) {
    const cursor = payload.before as { id?: unknown; occurredAt?: unknown }
    const time = new Date(String(cursor?.occurredAt ?? ''))
    if (typeof cursor?.id !== 'string' || cursor.id.length > 64 || !cursor.id || !Number.isFinite(time.getTime())) throw new Error('历史游标无效')
    query.$or = [{ occurredAt: { $lt: time } }, { occurredAt: time, id: { $lt: cursor.id } }]
  }
  if (payload.query !== undefined) {
    if (typeof payload.query !== 'string' || payload.query.length > 128) throw new Error('搜索关键词过长')
    const text = payload.query.trim()
    if (text) query.content = { $regex: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
  }
  if (payload.until !== undefined) {
    const date = new Date(String(payload.until))
    if (!Number.isFinite(date.getTime())) throw new Error('历史日期无效')
    query.occurredAt = { $lt: date }
  }
  return { query, limit }
}
