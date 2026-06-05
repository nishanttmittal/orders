/**
 * Orders — the order book. Manager's planning view: every order with status,
 * delivery date, and overdue/due-soon flags up top. Tap an order to see details
 * and change status. Owner also sees price/advance/balance and can edit/delete.
 */
import { useMemo, useState } from 'react'
import { Button, Card, FieldLabel, SearchBar, NumberInput, useToast, Toast } from '../../../core/ui'
import { fmtDate, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { STATUSES, statusMeta } from '../config'
import { itemsQty, balance, daysToDue, isOverdue, dueSoon } from '../logic/orders'

export default function Orders({ owner = false }) {
  const { orders, log } = useOrders()
  const { msg, show } = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('open')
  const [openId, setOpenId] = useState(null)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...orders.list]
      .filter(o => filter === 'all' ? true : filter === 'open' ? o.status !== 'dispatched' : o.status === filter)
      .filter(o => !term || (o.clientName || '').toLowerCase().includes(term) || (o.orderNo || '').toLowerCase().includes(term))
      .sort((a, b) => {
        const da = a.deliveryDate || '9999', db = b.deliveryDate || '9999'
        return da.localeCompare(db) || (b.createdAt || '').localeCompare(a.createdAt || '')
      })
  }, [orders.list, q, filter])

  const overdue = orders.list.filter(isOverdue)
  const soon = orders.list.filter(o => dueSoon(o, 3))

  const setStatus = (o, status) => {
    orders.update(o.id, { status })
    log('STATUS', `${o.orderNo} · ${o.clientName} → ${statusMeta(status).label}`, owner ? 'owner' : 'manager', o.id)
    show(`${o.orderNo} → ${statusMeta(status).label}`)
  }
  const setMoney = (o, patch) => orders.update(o.id, patch)
  const del = (o) => { if (confirm(`Delete order ${o.orderNo} (${o.clientName})?`)) { orders.remove(o.id); log('DELETE_ORDER', `${o.orderNo} · ${o.clientName}`, 'owner', o.id); show('Deleted ✓') } }

  const FilterChip = ({ k, label }) => (
    <button onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap ${filter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
  )

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />

      {(overdue.length > 0 || soon.length > 0) && (
        <Card className="p-4 border border-red-200 bg-red-50">
          <FieldLabel className="text-red-600">⏰ Delivery Alerts</FieldLabel>
          <div className="mt-2 text-sm font-semibold">
            {overdue.length > 0 && <div className="text-red-700">{overdue.length} OVERDUE: {overdue.slice(0, 3).map(o => o.clientName).join(', ')}{overdue.length > 3 ? '…' : ''}</div>}
            {soon.length > 0 && <div className="text-amber-700">{soon.length} due in 3 days: {soon.slice(0, 3).map(o => o.clientName).join(', ')}{soon.length > 3 ? '…' : ''}</div>}
          </div>
        </Card>
      )}

      <SearchBar value={q} onChange={setQ} placeholder="Search client or order no…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip k="open" label="Open" /><FilterChip k="pending" label="Pending" /><FilterChip k="production" label="In Production" />
        <FilterChip k="ready" label="Ready" /><FilterChip k="dispatched" label="Dispatched" /><FilterChip k="all" label="All" />
      </div>

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No orders.</Card>
      ) : (
        <div className="space-y-2">
          {list.map(o => {
            const sm = statusMeta(o.status); const d = daysToDue(o); const open = openId === o.id
            return (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setOpenId(open ? null : o.id)}>
                  <div>
                    <div className="font-bold text-slate-800">{o.clientName} <span className="text-xs text-slate-400 font-normal">{o.orderNo}</span></div>
                    <div className="text-xs text-slate-500 mt-0.5">{itemsQty(o)} pcs · {(o.items || []).length} item(s){o.deliveryDate ? ` · due ${fmtDate(o.deliveryDate)}` : ''}</div>
                    {isOverdue(o) && <div className="text-xs font-bold text-red-600 mt-0.5">OVERDUE by {Math.abs(d)}d</div>}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${sm.color}`}>{sm.label}</span>
                </div>

                {open && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="space-y-1">
                      {(o.items || []).map((it, i) => (
                        <div key={i} className="flex justify-between text-sm"><span className="font-semibold text-slate-700">{it.product} <span className="text-slate-400">{it.finish}</span></span><span className="font-mono text-slate-600">{fmtNum(it.qty)}</span></div>
                      ))}
                    </div>
                    {(o.transport || o.remarks) && <div className="text-xs text-slate-400">{o.transport ? `🚚 ${o.transport}` : ''}{o.transport && o.remarks ? ' · ' : ''}{o.remarks}</div>}

                    <div>
                      <FieldLabel>Status</FieldLabel>
                      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                        {STATUSES.map(s => (
                          <button key={s.key} onClick={() => setStatus(o, s.key)} className={`py-2 rounded-lg text-[11px] font-bold ${o.status === s.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{s.label}</button>
                        ))}
                      </div>
                    </div>

                    {owner && (
                      <div className="grid grid-cols-2 gap-2 bg-emerald-50 rounded-xl p-3">
                        <div><FieldLabel>Price ₹</FieldLabel><NumberInput className="mt-1 !py-2" value={o.price || ''} onChange={e => setMoney(o, { price: Number(e.target.value) || 0 })} /></div>
                        <div><FieldLabel>Advance ₹</FieldLabel><NumberInput className="mt-1 !py-2" value={o.advance || ''} onChange={e => setMoney(o, { advance: Number(e.target.value) || 0 })} /></div>
                        <div className="col-span-2 text-sm font-bold text-emerald-700">Balance: ₹{fmtNum(balance(o))}</div>
                      </div>
                    )}
                    {owner && <Button size="sm" variant="danger" className="w-full" onClick={() => del(o)}>Delete Order</Button>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
