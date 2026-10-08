/**
 * Logs (owner only) — the full record of what was done in the app, newest first: new orders, dispatch entries,
 * corrections (before → after), entries taken back, lines added, doubts cleared, new names, cancels.
 * Filter by kind, by person, by date (calendar) or search by customer / order number. Read-only.
 * Entries added since the owner last opened this screen are outlined (remembered on this phone).
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, SearchBar } from '../../../core/ui'
import { useOrders } from '../OrdersContext'
import { OWNER_EMAILS } from '../config'
import { useL } from '../i18n'

const KIND = {
  ORDER: ['order', 'New order', 'Naya order', 'bg-blue-100 text-blue-700'],
  DISPATCH: ['dispatch', 'Dispatched', 'Maal gaya', 'bg-emerald-100 text-emerald-700'], DISPATCH_ALL: ['dispatch', 'Whole order dispatched', 'Poora order gaya', 'bg-emerald-100 text-emerald-700'],
  DISPATCH_UNDO: ['change', 'Dispatch entry taken back', 'Gaya-entry hatayi', 'bg-amber-100 text-amber-700'], ORDER_EDIT: ['change', 'Order corrected', 'Order badla', 'bg-amber-100 text-amber-700'],
  ORDER_ADD_LINE: ['change', 'Line added', 'Line jodi', 'bg-amber-100 text-amber-700'], CANCEL_ORDER: ['change', 'Order cancelled', 'Order cancel', 'bg-rose-100 text-rose-700'],
  PAD_CORRECTION: ['change', 'Corrected by Claude', 'Claude ne theek kiya', 'bg-amber-100 text-amber-700'],
  DOUBT_CLEAR: ['other', 'Doubt cleared', 'Doubt clear', 'bg-slate-100 text-slate-600'], GROUP_RESEND: ['other', 'Group line re-sent', 'Group me dobara bheja', 'bg-slate-100 text-slate-600'],
  ADD_CLIENT: ['other', 'New customer name', 'Naya customer naam', 'bg-violet-100 text-violet-700'], ADD_PRODUCT: ['other', 'New item name', 'Naya item naam', 'bg-violet-100 text-violet-700'],
  DEL_PRODUCT: ['change', 'Item name deleted', 'Item naam hataya', 'bg-rose-100 text-rose-700'], DEL_CLIENT: ['change', 'Customer name deleted', 'Customer naam hataya', 'bg-rose-100 text-rose-700'],
  USER_ADD: ['other', 'User added', 'User joda', 'bg-slate-100 text-slate-600'], USER_DEL: ['change', 'User removed', 'User hataya', 'bg-rose-100 text-rose-700'],
}
const SEEN_KEY = 'ord:logsSeenAt'
const OWNERS = OWNER_EMAILS.map((e) => e.toLowerCase())
const dayOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const when = (ts) => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) }

export default function Logs() {
  const { logs, users } = useOrders()
  const L = useL()
  const [kind, setKind] = useState('all')        // all | order | dispatch | change | other
  const [others, setOthers] = useState(false)    // false (default) = show EVERY entry; true = hide the ones recorded under the owner's login
  const [day, setDay] = useState('')             // '' = every day
  const [q, setQ] = useState('')
  const [seenAt] = useState(() => { try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' } })
  useEffect(() => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* private mode */ } }, [])

  const ownerEmails = useMemo(() => [...OWNERS, ...(users?.list || []).filter((u) => u.role === 'owner' && u.active !== false).map((u) => (u.email || '').toLowerCase())], [users?.list])
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...logs.list]
      .filter((l) => KIND[l.action] && (kind === 'all' || KIND[l.action][0] === kind))
      .filter((l) => !others || !(l.byEmail && ownerEmails.includes(l.byEmail)))
      .filter((l) => !day || dayOf(l.ts) === day)
      .filter((l) => !term || String(l.detail || '').toLowerCase().includes(term))
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 400)
  }, [logs.list, kind, others, day, q, ownerEmails])
  // name of the person, from the signed-in email recorded on the entry
  const who = (l) => {
    const byMail = (users?.list || []).find((u) => (u.email || '').toLowerCase() === l.byEmail)?.name
    if (byMail) return byMail
    if (l.byEmail) return ownerEmails.includes(l.byEmail) ? 'Owner' : l.byEmail
    // no email on the entry (older entries): say only what is recorded — the role label — never a person's name
    return l.by ? `${l.by} login` : ''
  }
  const chip = (k, label) => (<button key={k} onClick={() => setKind(k)} className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${kind === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chip('all', L('All', 'Sab'))}{chip('order', L('New orders', 'Naye order'))}{chip('dispatch', L('Dispatch', 'Maal gaya'))}{chip('change', L('Corrections', 'Badlav'))}{chip('other', L('Other', 'Aur'))}
      </div>
      <div className="flex gap-2 items-center">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="flex-1 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white" aria-label="Date" />
        {day && <button onClick={() => setDay('')} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{L('All days', 'Sab din')}</button>}
        <button onClick={() => setOthers(!others)} className={`px-3 py-2 rounded-xl text-xs font-bold ${others ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{others ? L('Mine hidden', 'Mere chhupe hain') : L('Hide mine', 'Mere chhupao')}</button>
      </div>
      <SearchBar value={q} onChange={setQ} placeholder={L('Customer, item or order no…', 'Customer, item ya order no…')} />
      <div className="text-xs text-slate-500 px-1">{list.length} {L('entries', 'entry')}{list.filter((l) => (l.ts || '') > seenAt).length ? ` · ${list.filter((l) => (l.ts || '') > seenAt).length} ${L('new', 'nayi')}` : ''}</div>
      {list.length === 0 && <Card className="p-8 text-center text-slate-400">{L('Nothing here.', 'Yahan kuch nahi.')}</Card>}
      {list.map((l) => {
        const [, en, hi, cls] = KIND[l.action]
        return (
          <Card key={l.id} className={`p-3 ${(l.ts || '') > seenAt ? 'border-2 border-blue-200' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${cls}`}>{L(en, hi)}</span>
              <span className="text-[11px] text-slate-400">{when(l.ts)} · {who(l)}</span>
            </div>
            <div className="text-sm text-slate-800 mt-1.5 whitespace-pre-line">{l.detail}</div>
          </Card>
        )
      })}
    </div>
  )
}
