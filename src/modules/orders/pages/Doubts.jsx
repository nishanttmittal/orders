/**
 * Doubt — orders that are not clear yet, for the owner and the manager to settle. Two kinds:
 *   • linked to an order already in the book (e.g. "Synchro — quantity nahi likhi"): type the item + quantity and
 *     tap "Order me jodo", or "Kuch nahi" if nothing is to be added.
 *   • a possible new order (from the paper list or the nightly WhatsApp scan): fix the lines and tap
 *     "Order banao" (it is saved like any new order), or "Order nahi hai".
 * Clearing never deletes anything: the doubt is kept with who cleared it and how.
 */
import { useState } from 'react'
import { Button, Card, NumberInput, useToast, Toast } from '../../../core/ui'
import { todayStr, fmtDate } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { auth } from '../../../core/db/firebase'

const inputCls = 'w-full border-2 border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500'
const SRC = { kagaz: 'Kagaz list', whatsapp: 'WhatsApp' }

export default function Doubts({ owner = false, role = '' }) {
  const { doubts, orders, clients, products, log, allocOrderNo } = useOrders()
  const { msg, show } = useToast()
  const [openId, setOpenId] = useState(null)
  const [rows, setRows] = useState([])           // editable lines of the open card
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const by = owner ? 'owner' : role || 'manager'
  const email = (auth?.currentUser?.email || '').toLowerCase()

  const list = [...doubts.list]
    .filter(d => showDone ? d.status === 'cleared' : d.status !== 'cleared')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || (a.customer || '').localeCompare(b.customer || ''))
  const openCount = doubts.list.filter(d => d.status !== 'cleared').length

  const open = (d) => {
    if (openId === d.id) return setOpenId(null)
    setOpenId(d.id)
    const start = (d.lines || []).map(l => ({ product: l.product || '', qty: l.qty ? String(l.qty) : '', unit: l.unit || 'Nos' }))
    setRows(start.length ? start : [{ product: '', qty: '', unit: 'Nos' }])
  }
  const setRow = (i, patch) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const cleanRows = () => rows.filter(r => r.product.trim() && Number(r.qty) > 0).map(r => ({ product: r.product.trim(), finish: '', qty: Number(r.qty), unit: r.unit || 'Nos', dispatched: 0 }))
  const clear = (d, outcome, extra = {}) => {
    doubts.update(d.id, { status: 'cleared', outcome, clearedAt: new Date().toISOString(), clearedBy: by, clearedByEmail: email, ...extra })
    log('DOUBT_CLEAR', `${d.customer} · ${outcome}`, by, d.id)
    setOpenId(null)
  }

  // Add the typed lines to the order this doubt belongs to.
  const addToOrder = (d) => {
    const o = orders.list.find(x => x.id === d.orderId)
    if (!o) return show('Order nahi mila', 2000)
    const add = cleanRows()
    if (!add.length) return show('Item aur quantity likhein', 2000)
    orders.update(o.id, { items: [...(o.items || []), ...add], status: o.status === 'dispatched' ? 'pending' : o.status })
    log('ORDER_ADD_LINE', `${o.orderNo} · ${o.clientName} · ${add.map(a => `${a.product} ${a.qty}`).join(', ')}`, by, o.id)
    clear(d, 'order me joda', { addedLines: add })
    show(`${o.orderNo} me jod diya ✓`)
  }
  // Make a new order from the typed lines (saved exactly like New Order, so its line goes to the order group).
  const makeOrder = async (d) => {
    if (busy) return
    const items = cleanRows()
    if (!items.length) return show('Item aur quantity likhein', 2000)
    setBusy(true)
    try {
      const orderNo = await allocOrderNo()
      const cn = (d.customer || '').trim()
      const row = orders.insert({
        orderNo, orderDate: todayStr(), clientName: cn, deliveryDate: '', items, transport: '', remarks: `Doubt se bana${d.source ? ' (' + (SRC[d.source] || d.source) + ')' : ''}`,
        status: 'pending', price: 0, advance: 0, createdBy: by, createdByEmail: email, source: 'app', mirror: { status: 'pending' },
      })
      if (cn && !clients.list.some(c => (c.name || '').toLowerCase() === cn.toLowerCase())) clients.insert({ name: cn })
      log('ORDER', `${orderNo} · ${cn} · doubt se`, by)
      clear(d, 'order bana', { newOrderId: row?.id || '', newOrderNo: orderNo })
      show(`${orderNo} ban gaya ✓ — order list me jayega`, 2500)
    } catch {
      show('Save nahi hua, dobara try karein', 2500)
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      <Toast msg={msg} />
      <div className="flex gap-2">
        <button onClick={() => { setShowDone(false); setOpenId(null) }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${!showDone ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Clear karna hai ({openCount})</button>
        <button onClick={() => { setShowDone(true); setOpenId(null) }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${showDone ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Ho gaye</button>
      </div>

      {list.length === 0 && <Card className="p-8 text-center text-slate-400">{showDone ? 'Abhi kuch nahi.' : 'Koi doubt nahi 👍'}</Card>}

      {list.map(d => {
        const isOpen = openId === d.id
        const linked = d.orderId ? orders.list.find(x => x.id === d.orderId) : null
        return (
          <Card key={d.id} className="p-4">
            <div className="cursor-pointer" onClick={() => open(d)}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-slate-800">{d.customer}{linked ? <span className="text-xs text-slate-400 font-normal"> {linked.orderNo}</span> : null}</div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0">{SRC[d.source] || d.source || ''}</span>
              </div>
              <div className="text-sm text-slate-700 mt-1">{d.question}</div>
              {d.status === 'cleared' && <div className="text-xs text-emerald-700 font-semibold mt-1">✓ {d.outcome}{d.newOrderNo ? ` ${d.newOrderNo}` : ''} · {d.clearedBy}{d.clearedAt ? ` · ${fmtDate(d.clearedAt)}` : ''}</div>}
            </div>

            {isOpen && d.status !== 'cleared' && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <div className="flex-1 min-w-0"><input list="dbt-products" className={inputCls} placeholder="Item" value={r.product} onChange={e => setRow(i, { product: e.target.value })} autoComplete="off" /></div>
                    <div className="w-24 flex-shrink-0"><NumberInput inputMode="decimal" className="text-center !px-2 !py-2.5 !text-sm" placeholder="Qty" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></div>
                  </div>
                ))}
                <datalist id="dbt-products">{[...products.list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => <option key={p.id} value={p.name} />)}</datalist>
                <button onClick={() => setRows([...rows, { product: '', qty: '', unit: 'Nos' }])} className="text-xs font-bold text-slate-500">+ Aur item</button>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {linked
                    ? <Button variant="primary" onClick={() => addToOrder(d)}>Order me jodo</Button>
                    : <Button variant="primary" disabled={busy} onClick={() => makeOrder(d)}>Order banao</Button>}
                  <Button variant="neutral" onClick={() => clear(d, linked ? 'kuch nahi jodna' : 'order nahi hai')}>{linked ? 'Kuch nahi' : 'Order nahi hai'}</Button>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
