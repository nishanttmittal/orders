/**
 * New Order — one simple screen: customer, then item + quantity lines. The few extras (kg/bag, delivery date,
 * note, money, and the switch for the group line) sit behind "Aur". Saving sends one clean line to the staff order
 * group (customer, items, quantities only — never the note or money) unless that switch is turned off.
 * Finish is part of the item name ("Beta chrome"), the way the order group already writes it.
 */
import { useState, useRef } from 'react'
import { Button, Card, FieldLabel, TextInput, NumberInput, Select, DateInput, useToast, Toast } from '../../../core/ui'
import { todayStr, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { auth } from '../../../core/db/firebase'
import { UNITS } from '../config'
import Suggest from '../Suggest'
import { useL } from '../i18n'

const blank = () => ({ product: '', qty: '', unit: 'Nos' })
const inputCls = 'w-full border-2 border-slate-300 rounded-2xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500'

export default function NewOrder({ owner = false, role = '' }) {
  // Only the owner and the manager may send a line to the staff group or add to the item list. An 'employee'
  // login can still enter orders; those stay in the app. (The laptop job checks the role again before posting.)
  const trusted = owner || role === 'manager'
  const { orders, clients, products, log, allocOrderNo } = useOrders()
  const { msg, show } = useToast()
  const L = useL()

  const [clientName, setClientName] = useState('')
  const [items, setItems] = useState([blank()])
  const [more, setMore] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
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
    if (!cn) return show(L('Enter the customer name', 'Customer ka naam likhein'), 2000)
    // A row with an item but no quantity (or the other way round) is a mistake, never something to drop quietly.
    const used = items.filter(it => it.product.trim() || String(it.qty).trim())
    if (used.some(it => !it.product.trim() || !(Number(it.qty) > 0))) return show(L('Every line needs both item and quantity', 'Har line me item aur quantity dono likhein'), 2500)
    const cleanItems = used.map(it => ({ product: it.product.trim(), finish: '', qty: Number(it.qty), unit: it.unit || 'Nos', dispatched: 0 }))
    if (cleanItems.length === 0) return show(L('Enter item and quantity', 'Item aur quantity likhein'), 2500)
    busyRef.current = true
    setSaving(true)
    try {
      let orderNo
      try { orderNo = await allocOrderNo() } catch { show(L('No internet — order number not created. Check the network and tap Save again (your entry is still here).', 'Internet nahi mila — order number nahi bana. Net dekh kar dobara Save dabayein (likha hua yahin hai).'), 4500); return }
      const { where } = await orders.insertSafe({
        orderNo, orderDate: todayStr(), clientName: cn, deliveryDate, items: cleanItems,
        transport: '', remarks: remarks.trim(), status: 'pending',
        price: owner ? Number(price) || 0 : 0, advance: owner ? Number(advance) || 0 : 0,
        createdBy: owner ? 'owner' : role || 'manager', createdByEmail: (auth?.currentUser?.email || '').toLowerCase(), source: 'app',
        mirror: { status: toGroup && trusted ? 'pending' : 'none' },
      })
      // only now is the order really stored (in the cloud, or on this phone waiting for the network)
      // From here on a failure must never read as "NOT saved" (a second tap would make a second order).
      const who = owner ? 'owner' : role || 'manager'
      try {
        log('ORDER', `${orderNo} · ${cn}\n${cleanItems.map(it => `${it.product} ${it.qty} ${it.unit}`).join('\n')}`, who)
        if (!clients.list.some(c => (c.name || '').toLowerCase() === cn.toLowerCase())) Promise.resolve(clients.insertSafe({ name: cn })).then(() => log('ADD_CLIENT', cn, who)).catch(() => {})
        for (const it of trusted ? cleanItems : []) {
          if (!products.list.some(p => (p.name || '').toLowerCase() === it.product.toLowerCase())) Promise.resolve(products.insertSafe({ name: it.product, order: 999, unit: it.unit })).then(() => log('ADD_PRODUCT', it.product, who)).catch(() => {})
        }
      } catch { /* the order itself is saved */ }
      show(where === 'cloud' ? (toGroup && trusted ? L(`${orderNo} saved ✓ — going to the order list`, `${orderNo} save ✓ — order list me jayega`) : L(`${orderNo} saved ✓`, `${orderNo} save ✓`)) : L(`${orderNo} saved on this phone — will upload when the network is back`, `${orderNo} phone me save — net aate hi upar jayega`), 3000)
      setClientName(''); setItems([blank()]); setDeliveryDate(''); setRemarks(''); setPrice(''); setAdvance(''); setToGroup(true)
    } catch {
      show(L('NOT saved — tap Save again (your entry is still here)', 'Save NAHI hua — dobara Save dabayein (likha hua yahin hai)'), 4000)
    } finally {
      setTimeout(() => { busyRef.current = false; setSaving(false) }, 700)   // re-enable even if it threw
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />
      <Card className="p-5 space-y-3">
        <FieldLabel>{L('Customer', 'Customer')}</FieldLabel>
        <Suggest value={clientName} onChange={setClientName} options={clients.list} placeholder={L('Customer name', 'Customer ka naam')} className={inputCls} />
      </Card>

      <Card className="p-5 space-y-3">
        <FieldLabel>{L('Item and quantity', 'Item aur quantity')}</FieldLabel>
        {items.map((it, i) => (
          <div key={i} className={`space-y-1.5 ${i > 0 ? 'pt-3 border-t border-slate-100' : ''}`}>
            {/* item on its own full-width row so long names and the suggestion list are readable; quantity below */}
            <Suggest value={it.product} onChange={v => setItem(i, { product: v })} onPick={p => setItem(i, { product: p.name, unit: p.unit || 'Nos' })} options={products.list} placeholder={`Item ${items.length > 1 ? i + 1 : ''}`.trim()} className={inputCls} />
            <div className="flex gap-2 items-center">
              <div className="w-36 flex-shrink-0"><NumberInput inputMode="decimal" className="text-center !px-2" placeholder="Qty" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} /></div>
              <span className={`text-sm font-bold flex-1 ${it.unit && it.unit !== 'Nos' ? 'text-amber-700' : 'text-slate-400'}`}>{it.unit || 'Nos'}</span>
              {(items.length > 1 || it.product || it.qty) && <button onClick={() => delItem(i)} aria-label="Remove item" className="w-11 h-11 rounded-xl bg-red-50 text-red-500 font-bold flex-shrink-0">✕</button>}
            </div>
            {more && (
              <Select className="w-32" value={it.unit} onChange={e => setItem(i, { unit: e.target.value })} options={UNITS.map(u => ({ value: u, label: u }))} />
            )}
          </div>
        ))}
        <Button variant="neutral" className="w-full" onClick={addItem}>{L('+ Add item', '+ Aur item')}</Button>
      </Card>

      <button onClick={() => setMore(!more)} className="w-full text-sm font-bold text-slate-500 py-1">{more ? L('▲ Show less', '▲ Kam dikhayein') : L('▼ More — kg/bag, delivery date, note', '▼ Aur — kg/bag, delivery, note')}</button>
      {more && (
        <Card className="p-5 space-y-3">
          <div><FieldLabel>{L('Delivery date', 'Delivery date')}</FieldLabel><DateInput className="mt-1" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          <div><FieldLabel>{L('Note (app only — never sent to the group)', 'Note (sirf app me — group me nahi jata)')}</FieldLabel><TextInput className="mt-1" placeholder={L('Any note', 'Koi baat')} value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          {owner && (
            <div className="grid grid-cols-2 gap-3 bg-emerald-50 rounded-xl p-3">
              <div><FieldLabel>Price (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} /></div>
              <div><FieldLabel>Advance (₹)</FieldLabel><NumberInput className="mt-1" placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} /></div>
              {(Number(price) > 0 || Number(advance) > 0) && <div className="col-span-2 text-sm font-bold text-emerald-700">Balance: ₹{fmtNum((Number(price) || 0) - (Number(advance) || 0))}</div>}
            </div>
          )}
          {trusted && (
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" className="w-6 h-6" checked={toGroup} onChange={e => setToGroup(e.target.checked)} />
              {L('Send to the order list group', 'Order list group me bhejo')}
            </label>
          )}
        </Card>
      )}

      <Button variant="primary" size="lg" className="w-full" onClick={save} disabled={saving}>{saving ? L('Saving…', 'Save ho raha hai…') : L('Save order', 'Order save')}</Button>
    </div>
  )
}
