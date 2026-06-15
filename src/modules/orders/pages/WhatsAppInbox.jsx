/**
 * WhatsApp Inbox — AI-extracted order suggestions from the WhatsApp bridge land
 * here as a REVIEW QUEUE (collection apps/orders/whatsapp_inbox, status
 * 'pending_review'). Nothing enters the real Order Book until you tap Accept.
 * Accept → creates a normal order + marks the suggestion 'accepted'.
 * Dismiss → marks it 'dismissed' (kept for history, never hard-deleted).
 */
import { useState } from 'react'
import { Button, Card, FieldLabel, Select, NumberInput, useToast, Toast } from '../../../core/ui'
import { useOrders } from '../OrdersContext'
import { FINISHES } from '../config'

const pad = (n) => `UO-${String(n).padStart(4, '0')}`
const firstInt = (s) => { const m = /(\d[\d,]*)/.exec(String(s || '')); return m ? Number(m[1].replace(/,/g, '')) : '' }

export default function WhatsAppInbox({ owner = false }) {
  const { inbox, orders, clients, products, log } = useOrders()
  const { msg, show } = useToast()
  const [edits, setEdits] = useState({}) // id -> {client, product, finish, qty}

  const pending = inbox.list
    .filter((s) => s.status === 'pending_review')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const prodOpts = [
    { value: '', label: '— pick product —' },
    ...[...products.list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => ({ value: p.name, label: p.name })),
  ]

  const draft = (s) => edits[s.id] || {
    client: s.customer || '',
    product: products.list.find((p) => (s.product || '').toLowerCase().includes(p.name.toLowerCase()))?.name || '',
    finish: 'Chrome',
    qty: firstInt(s.quantity),
  }
  const setDraft = (id, patch) => setEdits((e) => ({ ...e, [id]: { ...draft({ id, ...pending.find((x) => x.id === id) }), ...e[id], ...patch } }))

  const nextNo = () => {
    let max = 0
    for (const o of orders.list) { const m = /(\d+)\s*$/.exec(o.orderNo || ''); if (m) max = Math.max(max, Number(m[1])) }
    return pad(max + 1)
  }

  const accept = (s) => {
    const d = draft(s)
    const client = (d.client || '').trim()
    if (!client) return show('Enter client name', 2000)
    if (!d.product) return show('Pick a product', 2000)
    if (!(Number(d.qty) > 0)) return show('Enter quantity', 2000)
    const orderNo = nextNo()
    orders.insert({
      orderNo,
      orderDate: s.date || new Date().toISOString().slice(0, 10),
      clientName: client,
      deliveryDate: '',
      items: [{ product: d.product, finish: d.finish, qty: Number(d.qty) }],
      transport: '',
      remarks: `WhatsApp: "${s.sourceText || ''}"${s.notes ? ' — ' + s.notes : ''}${s.urgent ? ' [URGENT]' : ''}`.trim(),
      status: 'pending',
      price: 0,
      advance: 0,
      createdBy: 'whatsapp',
    })
    if (client && !clients.list.some((c) => c.name.toLowerCase() === client.toLowerCase())) clients.insert({ name: client })
    inbox.update(s.id, { status: 'accepted', orderNo, acceptedAt: new Date().toISOString() })
    log('ORDER', `${orderNo} · ${client} · from WhatsApp`, owner ? 'owner' : 'manager', orderNo)
    show(`Order ${orderNo} created ✓`)
  }

  const dismiss = (s) => {
    inbox.update(s.id, { status: 'dismissed', dismissedAt: new Date().toISOString() })
    show('Dismissed')
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">📥 WhatsApp Inbox</h2>
        <span className="text-sm font-semibold text-slate-500">{pending.length} to review</span>
      </div>

      {pending.length === 0 && (
        <Card className="p-8 text-center text-slate-500">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-semibold">All caught up</div>
          <div className="text-sm mt-1">New WhatsApp orders will appear here for review.</div>
        </Card>
      )}

      {pending.map((s) => {
        const d = draft(s)
        return (
          <Card key={s.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold text-slate-800">{s.customer}</div>
              <div className="flex gap-1">
                {s.urgent && <span className="text-xs font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.5">URGENT</span>}
                {s.rateAsked && <span className="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">RATE?</span>}
              </div>
            </div>
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 italic">
              “{s.sourceText}”{s.notes ? <span className="not-italic text-slate-400"> · {s.notes}</span> : null}
            </div>

            <div>
              <FieldLabel>Client</FieldLabel>
              <input list="wa-clients" value={d.client} onChange={(e) => setDraft(s.id, { client: e.target.value })}
                className="mt-1 w-full border-2 border-slate-300 rounded-2xl px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500" />
              <datalist id="wa-clients">{clients.list.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>

            <div className="flex gap-1.5 items-center">
              <Select className="flex-1" value={d.product} onChange={(e) => setDraft(s.id, { product: e.target.value })} options={prodOpts} />
              <Select className="w-28" value={d.finish} onChange={(e) => setDraft(s.id, { finish: e.target.value })} options={FINISHES.map((f) => ({ value: f, label: f }))} />
              <NumberInput className="w-20 text-center" placeholder="qty" value={d.qty} onChange={(e) => setDraft(s.id, { qty: e.target.value })} />
            </div>
            {!d.product && <div className="text-xs text-amber-600">AI read “{s.product}” · {s.quantity} — pick the matching product above.</div>}

            <div className="flex gap-2 pt-1">
              <Button variant="primary" className="flex-1" onClick={() => accept(s)}>✓ Accept → Order</Button>
              <Button variant="neutral" className="w-28" onClick={() => dismiss(s)}>Dismiss</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
