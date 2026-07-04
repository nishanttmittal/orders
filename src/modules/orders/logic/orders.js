/**
 * Orders — pure helpers for status, due-dates, and the owner financial view.
 */
import { todayStr } from '../../../core/utils/format'

const num = (v) => Number(v) || 0
export const itemsQty = (o) => (o.items || []).reduce((s, it) => s + num(it.qty), 0)
export const balance = (o) => num(o.price) - num(o.advance)
export const isOpen = (o) => o.status !== 'dispatched' && o.status !== 'cancelled'

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
