/**
 * Order-number helper. The order number (UO-0001) is a human-facing LABEL only —
 * each order's Firestore doc id is a separate unique id, so a duplicate label never
 * overwrites or loses an order. This keeps labels tidy and lets the list flag any
 * rare collision (two people creating an order offline / at the same instant).
 */

export const padOrderNo = (n) => `UO-${String(n).padStart(4, '0')}`

// Highest numeric suffix currently in the (locally-synced) order list.
const maxOrderNo = (list) => {
  let max = 0
  for (const o of (list || [])) {
    const m = /(\d+)\s*$/.exec(o?.orderNo || '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

// Next FREE order number: max+1, then skip any label already taken locally
// (handles gaps, manual edits, or a synced duplicate). Offline-safe. It cannot
// prevent a true two-device race — neither device sees the other's unsynced
// order — but duplicateOrderNos() flags those in the list so they're fixable.
export function nextOrderNo(list) {
  const taken = new Set((list || []).map((o) => (o?.orderNo || '').trim()))
  let n = maxOrderNo(list) + 1
  while (taken.has(padOrderNo(n))) n++
  return padOrderNo(n)
}

// Set of order numbers used by more than one order (post-sync collision detector).
export function duplicateOrderNos(list) {
  const counts = {}
  for (const o of (list || [])) {
    const no = (o?.orderNo || '').trim()
    if (no) counts[no] = (counts[no] || 0) + 1
  }
  return new Set(Object.keys(counts).filter((no) => counts[no] > 1))
}
