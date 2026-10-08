/**
 * Item-wise pending — for planning production. Every item still to go, added up across all open orders, biggest
 * first. Tap an item to see which customers it is for. Read-only; for the owner and the manager.
 * Items are grouped by the exact item name + unit, so "Tilting" and "Tilting Mechanism(Unico)" are two rows:
 * picking the item from the list when entering an order keeps this list clean.
 */
import { useMemo, useState } from 'react'
import { Card, SearchBar } from '../../../core/ui'
import { fmtDate, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { isOpen, lineBalance, lineUnit } from '../logic/orders'
import { useL } from '../i18n'

const qn = (n) => (Number.isInteger(Number(n)) ? fmtNum(n) : String(Math.round(Number(n) * 100) / 100))

export default function ItemWise() {
  const { orders } = useOrders()
  const L = useL()
  const [q, setQ] = useState('')
  const [openKey, setOpenKey] = useState(null)

  const rows = useMemo(() => {
    const map = new Map()
    for (const o of orders.list) {
      if (o.test || !isOpen(o)) continue
      for (const it of o.items || []) {
        const bal = lineBalance(o, it)
        if (!(bal > 0)) continue
        const label = it.finish && !String(it.product || '').toLowerCase().includes(String(it.finish).toLowerCase()) ? `${it.product} ${it.finish}` : String(it.product || '')
        const key = `${label.trim().toLowerCase()}|${lineUnit(it)}`
        if (!map.has(key)) map.set(key, { key, name: label.trim(), unit: lineUnit(it), total: 0, parts: [] })
        const r = map.get(key)
        r.total += bal
        r.parts.push({ client: o.clientName, orderNo: o.orderNo, orderDate: o.orderDate, bal, qty: Number(it.qty) || 0 })
      }
    }
    const term = q.trim().toLowerCase()
    return [...map.values()]
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.parts.some((p) => (p.client || '').toLowerCase().includes(term)))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [orders.list, q])

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder={L('Item or customer…', 'Item ya customer…')} />
      <div className="text-xs text-slate-500 px-1">{rows.length} {L('items pending', 'item baaki')}</div>
      {rows.length === 0 && <Card className="p-8 text-center text-slate-400">{L('Nothing pending.', 'Kuch baaki nahi.')}</Card>}
      {rows.map((r) => {
        const open = openKey === r.key
        return (
          <Card key={r.key} className="p-4">
            <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpenKey(open ? null : r.key)}>
              <div className="min-w-0">
                <div className="font-bold text-slate-800">{r.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{r.parts.length} {L(r.parts.length === 1 ? 'order' : 'orders', 'order')} · {[...new Set(r.parts.map((p) => p.client))].slice(0, 3).join(', ')}{new Set(r.parts.map((p) => p.client)).size > 3 ? '…' : ''}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-amber-700 leading-tight">{qn(r.total)}</div>
                <div className="text-[11px] text-slate-400">{r.unit}</div>
              </div>
            </div>
            {open && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                {[...r.parts].sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || '')).map((p, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-700 min-w-0 truncate"><b>{p.client}</b> <span className="text-xs text-slate-400">{p.orderNo} · {fmtDate(p.orderDate)}</span></span>
                    <span className="font-bold text-slate-700 flex-shrink-0">{qn(p.bal)}{p.bal !== p.qty ? <span className="text-xs text-slate-400 font-normal"> / {qn(p.qty)}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
