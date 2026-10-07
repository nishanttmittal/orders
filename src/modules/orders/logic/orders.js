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
export const orderUnit = (o) => { const u = [...new Set((o.items || []).map(lineUnit))]; return u.length === 1 ? u[0] : 'pcs' }
/** Add `add` to a line's sent quantity (capped at the ordered qty). Returns the new items array + new status. */
export function applyDispatch(o, lineIndex, add) {
  const items = (o.items || []).map((it, i) => {
    if (i !== lineIndex) return { ...it, dispatched: lineSent(o, it) }
    return { ...it, dispatched: Math.max(0, Math.min(num(it.qty), lineSent(o, it) + num(add))) }
  })
  const left = items.reduce((s, it) => s + Math.max(0, num(it.qty) - num(it.dispatched)), 0)
  const status = left === 0 ? 'dispatched' : o.status === 'dispatched' ? 'ready' : o.status
  return { items, status }
}
export const dispatchAll = (o) => ({ items: (o.items || []).map((it) => ({ ...it, dispatched: num(it.qty) })), status: 'dispatched' })
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
