/**
 * Orders — pure helpers for status, due-dates, and the owner financial view.
 */
import { todayStr } from '../../../core/utils/format'

const num = (v) => Number(v) || 0
export const itemsQty = (o) => (o.items || []).reduce((s, it) => s + num(it.qty), 0)
export const balance = (o) => num(o.price) - num(o.advance)
export const isOpen = (o) => o.status !== 'dispatched' && o.status !== 'cancelled'

// ── Closing by quantity (added 08-10-2026) ─────────────────────────────────
/** Quantity already sent on a line. Old orders marked Dispatched (before per-line tracking) count as fully sent. */
export const lineSent = (o, it) => (it.dispatched != null ? Math.min(num(it.dispatched), num(it.qty)) : o.status === 'dispatched' ? num(it.qty) : 0)
export const lineBalance = (o, it) => Math.max(0, num(it.qty) - lineSent(o, it))
export const orderSent = (o) => (o.items || []).reduce((s, it) => s + lineSent(o, it), 0)
export const orderBalance = (o) => (o.items || []).reduce((s, it) => s + lineBalance(o, it), 0)
export const lineUnit = (it) => it.unit || 'Nos'
/** One unit label for a whole order when every line shares it, else 'pcs'. */
export const orderUnit = (o) => { const u = [...new Set((o.items || []).map(lineUnit))]; return u.length === 1 ? u[0] : '' } // '' = mixed units: never add kg to Nos
/** How many lines still have something to go. */
export const linesLeft = (o) => (o.items || []).filter((it) => lineBalance(o, it) > 0).length
/** Add `add` to a line's sent quantity (capped at the ordered qty) and note it in that line's log
 *  ({ at, qty, by }), so "120 on Monday, 80 on Wednesday" can be answered and the last entry undone.
 *  Returns the new items array + new status. Throws a message if more than the balance is entered. */
export function applyDispatch(o, lineIndex, add, by = '') {
  const cur = (o.items || [])[lineIndex]
  if (!cur) throw new Error('Line nahi mili')
  if (!(num(add) > 0)) throw new Error('Kitna gaya? Number likhein')
  if (num(add) > lineBalance(o, cur) + 1e-9) throw new Error(`Baaki sirf ${lineBalance(o, cur)} hai`)
  const items = (o.items || []).map((it, i) => {
    if (i !== lineIndex) return { ...it, dispatched: lineSent(o, it) }
    return { ...it, dispatched: Math.round((lineSent(o, it) + num(add)) * 100) / 100, log: [...(it.log || []), { at: new Date().toISOString(), qty: num(add), by }] }
  })
  const left = items.reduce((s, it) => s + Math.max(0, num(it.qty) - num(it.dispatched)), 0)
  const status = left === 0 ? 'dispatched' : o.status === 'dispatched' ? 'ready' : o.status
  return { items, status }
}
/** Undo the LAST dispatch entry of a line (a wrong tap). Older entries stay. A line with no log (sent before
 *  logging existed, or closed as a whole) goes back to zero. */
export function undoLastDispatch(o, lineIndex) {
  const items = (o.items || []).map((it, i) => {
    if (i !== lineIndex) return { ...it, dispatched: lineSent(o, it) }
    const log = [...(it.log || [])]
    const last = log.pop()
    return { ...it, dispatched: last ? Math.max(0, Math.round((lineSent(o, it) - num(last.qty)) * 100) / 100) : 0, log }
  })
  const left = items.reduce((s, it) => s + Math.max(0, num(it.qty) - num(it.dispatched)), 0)
  return { items, status: left === 0 ? 'dispatched' : o.status === 'dispatched' ? 'pending' : o.status }
}
export const dispatchAll = (o, by = '') => ({ items: (o.items || []).map((it) => { const left = lineBalance(o, it); return { ...it, dispatched: num(it.qty), log: left > 0 ? [...(it.log || []), { at: new Date().toISOString(), qty: left, by }] : it.log || [] } }), status: 'dispatched' })
/** The exact line posted to the staff group for one item: "Tilting Chrome : 320 Nos". */
export const groupLine = (it) => `${it.finish && !String(it.product || '').toLowerCase().includes(String(it.finish).toLowerCase()) ? `${it.product} ${it.finish}` : it.product} : ${num(it.qty)} ${lineUnit(it)}`

/** Days until delivery (negative = overdue). null if no delivery date. */
export function daysToDue(o) {
  if (!o.deliveryDate) return null
  const ms = new Date(o.deliveryDate) - new Date(todayStr())
  return Math.round(ms / 86400000)
}
export const isOverdue = (o) => isOpen(o) && daysToDue(o) != null && daysToDue(o) < 0
export const dueSoon = (o, within = 3) => { const d = daysToDue(o); return isOpen(o) && d != null && d >= 0 && d <= within }

/** Owner money summary across orders (optionally filtered). */
export function financialSummary(orders) {
  let totalValue = 0, advance = 0, outstanding = 0
  for (const o of orders) {
    totalValue += num(o.price)
    advance += num(o.advance)
    if (isOpen(o)) outstanding += balance(o)
  }
  return { totalValue, advance, outstanding }
}

/** Counts by status. */
export function byStatus(orders) {
  const m = { pending: 0, production: 0, ready: 0, dispatched: 0 }
  for (const o of orders) m[o.status] = (m[o.status] || 0) + 1
  return m
}
