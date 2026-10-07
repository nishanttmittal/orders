/**
 * New Order — one simple screen: customer, then item + quantity lines. Everything else (finish, unit, delivery
 * date, note, money) sits behind "More". Saving also sends one clean line to the staff order group
 * (customer, items, quantities only — never the note, transport or money), unless that is switched off.
 */
import { useState, useRef } from 'react'
import { Button, Card, FieldLabel, TextInput, NumberInput, Select, DateInput, useToast, Toast } from '../../../core/ui'
import { todayStr, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { auth } from '../../../core/db/firebase'
import { FINISHES, UNITS } from '../config'

const blank = () => ({ product: '', finish: '', qty: '', unit: 'Nos' })
const inputCls = 'w-full border-2 border-slate-300 rounded-2xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500'

export default function NewOrder({ owner = false, role = '' }) {
  // Only the owner and the manager may send a line to the staff group or add to the item list. An 'employee'
  // login can still enter orders; those stay in the app. (The laptop job checks the role again before posting.)
  const trusted = owner || role === 'manager'
  const { orders, clients, products, log, allocOrderNo } = useOrders()
  const { msg, show } = useToast()

  const [clientName, setClientName] = useState('')
  const [items, setItems] = useState([blank()])
  const [more, setMore] = useState(false)
  const [orderDate, setOrderDate] = useState(todayStr())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [transport, setTransport] = useState('')
  const [remarks, setRemarks] = useState('')
  const [price, setPrice] = useState('')
  const [advance, setAdvance] = useState('')
  const [toGroup, setToGroup] = useState(true)
  const [saving, setSaving] = useState(false)
  const busyRef = useRef(false)   // synchronous double-tap guard (React state updates too late)

  const setItem = (i, patch) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const addItem = () => setItems([...items, blank()])
  const delItem = (i) => setItems(items.length === 1 ? [blank()] : items.filter((_, idx) => idx !== i))

  const save = async () => {
    if (busyRef.current) return   // block a rapid double-tap from creating two orders
    const cn = clientName.trim()
    if (!cn) return show('Customer ka naam likhein', 2000)
    const cleanItems = items
      .filter(it => it.product.trim() && Number(it.qty) > 0)
      .map(it => ({ product: it.product.trim(), finish: it.finish, qty: Number(it.qty), unit: it.unit || 'Nos', dispatched: 0 }))
    if (cleanItems.length === 0) return show('Item aur quantity likhein', 2500)
    busyRef.current = true
    setSaving(true)
    try {
      const orderNo = await allocOrderNo()
      orders.insert({
        orderNo, orderDate, clientName: cn, deliveryDate, items: cleanItems,
        transport: transport.trim(), remarks: remarks.trim(), status: 'pending',
        price: owner ? Number(price) || 0 : 0, advance: owner ? Number(advance) || 0 : 0,
        createdBy: owner ? 'owner' : role || 'manager', createdByEmail: (auth?.currentUser?.email || '').toLowerCase(), source: 'app',
        mirror: { status: toGroup && trusted ? 'pending' : 'none' },
      })
      if (!clients.list.some(c => c.name.toLowerCase() === cn.toLowerCase())) clients.insert({ name: cn })
      for (const it of trusted ? cleanItems : []) {
        if (!products.list.some(p => (p.name || '').toLowerCase() === it.product.toLowerCase())) products.insert({ name: it.product, order: 999 })
      }
      log('ORDER', `${orderNo} · ${cn} · ${cleanItems.length} item(s)`, owner ? 'owner' : 'manager')
      show(toGroup && trusted ? `${orderNo} saved ✓ — group me ja raha hai` : `${orderNo} saved ✓`, 2500)
      setClientName(''); setItems([blank()]); setDeliveryDate(''); setTransport(''); setRemarks(''); setPrice(''); setAdvance(''); setOrderDate(todayStr()); setToGroup(true)
    } catch {
      show('Save nahi hua, dobara try karein', 2500)
    } finally {
      setTimeout(() => { busyRef.current = false; setSaving(false) }, 700)   // re-enable even if it threw
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />
      <Card className="p-5 space-y-3">
        <FieldLabel>Customer</FieldLabel>
        <input list="ord-clients" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Customer ka naam" className={inputCls} autoComplete="off" />
        <datalist id="ord-clients">{clients.list.map(c => <option key={c.id} value={c.name} />)}</datalist>
      </Card>

      <Card className="p-5 space-y-3">
        <FieldLabel>Item aur quantity</FieldLabel>
        {items.map((it, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex gap-1.5 items-center">
              <div className="flex-1 min-w-0"><input list="ord-products" value={it.product} onChange={e => setItem(i, { product: e.target.value })} placeholder="Item" className={inputCls} autoComplete="off" /></div>
              <div className="w-24 flex-shrink-0"><NumberInput className="text-center !px-2" placeholder="Qty" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} /></div>
              <button onClick={() => delItem(i)} aria-label="Remove item" className="w-10 h-12 rounded-xl bg-red-50 text-red-500 font-bold flex-shrink-0">✕</button>
            </div>
            {more && (
              <div className="flex gap-1.5">
                <Select className="flex-1" value={it.finish} onChange={e => setItem(i, { finish: e.target.value })} options={[{ value: '', label: 'Finish —' }, ...FINISHES.map(f => ({ value: f, label: f }))]} />
                <Select className="w-28" value={it.unit} onChange={e => setItem(i, { unit: e.target.value })} options={UNITS.map(u => ({ value: u, label: u }))} />
              </div>
            )}
          </div>
        ))}
        <datalist id="ord-products">{[...products.list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => <option key={p.id} value={p.name} />)}</datalist>
        <Button variant="neutral" className="w-full" onClick={addItem}>+ Aur item</Button>
      </Card>

      <button onClick={() => setMore(!more)} className="w-full text-sm font-bold text-slate-500 py-1">{more ? '▲ Kam dikhayein' : '▼ More (finish, kg/bag, delivery date, note)'}</button>
      {more && (
        <Card className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Order Date</FieldLabel><DateInput className="mt-1" value={orderDate} onChange={e => setOrderDate(e.target.value)} /></div>
            <div><FieldLabel>Delivery Date</FieldLabel><DateInput className="mt-1" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          </div>
          <div><FieldLabel>Transport</FieldLabel><TextInput className="mt-1" placeholder="Transporter / gaadi" value={transport} onChange={e => setTransport(e.target.value)} /></div>
          <div><FieldLabel>Note (sirf app me — group me nahi jata)</FieldLabel><TextInput className="mt-1" placeholder="Koi baat" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          {owner && (
            <div className="grid grid-cols-2 gap-3 bg-emerald-50 rounded-xl p-3">
              <div><FieldLabel>Price (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} /></div>
              <div><FieldLabel>Advance (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} /></div>
              {(Number(price) > 0 || Number(advance) > 0) && <div className="col-span-2 text-sm font-bold text-emerald-700">Balance: ₹{fmtNum((Number(price) || 0) - (Number(advance) || 0))}</div>}
            </div>
          )}
        </Card>
      )}

      {trusted && <label className="flex items-center gap-3 px-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" className="w-6 h-6" checked={toGroup} onChange={e => setToGroup(e.target.checked)} />
        Order list group me bhi bhejo
      </label>}

      <Button variant="primary" size="lg" className="w-full" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Order'}</Button>
    </div>
  )
}
