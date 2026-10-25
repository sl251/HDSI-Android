import { mergeMessages, type Message } from '../../packages/contracts'

export const historyPageSize = 50
export const historyCursor = (row: Message) => ({ id: row.id, occurredAt: row.occurredAt })
const compare = (a: Message, b: Message) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Refreshes update receipts while retaining older pages already opened by the reader. */
export function appendHistory(previous: Message[], incoming: Message[]) {
  const rows = new Map(previous.map(row => [row.id, row]))
  for (const row of incoming) rows.set(row.id, row)
  return mergeMessages(previous, [...rows.values()].sort(compare))
}

/** Reconcile missed pushes after backgrounding without silently leaving a gap. */
export async function recentHistory(previous: Message[], read: (before?: ReturnType<typeof historyCursor>) => Promise<Message[]>) {
  let page = await read(), rows = page, pages = 1
  const known = new Set(previous.map(row => row.id)), last = previous.at(-1)
  const gap = () => !!last && !!rows.length && compare(last, rows[0]) < 0 && !rows.some(row => known.has(row.id))
  while (gap() && page.length === historyPageSize && pages < 10) {
    page = await read(historyCursor(rows[0])); rows = [...page, ...rows]; pages++
  }
  // A long absence loads a contiguous recent window; older pages remain available.
  return { rows, replace: gap(), hasOlder: page.length === historyPageSize }
}
