/**
 * Badlav (owner only) — everything the manager changed, newest first, for the owner to check: new orders, quantity
 * sent, corrections to an order (with before → after), lines added, entries taken back, doubts cleared, new names.
 * Read-only. "Naya" marks what was added since the owner last opened this screen (remembered on this phone).
 */
import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../../core/ui'
import { useOrders } from '../OrdersContext'

const LABEL = {
  ORDER: ['Naya order', 'bg-blue-100 text-blue-700'], DISPATCH: ['Maal gaya', 'bg-emerald-100 text-emerald-700'], DISPATCH_ALL: ['Poora order gaya', 'bg-emerald-100 text-emerald-700'],
  DISPATCH_UNDO: ['Gaya-entry hatayi', 'bg-amber-100 text-amber-700'], ORDER_EDIT: ['Order badla', 'bg-amber-100 text-amber-700'], ORDER_ADD_LINE: ['Line jodi', 'bg-amber-100 text-amber-700'],
  DOUBT_CLEAR: ['Doubt clear', 'bg-slate-100 text-slate-600'], GROUP_RESEND: ['Group me dobara bheja', 'bg-slate-100 text-slate-600'],
  ADD_CLIENT: ['Naya customer naam', 'bg-violet-100 text-violet-700'], ADD_PRODUCT: ['Naya item naam', 'bg-violet-100 text-violet-700'], CANCEL_ORDER: ['Order cancel', 'bg-rose-100 text-rose-700'],
}
const SEEN_KEY = 'ord:changesSeenAt'
const when = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) }

export default function Changes() {
  const { logs } = useOrders()
  const [onlyManager, setOnlyManager] = useState(true)
  const [seenAt] = useState(() => { try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* private mode: nothing to remember */ } }, [])

  const list = useMemo(() => [...logs.list]
    .filter(l => LABEL[l.action] && (!onlyManager || (l.by && l.by !== 'owner' && l.by !== 'claude')))
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 300), [logs.list, onlyManager])
  const fresh = list.filter(l => (l.ts || '') > seenAt).length

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setOnlyManager(true)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${onlyManager ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Anshul ji ne kiya</button>
        <button onClick={() => setOnlyManager(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${!onlyManager ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Sab</button>
      </div>
      <div className="text-xs text-slate-500 px-1">{list.length ? `${list.length} entry${fresh ? ` · ${fresh} nayi` : ''}` : ''}</div>
      {list.length === 0 && <Card className="p-8 text-center text-slate-400">Abhi koi badlav nahi.</Card>}
      {list.map(l => {
        const [label, cls] = LABEL[l.action]
        return (
          <Card key={l.id} className={`p-3 ${(l.ts || '') > seenAt ? 'border-2 border-blue-200' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${cls}`}>{label}</span>
              <span className="text-[11px] text-slate-400">{when(l.ts)} · {l.by === 'manager' ? 'Anshul ji' : l.by}</span>
            </div>
            <div className="text-sm text-slate-800 mt-1.5 whitespace-pre-line">{l.detail}</div>
          </Card>
        )
      })}
    </div>
  )
}
