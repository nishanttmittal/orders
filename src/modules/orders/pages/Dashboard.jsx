/**
 * Dashboard (owner only) — money + delivery visibility at a glance:
 * order value, advances, outstanding balance, status mix, overdue & due-soon.
 */
import { useMemo } from 'react'
import { Card, FieldLabel } from '../../../core/ui'
import { fmtDate, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { statusMeta } from '../config'
import { financialSummary, byStatus, isOverdue, dueSoon, balance, daysToDue } from '../logic/orders'

function Stat({ label, value, tone = 'text-slate-800' }) {
  return <Card className="p-4 flex-1 text-center"><div className={`text-2xl font-bold ${tone}`}>{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></Card>
}

export default function Dashboard() {
  const { orders } = useOrders()
  const list = orders.list
  const fin = useMemo(() => financialSummary(list), [list])
  const st = useMemo(() => byStatus(list), [list])
  const overdue = list.filter(isOverdue).sort((a, b) => daysToDue(a) - daysToDue(b))
  const soon = list.filter(o => dueSoon(o, 7)).sort((a, b) => daysToDue(a) - daysToDue(b))

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="flex gap-3">
        <Stat label="Order Value" value={`₹${fmtNum(fin.totalValue)}`} tone="text-blue-700" />
        <Stat label="Advance In" value={`₹${fmtNum(fin.advance)}`} tone="text-emerald-600" />
        <Stat label="Outstanding" value={`₹${fmtNum(fin.outstanding)}`} tone={fin.outstanding ? 'text-red-600' : 'text-slate-800'} />
      </div>

      <Card className="p-5">
        <FieldLabel>Order Pipeline</FieldLabel>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {['pending', 'production', 'ready', 'dispatched'].map(k => (
            <div key={k} className={`rounded-xl py-3 ${statusMeta(k).color}`}><div className="text-2xl font-bold">{st[k] || 0}</div><div className="text-[11px] font-semibold">{statusMeta(k).label}</div></div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <FieldLabel className="text-red-600">⏰ Overdue ({overdue.length})</FieldLabel>
        {overdue.length === 0 ? <p className="text-sm text-slate-400 mt-2">None — on track.</p> : (
          <div className="mt-3 space-y-2">
            {overdue.map(o => (
              <div key={o.id} className="flex items-center justify-between text-sm bg-red-50 rounded-xl px-3 py-2">
                <div><div className="font-semibold text-slate-800">{o.clientName}</div><div className="text-xs text-slate-400">{o.orderNo} · due {fmtDate(o.deliveryDate)}</div></div>
                <span className="font-bold text-red-600">{Math.abs(daysToDue(o))}d late</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <FieldLabel>Due in 7 days ({soon.length})</FieldLabel>
        {soon.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nothing due soon.</p> : (
          <div className="mt-3 space-y-2">
            {soon.map(o => (
              <div key={o.id} className="flex items-center justify-between text-sm bg-amber-50 rounded-xl px-3 py-2">
                <div><div className="font-semibold text-slate-800">{o.clientName}</div><div className="text-xs text-slate-400">{o.orderNo} · {statusMeta(o.status).label}</div></div>
                <span className="font-bold text-amber-700">{daysToDue(o)}d · ₹{fmtNum(balance(o))} bal</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
