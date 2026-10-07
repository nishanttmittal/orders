/**
 * Orders — the order book, kept simple. It opens on what is still to go ("Baaki"). Tap an order to see its lines;
 * on each line enter how much has gone ("Gaya"). The order closes by itself when every line is fully sent —
 * there is no status ladder to maintain by hand. Owner also sees money and can cancel (under "More").
 */
import { useMemo, useState } from 'react'
import { Button, Card, FieldLabel, SearchBar, NumberInput, useToast, Toast } from '../../../core/ui'
import { fmtDate, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { balance, daysToDue, isOverdue, isOpen, lineSent, lineBalance, lineUnit, orderBalance, orderUnit, itemsQty, applyDispatch, dispatchAll } from '../logic/orders'
import { duplicateOrderNos } from '../orderNo'

// What happened to this order's line in the staff order group. `retry` = offer the "Ab bhejo" button.
const MIRROR = {
  pending:   { text: 'Order list me jayega (laptop on hote hi)', cls: 'text-amber-600' },
  queued:    { text: 'Order list me ja raha hai…', cls: 'text-amber-600' },
  sent:      { text: 'Order list me likh diya ✓', cls: 'text-emerald-600' },
  held:      { text: 'Order list me NAHI gaya', cls: 'text-red-600', retry: true },
  failed:    { text: 'Order list me NAHI gaya', cls: 'text-red-600', retry: true },
  uncertain: { text: 'Order list me gaya ya nahi — group me dekh lein', cls: 'text-amber-700', retry: true },
}
// 320 -> "320", 2.5 -> "2.5" (kg lines): never round a real balance down to 0
const qn = (n) => (Number.isInteger(Number(n)) ? fmtNum(n) : String(Math.round(Number(n) * 100) / 100))

export default function Orders({ owner = false, role = '' }) {
  const canPost = owner || role === 'manager'
  const { orders, log } = useOrders()
  const { msg, show } = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('open')
  const [openId, setOpenId] = useState(null)
  const [entry, setEntry] = useState(null)      // { id, line, value } — the "Gaya" box that is open
  const [moreId, setMoreId] = useState(null)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...orders.list]
      .filter(o => !o.test)
      .filter(o => filter === 'all' ? true : filter === 'open' ? isOpen(o) : o.status === 'dispatched')
      .filter(o => !term || (o.clientName || '').toLowerCase().includes(term) || (o.orderNo || '').toLowerCase().includes(term) || (o.items || []).some(it => (it.product || '').toLowerCase().includes(term)))
      .sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [orders.list, q, filter])

  const overdue = orders.list.filter(o => !o.test && isOverdue(o))
  const dupNos = useMemo(() => duplicateOrderNos(orders.list), [orders.list])
  const by = owner ? 'owner' : 'manager'

  const saveGaya = (o, i) => {
    const add = Number(entry?.value)
    if (!(add > 0)) return show('Kitna gaya? Number likhein', 2000)
    const it = o.items[i]
    if (add > lineBalance(o, it)) return show(`Baaki sirf ${qn(lineBalance(o, it))} hai`, 2500)
    const next = applyDispatch(o, i, add)
    orders.update(o.id, { ...next, lastDispatchAt: new Date().toISOString() })
    log('DISPATCH', `${o.orderNo} · ${o.clientName} · ${it.product} +${add} ${lineUnit(it)}`, by, o.id)
    show(next.status === 'dispatched' ? `${o.orderNo} poora gaya ✓` : `${qn(add)} gaya ✓`)
    setEntry(null)
  }
  const allGaya = (o) => {
    if (!confirm(`${o.clientName} ${o.orderNo}: poora order gaya?`)) return
    orders.update(o.id, { ...dispatchAll(o), lastDispatchAt: new Date().toISOString() })
    log('DISPATCH_ALL', `${o.orderNo} · ${o.clientName}`, by, o.id)
    show(`${o.orderNo} poora gaya ✓`)
  }
  // Undo for a wrong tap: put one line back to zero sent (order re-opens).
  const undoLine = (o, i) => {
    if (!confirm('Is line ka "gaya" hata dein?')) return
    const next = applyDispatch(o, i, -lineSent(o, o.items[i]))
    orders.update(o.id, { ...next, status: next.status === 'dispatched' ? 'dispatched' : (o.status === 'dispatched' ? 'pending' : o.status) })
    log('DISPATCH_UNDO', `${o.orderNo} · ${o.items[i].product}`, by, o.id)
  }
  const setMoney = (o, patch) => orders.update(o.id, patch)
  // Send the group line again after a failure / hold (owner or manager). The laptop job picks it up.
  const resend = (o) => {
    orders.update(o.id, { mirror: { status: 'pending', retry: (Number(o.mirror?.retry) || 0) + 1 } })
    log('GROUP_RESEND', `${o.orderNo} · ${o.clientName}`, by, o.id)
    show('Dobara bheja ja raha hai')
  }
  // Cancel (not hard delete): keep the record + number permanently, mark cancelled.
  const cancelOrder = (o) => {
    if (o.status === 'cancelled') return
    const reason = prompt(`Cancel order ${o.orderNo} (${o.clientName})?\nOrder rakha jayega, number dobara use nahi hoga. Reason (optional):`)
    if (reason === null) return
    orders.update(o.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'owner', cancelReason: (reason || '').trim() })
    log('CANCEL_ORDER', `${o.orderNo} · ${o.clientName}${reason ? ' · ' + reason : ''}`, 'owner', o.id)
    show('Order cancelled ✓')
  }

  const chip = (k, label) => (
    <button key={k} onClick={() => setFilter(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${filter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
  )

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />

      {overdue.length > 0 && (
        <Card className="p-4 border border-red-200 bg-red-50">
          <div className="text-sm font-bold text-red-700">⏰ {overdue.length} order late: {overdue.slice(0, 3).map(o => o.clientName).join(', ')}{overdue.length > 3 ? '…' : ''}</div>
        </Card>
      )}
      {dupNos.size > 0 && (
        <Card className="p-4 border border-rose-300 bg-rose-50">
          <div className="text-sm font-semibold text-rose-700">⚠ Order number do baar: {[...dupNos].join(', ')}</div>
        </Card>
      )}

      <div className="flex gap-2">{chip('open', 'Baaki')}{chip('done', 'Gaya')}{chip('all', 'Sab')}</div>
      <SearchBar value={q} onChange={setQ} placeholder="Customer, item ya order no…" />

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">{filter === 'open' ? 'Koi order baaki nahi.' : 'Koi order nahi.'}</Card>
      ) : (
        <div className="space-y-2">
          {list.map(o => {
            const open = openId === o.id; const left = orderBalance(o); const total = itemsQty(o); const d = daysToDue(o)
            const m = MIRROR[o.mirror?.status]
            return (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => { setOpenId(open ? null : o.id); setEntry(null) }}>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{o.clientName} <span className="text-xs text-slate-400 font-normal">{o.orderNo}</span></div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{(o.items || []).map(it => `${it.product}${it.finish && !it.product.toLowerCase().includes(it.finish.toLowerCase()) ? ' ' + it.finish : ''} ${qn(it.qty)}`).join(' · ')}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{fmtDate(o.orderDate)}{o.deliveryDate ? ` · delivery ${fmtDate(o.deliveryDate)}` : ''}{isOverdue(o) ? ` · ${Math.abs(d)} din late` : ''}</div>
                  </div>
                  {o.status === 'cancelled'
                    ? <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-rose-100 text-rose-700 flex-shrink-0">Cancel</span>
                    : left === 0
                      ? <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 flex-shrink-0">Gaya ✓</span>
                      : <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0 text-right">Baaki {qn(left)}{left !== total ? ` / ${qn(total)}` : ''} {orderUnit(o)}</span>}
                </div>

                {open && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    {(o.items || []).map((it, i) => {
                      const sent = lineSent(o, it); const bal = lineBalance(o, it); const editing = entry && entry.id === o.id && entry.line === i
                      return (
                        <div key={i} className="rounded-xl bg-slate-50 p-3">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="font-bold text-slate-800">{it.product} <span className="font-normal text-slate-500">{it.finish}</span></span>
                            <span className="font-bold text-slate-700 flex-shrink-0">{qn(it.qty)} {lineUnit(it)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <span className="text-xs text-slate-500">Gaya {qn(sent)} · <b className={bal ? 'text-amber-700' : 'text-emerald-700'}>Baaki {qn(bal)}</b>{sent > 0 && o.status !== 'cancelled' && <button onClick={() => undoLine(o, i)} className="ml-2 underline text-slate-400">wapas</button>}</span>
                            {o.status !== 'cancelled' && bal > 0 && !editing && (
                              <button onClick={() => setEntry({ id: o.id, line: i, value: String(bal) })} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Maal gaya</button>
                            )}
                          </div>
                          {editing && (
                            <div className="flex gap-2 mt-2 items-center">
                              <NumberInput inputMode="decimal" className="flex-1 text-center !py-2" value={entry.value} onChange={e => setEntry({ ...entry, value: e.target.value })} />
                              <Button size="sm" variant="primary" onClick={() => saveGaya(o, i)}>OK</Button>
                              <Button size="sm" variant="neutral" onClick={() => setEntry(null)}>✕</Button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {o.status !== 'cancelled' && left > 0 && (o.items || []).length > 1 && (
                      <Button variant="neutral" className="w-full" onClick={() => allGaya(o)}>Poora order gaya</Button>
                    )}

                    {m && (
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-xs font-semibold ${m.cls}`}>{m.text}{o.mirror?.why ? ` — ${o.mirror.why}` : ''}</div>
                        {m.retry && canPost && o.status !== 'cancelled' && <button onClick={() => resend(o)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold flex-shrink-0">Ab bhejo</button>}
                      </div>
                    )}
                    {(o.transport || o.remarks) && <div className="text-xs text-slate-500">{o.transport ? `🚚 ${o.transport}` : ''}{o.transport && o.remarks ? ' · ' : ''}{o.remarks}</div>}
                    {o.status === 'cancelled' && <div className="text-xs font-semibold text-rose-600">Cancelled{o.cancelReason ? ` · ${o.cancelReason}` : ''}{o.cancelledAt ? ` · ${fmtDate(o.cancelledAt)}` : ''}</div>}

                    {owner && o.status !== 'cancelled' && (
                      <>
                        <button onClick={() => setMoreId(moreId === o.id ? null : o.id)} className="text-xs font-bold text-slate-400">{moreId === o.id ? '▲ Kam' : '▼ More (paisa, cancel)'}</button>
                        {moreId === o.id && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 bg-emerald-50 rounded-xl p-3">
                              {/* saved when the box is left, not on every keystroke */}
                              <div><FieldLabel>Price ₹</FieldLabel><NumberInput key={`p${o.id}${o.price}`} className="mt-1 !py-2" defaultValue={o.price || ''} onBlur={e => setMoney(o, { price: Number(e.target.value) || 0 })} /></div>
                              <div><FieldLabel>Advance ₹</FieldLabel><NumberInput key={`a${o.id}${o.advance}`} className="mt-1 !py-2" defaultValue={o.advance || ''} onBlur={e => setMoney(o, { advance: Number(e.target.value) || 0 })} /></div>
                              <div className="col-span-2 text-sm font-bold text-emerald-700">Balance: ₹{fmtNum(balance(o))}</div>
                            </div>
                            <Button size="sm" variant="danger" className="w-full" onClick={() => cancelOrder(o)}>Cancel Order</Button>
                          </div>
                        )}
                      </>
                    )}
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
