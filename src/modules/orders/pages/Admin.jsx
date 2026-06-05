/**
 * Admin (owner) — manage product & client masters, back up data, view log.
 */
import { useRef, useState } from 'react'
import { Button, Card, FieldLabel, TextInput, useToast, Toast } from '../../../core/ui'
import { useOrders } from '../OrdersContext'

function ManageList({ title, repo, log, logKey }) {
  const { msg, show } = useToast()
  const [name, setName] = useState('')
  const add = () => {
    const nm = name.trim(); if (!nm) return show('Enter a name', 2000)
    if (repo.list.some(x => x.name.toLowerCase() === nm.toLowerCase())) return show('Already exists', 2000)
    repo.insert({ name: nm, order: repo.list.length }); log(`ADD_${logKey}`, nm, 'owner'); show('Added ✓'); setName('')
  }
  const del = (x) => { if (confirm(`Delete "${x.name}"?`)) { repo.remove(x.id); log(`DEL_${logKey}`, x.name, 'owner') } }
  return (
    <Card className="p-5 space-y-3">
      <Toast msg={msg} />
      <FieldLabel>{title} ({repo.list.length})</FieldLabel>
      <div className="flex gap-2"><TextInput placeholder={`New ${title.toLowerCase()}`} value={name} onChange={e => setName(e.target.value)} /><Button variant="primary" onClick={add}>Add</Button></div>
      <div className="flex flex-wrap gap-2 max-h-44 overflow-auto">
        {[...repo.list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)).map(x => (
          <span key={x.id} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700">{x.name}<button onClick={() => del(x)} className="text-red-500 font-bold">✕</button></span>
        ))}
      </div>
    </Card>
  )
}

function DataTools() {
  const { orders, clients, products, logs, log } = useOrders()
  const { msg, show } = useToast()
  const fileRef = useRef(null)
  const backup = () => {
    const data = { app: 'orders', exportedAt: new Date().toISOString(), orders: orders.list, clients: clients.list, products: products.list, logs: logs.list }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = `orders-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); show('Backup downloaded ✓')
  }
  const restore = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { const data = JSON.parse(await f.text()); if (!confirm('Restore REPLACES all current data. Continue?')) return
      await orders.replaceAll(data.orders || []); await clients.replaceAll(data.clients || []); await products.replaceAll(data.products || [])
      log('RESTORE', f.name, 'owner'); show('Restored ✓')
    } catch { show('Invalid backup', 3000) } finally { if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <Card className="p-5 space-y-3">
      <Toast msg={msg} />
      <FieldLabel>Backup</FieldLabel>
      <div className="grid grid-cols-2 gap-2"><Button variant="primary" onClick={backup}>⬇ Backup</Button><Button variant="neutral" onClick={() => fileRef.current?.click()}>⬆ Restore</Button></div>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={restore} />
    </Card>
  )
}

export default function Admin() {
  const { products, clients, log } = useOrders()
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <ManageList title="Products" repo={products} log={log} logKey="PRODUCT" />
      <ManageList title="Clients" repo={clients} log={log} logKey="CLIENT" />
      <DataTools />
    </div>
  )
}
