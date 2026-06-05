/**
 * New Order — replaces the paper order slip. Client + dates + product lines
 * (product · finish · qty) + transport + remarks. Owner also enters price &
 * advance (hidden from the production manager).
 */
import { useState } from 'react'
import { Button, Card, FieldLabel, TextInput, NumberInput, Select, DateInput, useToast, Toast } from '../../../core/ui'
import { todayStr, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { FINISHES } from '../config'

const pad = (n) => `UO-${String(n).padStart(4, '0')}`

export default function NewOrder({ owner = false }) {
  const { orders, clients, products, log } = useOrders()
  const { msg, show } = useToast()

  const [orderDate, setOrderDate] = useState(todayStr())
  const [clientName, setClientName] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [items, setItems] = useState([{ product: '', finish: 'Chrome', qty: '' }])
  const [transport, setTransport] = useState('')
  const [remarks, setRemarks] = useState('')
  const [price, setPrice] = useState('')
  const [advance, setAdvance] = useState('')

  const prodOpts = [{ value: '', label: '— product —' }, ...[...products.list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => ({ value: p.name, label: p.name }))]
  const setItem = (i, patch) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const addItem = () => setItems([...items, { product: '', finish: items[items.length - 1]?.finish || 'Chrome', qty: '' }])
  const delItem = (i) => setItems(items.filter((_, idx) => idx !== i))

  const nextNo = () => {
    let max = 0
    for (const o of orders.list) { const m = /(\d+)\s*$/.exec(o.orderNo || ''); if (m) max = Math.max(max, Number(m[1])) }
    return pad(max + 1)
  }

  const save = () => {
    const cn = clientName.trim()
    if (!cn) return show('Enter client name', 2000)
    const cleanItems = items.filter(it => it.product && Number(it.qty) > 0).map(it => ({ product: it.product, finish: it.finish, qty: Number(it.qty) }))
    if (cleanItems.length === 0) return show('Add at least one product + qty', 2500)
    const orderNo = nextNo()
    orders.insert({
      orderNo, orderDate, clientName: cn, deliveryDate, items: cleanItems,
      transport: transport.trim(), remarks: remarks.trim(), status: 'pending',
      price: owner ? Number(price) || 0 : 0, advance: owner ? Number(advance) || 0 : 0,
      createdBy: owner ? 'owner' : 'manager',
    })
    if (cn && !clients.list.some(c => c.name.toLowerCase() === cn.toLowerCase())) clients.insert({ name: cn })
    log('ORDER', `${orderNo} · ${cn} · ${cleanItems.length} item(s)`, owner ? 'owner' : 'manager')
    show(`Order ${orderNo} saved ✓`)
    setClientName(''); setDeliveryDate(''); setItems([{ product: '', finish: 'Chrome', qty: '' }]); setTransport(''); setRemarks(''); setPrice(''); setAdvance('')
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />
      <Card className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Order Date</FieldLabel><DateInput className="mt-1" value={orderDate} onChange={e => setOrderDate(e.target.value)} /></div>
          <div><FieldLabel>Delivery Date</FieldLabel><DateInput className="mt-1" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
        </div>
        <div>
          <FieldLabel>Client</FieldLabel>
          <input list="ord-clients" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name"
            className="mt-1 w-full border-2 border-slate-300 rounded-2xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500" />
          <datalist id="ord-clients">{clients.list.map(c => <option key={c.id} value={c.name} />)}</datalist>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <FieldLabel>Products</FieldLabel>
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <Select className="flex-1" value={it.product} onChange={e => setItem(i, { product: e.target.value })} options={prodOpts} />
            <Select className="w-28" value={it.finish} onChange={e => setItem(i, { finish: e.target.value })} options={FINISHES.map(f => ({ value: f, label: f }))} />
            <NumberInput className="w-20 text-center" placeholder="qty" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
            <button onClick={() => delItem(i)} className="w-9 h-9 rounded-xl bg-red-50 text-red-500 font-bold flex-shrink-0">✕</button>
          </div>
        ))}
        <Button variant="neutral" className="w-full" onClick={addItem}>+ Add product</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div><FieldLabel>Transport</FieldLabel><TextInput className="mt-1" placeholder="Transporter / vehicle" value={transport} onChange={e => setTransport(e.target.value)} /></div>
        <div><FieldLabel>Remarks</FieldLabel><TextInput className="mt-1" placeholder="Any note" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
        {owner && (
          <div className="grid grid-cols-2 gap-3 bg-emerald-50 rounded-xl p-3">
            <div><FieldLabel>Price (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} /></div>
            <div><FieldLabel>Advance (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} /></div>
            {(Number(price) > 0 || Number(advance) > 0) && <div className="col-span-2 text-sm font-bold text-emerald-700">Balance: ₹{fmtNum((Number(price) || 0) - (Number(advance) || 0))}</div>}
          </div>
        )}
      </Card>

      <Button variant="primary" size="lg" className="w-full" onClick={save}>Save Order</Button>
    </div>
  )
}
