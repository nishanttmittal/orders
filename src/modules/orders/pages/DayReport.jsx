/**
 * Day Report (owner) — one screen for the end of the day:
 *   1. numbers at the top (new orders, dispatch entries, corrections, doubts cleared)
 *   2. what was dispatched that day, customer by customer, item by item
 *   3. new orders entered that day
 *   4. every change made (corrections with before → after, entries taken back, lines added, new names)
 * Pick any day with ‹ ›. Read-only. Whose entry it is comes from the signed-in email stored with the entry.
 */
import { useMemo, useState } from 'react'
import { Card } from '../../../core/ui'
import { fmtNum, todayStr } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { OWNER_EMAILS } from '../config'
import { lineUnit } from '../logic/orders'
import { useL } from '../i18n'

const OWNERS = OWNER_EMAILS.map((e) => e.toLowerCase())
const qn = (n) => (Number.isInteger(Number(n)) ? fmtNum(n) : String(Math.round(Number(n) * 100) / 100))
// the phone's own calendar day of an ISO timestamp
const dayOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const timeOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
const shift = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const nice = (day) => new Date(day + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })

const CHANGE = {
  ORDER_EDIT: ['Order corrected', 'Order badla', 'bg-amber-100 text-amber-700'], DISPATCH_UNDO: ['Dispatch entry taken back', 'Gaya-entry hatayi', 'bg-amber-100 text-amber-700'],
  ORDER_ADD_LINE: ['Line added', 'Line jodi', 'bg-amber-100 text-amber-700'], CANCEL_ORDER: ['Order cancelled', 'Order cancel', 'bg-rose-100 text-rose-700'],
  DOUBT_CLEAR: ['Doubt cleared', 'Doubt clear', 'bg-slate-100 text-slate-600'], ADD_CLIENT: ['New customer name', 'Naya customer naam', 'bg-violet-100 text-violet-700'],
  ADD_PRODUCT: ['New item name', 'Naya item naam', 'bg-violet-100 text-violet-700'], GROUP_RESEND: ['Group line re-sent', 'Group me dobara bheja', 'bg-slate-100 text-slate-600'],
}

export default function DayReport() {
  const { orders, logs, users } = useOrders()
  const L = useL()
  const [day, setDay] = useState(todayStr())
  const [mine, setMine] = useState(false)   // false = everyone except the owner (what the owner wants to check)

  const ownerEmails = useMemo(() => [...OWNERS, ...(users?.list || []).filter((u) => u.role === 'owner' && u.active !== false).map((u) => (u.email || '').toLowerCase())], [users?.list])
  const isOwner = (l) => !!l.byEmail && ownerEmails.includes(l.byEmail)
  const who = (l) => (users?.list || []).find((u) => (u.email || '').toLowerCase() === l.byEmail)?.name || (isOwner(l) ? 'Owner' : l.byEmail || l.by || '')

  // 2) dispatch of the day, from each line's own dispatch log
  const dispatch = useMemo(() => {
    const byClient = new Map()
    for (const o of orders.list) {
      if (o.test) continue
      for (const it of o.items || []) {
        for (const e of it.log || []) {
          if (dayOf(e.at) !== day) continue
          if (!byClient.has(o.clientName)) byClient.set(o.clientName, { client: o.clientName, lines: [], total: 0 })
          const c = byClient.get(o.clientName)
          const label = it.finish && !String(it.product || '').toLowerCase().includes(String(it.finish).toLowerCase()) ? `${it.product} ${it.finish}` : it.product
          c.lines.push({ item: label, qty: Number(e.qty) || 0, unit: lineUnit(it), orderNo: o.orderNo, at: e.at, closed: o.status === 'dispatched' })
          c.total += Number(e.qty) || 0
        }
      }
    }
    return [...byClient.values()].sort((a, b) => b.total - a.total)
  }, [orders.list, day])
  const maxTotal = Math.max(1, ...dispatch.map((c) => c.total))

  const dayLogs = useMemo(() => logs.list.filter((l) => dayOf(l.ts) === day).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')), [logs.list, day])
  const newOrders = useMemo(() => orders.list.filter((o) => !o.test && dayOf(o.createdAt) === day && o.source !== 'pad-2026-10-07').sort((a, b) => (a.orderNo || '').localeCompare(b.orderNo || '')), [orders.list, day])
  const changes = dayLogs.filter((l) => CHANGE[l.action] && (mine || !isOwner(l)))
  const count = (a) => dayLogs.filter((l) => l.action === a).length
  const stat = (n, label, tone) => (<div className={`flex-1 rounded-2xl px-2 py-3 text-center ${tone}`}><div className="text-2xl font-bold leading-none">{n}</div><div className="text-[11px] font-semibold mt-1 leading-tight">{label}</div></div>)

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDay(shift(day, -1))} className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 text-xl font-bold">‹</button>
        <div className="text-center"><div className="font-bold text-slate-800">{nice(day)}</div>{day === todayStr() && <div className="text-[11px] text-emerald-600 font-bold">{L('Today', 'Aaj')}</div>}</div>
        <button onClick={() => setDay(shift(day, 1))} disabled={day >= todayStr()} className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 text-xl font-bold disabled:opacity-30">›</button>
      </div>

      <div className="flex gap-2">
        {stat(newOrders.length, L('New orders', 'Naye order'), 'bg-blue-50 text-blue-700')}
        {stat(dispatch.reduce((s, c) => s + c.lines.length, 0), L('Dispatch entries', 'Maal gaya entry'), 'bg-emerald-50 text-emerald-700')}
        {stat(count('ORDER_EDIT') + count('DISPATCH_UNDO') + count('ORDER_ADD_LINE') + count('CANCEL_ORDER'), L('Corrections', 'Badlav'), 'bg-amber-50 text-amber-700')}
        {stat(count('DOUBT_CLEAR'), L('Doubts cleared', 'Doubt clear'), 'bg-slate-100 text-slate-600')}
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{L('Dispatched — customer by customer', 'Maal gaya — customer ke hisab se')}</div>
        {dispatch.length === 0 && <div className="text-sm text-slate-400">{L('No dispatch entered for this day.', 'Is din koi maal gaya entry nahi.')}</div>}
        {dispatch.map((c) => (
          <div key={c.client}>
            <div className="flex justify-between text-sm font-bold text-slate-800"><span>{c.client}</span><span>{qn(c.total)}</span></div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1 mb-1.5"><div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${Math.max(4, (c.total / maxTotal) * 100)}%` }} /></div>
            {c.lines.map((x, i) => (
              <div key={i} className="flex justify-between gap-2 text-xs text-slate-600 pl-2">
                <span className="min-w-0 truncate">{x.item} <span className="text-slate-400">{x.orderNo} · {timeOf(x.at)}</span></span>
                <span className="font-semibold flex-shrink-0">{qn(x.qty)} {x.unit}{x.closed ? ' ✓' : ''}</span>
              </div>
            ))}
          </div>
        ))}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{L('New orders', 'Naye order')} ({newOrders.length})</div>
        {newOrders.length === 0 && <div className="text-sm text-slate-400">{L('None.', 'Koi nahi.')}</div>}
        {newOrders.map((o) => (
          <div key={o.id} className="text-sm"><b>{o.clientName}</b> <span className="text-xs text-slate-400">{o.orderNo}{o.source === 'scan' ? ' · WhatsApp' : ''}</span><div className="text-xs text-slate-600">{(o.items || []).map((it) => `${it.product} ${qn(it.qty)}`).join(' · ')}</div></div>
        ))}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{L('Changes', 'Badlav')} ({changes.length})</div>
          <button onClick={() => setMine(!mine)} className="text-[11px] font-bold text-blue-600">{mine ? L('Hide mine', 'Mere chhupao') : L('Show mine too', 'Mere bhi dikhao')}</button>
        </div>
        {changes.length === 0 && <div className="text-sm text-slate-400">{L('No changes this day.', 'Is din koi badlav nahi.')}</div>}
        {changes.map((l) => {
          const [en, hi, cls] = CHANGE[l.action]
          return (
            <div key={l.id} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${cls}`}>{L(en, hi)}</span><span className="text-[11px] text-slate-400">{timeOf(l.ts)} · {who(l)}</span></div>
              <div className="text-sm text-slate-800 mt-1 whitespace-pre-line">{l.detail}</div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
