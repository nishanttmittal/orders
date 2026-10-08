/**
 * Doubt — orders that are not clear yet, for the owner and the manager to settle. Two kinds:
 *   • linked to an order already in the book (e.g. "Synchro — quantity nahi likhi"): type the item + quantity and
 *     tap "UO-00xx me jodo" (the staff group gets an ADD line), or "Jodna nahi hai" if nothing is to be added.
 *   • a possible new order (from the paper list or the nightly WhatsApp scan): fix the lines and tap
 *     "Order banao" (it is saved like any new order), or "Order nahi hai".
 * Clearing never deletes anything: the doubt is kept with who cleared it and how.
 */
import { useState } from 'react'
import { Button, Card, NumberInput, useToast, Toast } from '../../../core/ui'
import { todayStr, fmtDate } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { auth } from '../../../core/db/firebase'
import { groupLine } from '../logic/orders'
import Suggest from '../Suggest'
import { useL } from '../i18n'

const inputCls = 'w-full border-2 border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500'
const SRC = { kagaz: 'Paper list', whatsapp: 'WhatsApp' }

export default function Doubts({ owner = false, role = '' }) {
  const { doubts, orders, clients, products, log, allocOrderNo } = useOrders()
  const { msg, show } = useToast()
  const L = useL()
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
  // null = some row is half filled (item without quantity or the other way round): never dropped quietly
  const cleanRows = () => {
    const used = rows.filter(r => r.product.trim() || String(r.qty).trim())
    if (used.some(r => !r.product.trim() || !(Number(r.qty) > 0))) return null
    return used.map(r => ({ product: r.product.trim(), finish: '', qty: Number(r.qty), unit: r.unit || 'Nos', dispatched: 0 }))
  }
  const clear = async (d, outcome, extra = {}) => {
    await doubts.update(d.id, { status: 'cleared', outcome, clearedAt: new Date().toISOString(), clearedBy: by, clearedByEmail: email, ...extra })
    log('DOUBT_CLEAR', `${d.customer} · ${outcome}`, by, d.id)
    setOpenId(null)
  }

  // Add the typed lines to the order this doubt belongs to — in a transaction on the latest copy of the order,
  // and with a note for the staff group ("ADD · UO-0027 …") so production hears about the extra line too.
  const addToOrder = async (d) => {
    if (busy) return
    const o = orders.list.find(x => x.id === d.orderId)
    if (!o) return show(L('Order not found', 'Order nahi mila'), 2000)
    if (o.status === 'cancelled') return show(L('This order is cancelled — to order again, use New Order', 'Ye order cancel hai — naya order banana ho to New Order se banayein'), 3500)
    const add = cleanRows()
    if (add === null) return show(L('Every line needs both item and quantity', 'Har line me item aur quantity dono likhein'), 2500)
    if (!add.length) return show(L('Enter item and quantity', 'Item aur quantity likhein'), 2000)
    setBusy(true)
    try {
      await orders.change(o.id, (latest) => {
        if (latest.status === 'cancelled') throw new Error('cancelled')
        return {
          items: [...(latest.items || []), ...add], status: latest.status === 'dispatched' ? 'pending' : latest.status,
          groupNotes: [...(latest.groupNotes || []), { id: `n${Date.now()}`, kind: 'ADD', lines: add.map(groupLine), status: 'pending', at: new Date().toISOString(), by: email }],
          notePending: true,
        }
      })
      log('ORDER_ADD_LINE', `${o.orderNo} · ${o.clientName} · ${add.map(a => `${a.product} ${a.qty}`).join(', ')}`, by, o.id)
      await clear(d, 'order me joda', { addedLines: add })   // the card is cleared only after the order really changed
      show(L(`Added to ${o.orderNo} ✓ — the order list will be told too`, `${o.orderNo} me jod diya ✓ — order list me bhi jayega`), 3000)
    } catch (e) {
      show(e?.message === 'cancelled' ? L('This order is cancelled', 'Ye order cancel hai') : L('NOT added — check the internet and try again', 'Jod NAHI paya — internet dekh kar dobara karein'), 3500)
    } finally { setBusy(false) }
  }
  // Make a new order from the typed lines (saved exactly like New Order, so its line goes to the order group).
  const makeOrder = async (d) => {
    if (busy) return
    const items = cleanRows()
    if (items === null) return show(L('Every line needs both item and quantity', 'Har line me item aur quantity dono likhein'), 2500)
    if (!items.length) return show(L('Enter item and quantity', 'Item aur quantity likhein'), 2000)
    setBusy(true)
    try {
      let orderNo
      try { orderNo = await allocOrderNo() } catch { show(L('No internet — order number not created. Tap again.', 'Internet nahi mila — order number nahi bana. Dobara dabayein.'), 4000); return }
      const cn = (d.customer || '').trim()
      const { row } = await orders.insertSafe({
        orderNo, orderDate: todayStr(), clientName: cn, deliveryDate: '', items, transport: '', remarks: `Doubt se bana${d.source ? ' (' + (SRC[d.source] || d.source) + ')' : ''}`,
        status: 'pending', price: 0, advance: 0, createdBy: by, createdByEmail: email, source: 'app', mirror: { status: 'pending' },
      })
      if (cn && !clients.list.some(c => (c.name || '').toLowerCase() === cn.toLowerCase())) clients.insert({ name: cn })
      log('ORDER', `${orderNo} · ${cn} · doubt se`, by)
      await clear(d, 'order bana', { newOrderId: row?.id || '', newOrderNo: orderNo })
      show(L(`${orderNo} created ✓ — going to the order list`, `${orderNo} ban gaya ✓ — order list me jayega`), 2500)
    } catch {
      show(L('NOT saved — try again', 'Save NAHI hua — dobara try karein'), 3000)
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      <Toast msg={msg} />
      <div className="flex gap-2">
        <button onClick={() => { setShowDone(false); setOpenId(null) }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${!showDone ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{L('To settle', 'Clear karna hai')} ({openCount})</button>
        <button onClick={() => { setShowDone(true); setOpenId(null) }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${showDone ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{L('Done', 'Ho gaye')}</button>
      </div>

      {list.length === 0 && <Card className="p-8 text-center text-slate-400">{showDone ? L('Nothing yet.', 'Abhi kuch nahi.') : L('No doubts 👍', 'Koi doubt nahi 👍')}</Card>}

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
              {d.status === 'cleared' && <div className="text-xs text-emerald-700 font-semibold mt-1">✓ {d.outcome}{d.newOrderNo ? ` ${d.newOrderNo}` : ''} · {d.clearedBy}{d.clearedAt ? ` · ${fmtDate(String(d.clearedAt).slice(0, 10))}` : ''}</div>}
            </div>

            {isOpen && d.status !== 'cleared' && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                {linked && <div className="text-xs text-slate-500">{L('In this order now:', 'Is order me abhi:')} {(linked.items || []).map(it => `${it.product} ${it.qty}`).join(' · ')}{linked.status === 'cancelled' ? L(' — ORDER IS CANCELLED', ' — ORDER CANCEL HAI') : ''}</div>}
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <div className="flex-1 min-w-0"><Suggest className={inputCls} placeholder="Item" value={r.product} onChange={v => setRow(i, { product: v })} onPick={p => setRow(i, { product: p.name, unit: p.unit || r.unit || 'Nos' })} options={products.list} /></div>
                    <div className="w-24 flex-shrink-0"><NumberInput inputMode="decimal" className="text-center !px-2 !py-2.5 !text-sm" placeholder="Qty" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} /></div>
                  </div>
                ))}
                <button onClick={() => setRows([...rows, { product: '', qty: '', unit: 'Nos' }])} className="text-xs font-bold text-slate-500">{L('+ Add item', '+ Aur item')}</button>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {linked
                    ? <Button variant="primary" disabled={busy || linked.status === 'cancelled'} onClick={() => addToOrder(d)}>{L(`Add to ${linked.orderNo}`, `${linked.orderNo} me jodo`)}</Button>
                    : <Button variant="primary" disabled={busy} onClick={() => makeOrder(d)}>{L('Make order', 'Order banao')}</Button>}
                  <Button variant="neutral" onClick={() => clear(d, linked ? 'kuch nahi jodna' : 'order nahi hai')}>{linked ? L('Nothing to add', 'Jodna nahi hai') : L('Not an order', 'Order nahi hai')}</Button>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
