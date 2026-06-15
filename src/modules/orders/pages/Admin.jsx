/**
 * Admin (owner) — manage product & client masters, back up data, view log.
 */
import { useRef, useState } from 'react'
import { Button, Card, FieldLabel, TextInput, Select, useToast, Toast } from '../../../core/ui'
import { useOrders } from '../OrdersContext'
import { OWNER_EMAILS } from '../config'

const ROLE_OPTS = [
  { value: 'employee', label: 'Employee (entry only)' },
  { value: 'manager', label: 'Manager' },
  { value: 'owner', label: 'Owner (full)' },
]

/* Users & Access — who can sign in, and what they can do. Owner-only page. */
function ManageUsers() {
  const { users, log } = useOrders()
  const { msg, show } = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('employee')

  const add = () => {
    const e = email.trim().toLowerCase()
    if (!e.includes('@')) return show('Enter a valid Google email', 2000)
    if (users.list.some((u) => (u.email || '').toLowerCase() === e)) return show('Already added', 2000)
    users.insert({ id: e, email: e, name: name.trim(), role, active: true })
    log('USER_ADD', `${e} as ${role}`, 'owner'); show('User added ✓'); setEmail(''); setName('')
  }
  const toggle = (u) => { const on = u.active !== false; users.update(u.id, { active: !on }); log(on ? 'USER_OFF' : 'USER_ON', u.email, 'owner') }
  const setRoleFor = (u, r) => { users.update(u.id, { role: r }); log('USER_ROLE', `${u.email} -> ${r}`, 'owner') }
  const remove = (u) => { if (confirm(`Remove ${u.email}? They lose access.`)) { users.remove(u.id); log('USER_DEL', u.email, 'owner') } }

  return (
    <Card className="p-5 space-y-3">
      <Toast msg={msg} />
      <FieldLabel>Users &amp; Access ({users.list.length})</FieldLabel>
      <p className="text-xs text-slate-400 -mt-1">Everyone signs in with their Google account. Add their Google email and pick a role. Employees can only enter orders.</p>
      <TextInput placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex gap-2">
        <TextInput className="flex-1" placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Select className="w-44" value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTS} />
      </div>
      <Button variant="primary" className="w-full" onClick={add}>+ Add user</Button>
      <div className="space-y-2 max-h-72 overflow-auto pt-1">
        {users.list.length === 0 && <p className="text-sm text-slate-400">No users added yet. You ({OWNER_EMAILS[0]}) always have owner access.</p>}
        {[...users.list].sort((a, b) => (a.email || '').localeCompare(b.email || '')).map((u) => (
          <div key={u.id} className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold truncate ${u.active === false ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{u.name || u.email}</div>
              <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
            </div>
            <Select className="w-36" value={u.role || 'employee'} onChange={(e) => setRoleFor(u, e.target.value)} options={ROLE_OPTS} />
            <button onClick={() => toggle(u)} className={`text-xs font-bold px-2 py-1 rounded-lg ${u.active === false ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>{u.active === false ? 'Off' : 'On'}</button>
            <button onClick={() => remove(u)} className="text-red-500 font-bold px-1">✕</button>
          </div>
        ))}
      </div>
    </Card>
  )
}

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
      <ManageUsers />
      <ManageList title="Products" repo={products} log={log} logKey="PRODUCT" />
      <ManageList title="Clients" repo={clients} log={log} logKey="CLIENT" />
      <DataTools />
    </div>
  )
}
