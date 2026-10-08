/**
 * Orders — the order book, kept simple. It opens on what is still to go ("Baaki"). Tap an order to see its lines;
 * on each line enter how much has gone ("Gaya"). The order closes by itself when every line is fully sent —
 * there is no status ladder to maintain by hand. Owner also sees money and can cancel (under "More").
 */
import { useMemo, useState } from 'react'
import { Button, Card, FieldLabel, SearchBar, NumberInput, useToast, Toast } from '../../../core/ui'
import { fmtDate, fmtNum } from '../../../core/utils/format'
import { useOrders } from '../OrdersContext'
import { balance, daysToDue, isOverdue, isOpen, lineSent, lineBalance, lineUnit, orderBalance, orderUnit, linesLeft, itemsQty, applyDispatch, undoLastDispatch, dispatchAll, groupLine, allocateDispatch } from '../logic/orders'
import { duplicateOrderNos } from '../orderNo'
import { auth } from '../../../core/db/firebase'
import Suggest from '../Suggest'
import { itemKey } from '../logic/itemName'
import { askDeletePassword } from '../deleteGate'
import { useL } from '../i18n'

const localDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
// What happened to this order's line in the staff order group. `retry` = offer the "Ab bhejo" button.
const MIRROR = {
  pending:   { text: ['Will go to the order list (when the laptop is on)', 'Order list me jayega (laptop on hote hi)'], cls: 'text-amber-600' },
  queued:    { text: ['Going to the order list…', 'Order list me ja raha hai…'], cls: 'text-amber-600' },
  sent:      { text: ['Posted in the order list ✓', 'Order list me likh diya ✓'], cls: 'text-emerald-600' },
  held:      { text: ['NOT posted in the order list', 'Order list me NAHI gaya'], cls: 'text-red-600', retry: true },
  failed:    { text: ['NOT posted in the order list', 'Order list me NAHI gaya'], cls: 'text-red-600', retry: true },
  uncertain: { text: ['Not sure it reached the order list — check the group', 'Order list me gaya ya nahi — group me dekh lein'], cls: 'text-amber-700', retry: true },
}
// 320 -> "320", 2.5 -> "2.5" (kg lines): never round a real balance down to 0
const qn = (n) => (Number.isInteger(Number(n)) ? fmtNum(n) : String(Math.round(Number(n) * 1000) / 1000))

export default function Orders({ owner = false, role = '' }) {
  const canPost = owner || role === 'manager'
  const { orders, products, log } = useOrders()
  const { msg, show } = useToast()
  const L = useL()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('open')
  const [openId, setOpenId] = useState(null)
  const [entry, setEntry] = useState(null)      // { id, line, value } — the "Gaya" box that is open
  const [moreId, setMoreId] = useState(null)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...orders.list]
      .filter(o => !o.test)
      .filter(o => filter === 'all' ? true : filter === 'open' ? isOpen(o) : o.status === 'dispatched')
      .filter(o => !term || (o.clientName || '').toLowerCase().includes(term) || (o.orderNo || '').toLowerCase().includes(term) || (o.items || []).some(it => (it.product || '').toLowerCase().includes(term)))
      // Baaki: oldest first (those are the ones being dispatched). Poora gaya / Sab: newest first.
      .sort((a, b) => { const c = (a.orderDate || '').localeCompare(b.orderDate || '') || (a.orderNo || '').localeCompare(b.orderNo || ''); return filter === 'open' ? c : -c })
  }, [orders.list, q, filter])

  // Baaki view only: orders of the same customer are shown together (see groupCard). Same customer = same name,
  // ignoring capitals and extra spaces. A search that names an order number shows the orders one by one.
  const [openClient, setOpenClient] = useState(null)
  const rows = useMemo(() => {
    if (filter !== 'open' || /uo-?\d/i.test(q)) return list.map(o => ({ o }))
    const by = new Map()
    for (const o of list) { const key = String(o.clientName || '').trim().toLowerCase().replace(/\s+/g, ' '); if (!by.has(key)) by.set(key, []); by.get(key).push(o) }
    return [...by.entries()].map(([key, os]) => {
      if (os.length === 1) return { o: os[0] }
      const items = new Map()
      for (const o of os) for (const it of o.items || []) {
        const bal = lineBalance(o, it); if (!(bal > 0)) continue
        const k = `${itemKey(it.product)}|${lineUnit(it)}`
        if (!items.has(k)) items.set(k, { k, key: itemKey(it.product), name: it.product, unit: lineUnit(it), bal: 0 })
        items.get(k).bal += bal
      }
      const units = [...new Set([...items.values()].map(x => x.unit))]
      return { key, name: os[0].clientName, orders: os, items: [...items.values()], unit: units.length === 1 ? units[0] : '', left: os.reduce((t, o) => t + orderBalance(o), 0) }
    })
  }, [list, filter, q])

  const overdue = orders.list.filter(o => !o.test && isOverdue(o))
  const dupNos = useMemo(() => duplicateOrderNos(orders.list), [orders.list])
  const by = owner ? 'owner' : 'manager'

  // Every quantity change runs in a transaction on the latest copy of the order, so the owner's phone and
  // Anshul ji's phone can never overwrite each other. Nothing is shown as done until the cloud has it.
  const [working, setWorking] = useState(false)
  // `expect` = what this phone was looking at when the button was tapped ({ i, product, qty, lastAt? }). Lines are
  // addressed by position, so if the other phone changed the order in between, the entry must stop, not land on a
  // different item. A cancelled order never takes an entry (and so can never be "un-cancelled" by one).
  const run = async (o, fn, okMsg, expect) => {
    if (working) return false
    setWorking(true)
    try {
      const next = await orders.change(o.id, (latest) => {
        if (latest.status === 'cancelled') throw new Error('Order cancel ho chuka hai (nahi mil)')
        if (expect) {
          const it = (latest.items || [])[expect.i]
          if (!it || it.product !== expect.product || Number(it.qty) !== Number(expect.qty)) throw new Error('Order nahi mila jaisa tha — beech me badal gaya. Band karke dobara kholein.')
          if ('lastAt' in expect && ((it.log || []).slice(-1)[0]?.at || '') !== expect.lastAt) throw new Error('Order nahi mila jaisa tha — beech me badal gaya. Band karke dobara kholein.')
        }
        return { ...fn(latest), lastDispatchAt: new Date().toISOString() }
      })
      show(typeof okMsg === 'function' ? okMsg(next) : okMsg)
      setEntry(null)
      return true    // the change is really saved
    } catch (e) {
      const m = String(e?.message || '')
      const known = /Baaki sirf|Kitna gaya|nahi mil|ja chuka hai/.test(m)
      const en = /Baaki sirf (\S+) hai/.test(m) ? `Only ${/Baaki sirf (\S+) hai/.exec(m)[1]} is pending`
        : /"(.*)" me (\S+) ja chuka hai/.test(m) ? `${/"(.*)" me (\S+) ja chuka hai/.exec(m)[2]} of "${/"(.*)" me/.exec(m)[1]}" has already gone — quantity cannot be less`
        : /Kitna gaya/.test(m) ? 'How much went? Enter a number' : /Line hata nahi/.test(m) ? 'You cannot remove a line — only the owner can.'
        : /cancel ho chuka/.test(m) ? 'This order is cancelled.' : /Record nahi mila/.test(m) ? 'Order not found.'
        : /is line ka maal/.test(m) ? 'Goods have already gone on a line you removed — close it and open it again.'
        : /beech me badal/.test(m) ? 'This order changed meanwhile — close it and open it again.' : m
      show(known ? L(en, m.replace(' (nahi mil)', '')) : L('NOT saved — check the internet and try again', 'Save NAHI hua — internet dekh kar dobara karein'), 4000)
      return false   // nothing was saved: callers must not log it or close the form
    } finally { setWorking(false) }
  }
  const saveGaya = (o, i, amount) => {
    const add = Number(amount ?? entry?.value)
    if (!(add > 0)) return show(L('How much went? Enter a number', 'Kitna gaya? Number likhein'), 2000)
    const it = o.items[i]
    run(o, (latest) => applyDispatch(latest, i, add, by), (next) => (next.status === 'dispatched' ? L(`${o.orderNo} fully dispatched ✓`, `${o.orderNo} poora gaya ✓`) : L(`${qn(add)} dispatched ✓`, `${qn(add)} gaya ✓`)), { i, product: it.product, qty: it.qty })
      .then((ok) => { if (ok) log('DISPATCH', `${o.orderNo} · ${o.clientName} · ${it.product} +${add} ${lineUnit(it)}`, by, o.id) })
  }
  const allGaya = (o) => {
    if (!confirm(L(`${o.clientName} ${o.orderNo}: whole order dispatched?`, `${o.clientName} ${o.orderNo}: poora order gaya?`))) return
    run(o, (latest) => dispatchAll(latest, by), L(`${o.orderNo} fully dispatched ✓`, `${o.orderNo} poora gaya ✓`)).then((ok) => { if (ok) log('DISPATCH_ALL', `${o.orderNo} · ${o.clientName}`, by, o.id) })
  }
  // Wrong tap: take back only the LAST entry on that line (earlier dispatches stay).
  const undoLine = (o, i) => {
    const last = (o.items[i].log || []).slice(-1)[0]
    if (!confirm(last ? L(`Was the last entry (${qn(last.qty)}) wrong? Take it back?`, `Aakhri entry (${qn(last.qty)}) galat thi? Hata dein?`) : L('Clear the dispatched quantity of this line?', 'Is line ka "gaya" hata dein?'))) return
    run(o, (latest) => undoLastDispatch(latest, i), L('Entry taken back', 'Entry hata di'), { i, product: o.items[i].product, qty: o.items[i].qty, lastAt: last?.at || '' }).then((ok) => { if (ok) log('DISPATCH_UNDO', `${o.orderNo} · ${o.clientName} · ${o.items[i].product} — ${last ? qn(last.qty) : qn(lineSent(o, o.items[i]))} ki entry wapas li`, by, o.id) })
  }
  // Price / advance (owner): typed into the two boxes, written with the Save button, and reported truthfully.
  const [money, setMoneyBox] = useState(null)   // { id, price, advance } while the boxes are being edited
  const saveMoney = async (o) => {
    if (!money || money.id !== o.id) return
    try {
      await orders.updateSafe(o.id, { price: Number(money.price) || 0, advance: Number(money.advance) || 0 })
      log('MONEY_EDIT', `${o.orderNo} · ${o.clientName} · price / advance changed`, 'owner', o.id)   // the amounts are deliberately not written into the log
      setMoneyBox(null); show(L('Saved ✓', 'Save ✓'))
    } catch { show(L('NOT saved — check the internet and try again', 'Save NAHI hua — internet dekh kar dobara karein'), 4000) }
  }
  // ── Correct a saved order (wrong customer / item / quantity) ──────────────────────────────────────────────
  // The lines are remembered exactly as they were when the edit was OPENED (`n` lines, each row's `orig`): the save
  // goes through only if the order in the cloud still looks like that.
  const [edit, setEdit] = useState(null)   // { id, client, n, rows: [{ product, qty, sent, orig, unit }] }
  const startEdit = (o) => setEdit({ id: o.id, client: o.clientName, n: (o.items || []).length, rows: (o.items || []).map(it => ({ product: it.product, qty: String(it.qty), sent: lineSent(o, it), orig: `${it.product}|${it.qty}`, unit: lineUnit(it) })) })
  const setEditRow = (i, patch) => setEdit({ ...edit, rows: edit.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r) })
  const saveEdit = (o) => {
    const cn = edit.client.trim()
    if (!cn) return show(L('Enter the customer name', 'Customer ka naam likhein'), 2000)
    const used = edit.rows.filter(r => r.product.trim() || String(r.qty).trim() || r.sent > 0)
    if (used.some(r => !r.product.trim() || !(Number(r.qty) > 0))) return show(L('Every line needs both item and quantity', 'Har line me item aur quantity dono likhein'), 2500)
    if (used.some(r => Number(r.qty) < r.sent)) return show(L('Quantity cannot be less than what has already gone', 'Quantity "gaya" se kam nahi ho sakti'), 2500)
    if (!used.length) return show(L('At least one item is needed (to remove everything, use Cancel Order)', 'Kam se kam ek item chahiye (poora hatana ho to Cancel Order)'), 3000)
    // Only the owner may remove a line. The manager can correct the name or quantity of a line, never drop it.
    const removed = edit.rows.filter((r, i) => i < (o.items || []).length && !used.includes(r))
    if (removed.length && !owner) return show(L('You cannot remove a line — correct the name or quantity. Only the owner can remove.', 'Line hata nahi sakte — naam ya quantity theek karein. Hatana sirf owner kar sakte hain.'), 4000)
    // what exactly changed, in plain words, for the owner's "Badlav" screen
    const diff = []
    if (cn !== o.clientName) diff.push(`Customer: ${o.clientName} → ${cn}`)
    edit.rows.forEach((r, i) => {
      const old = (o.items || [])[i]
      if (old && !used.includes(r)) diff.push(`Hataya: ${old.product} ${old.qty}`)
      else if (old && (r.product.trim() !== old.product || Number(r.qty) !== Number(old.qty))) diff.push(`${old.product} ${old.qty} → ${r.product.trim()} ${Number(r.qty)}`)
      else if (!old && used.includes(r)) diff.push(`Joda: ${r.product.trim()} ${Number(r.qty)}`)
    })
    if (!diff.length) { setEdit(null); return show(L('Nothing changed', 'Kuch badla nahi'), 1500) }
    const email = (auth?.currentUser?.email || '').toLowerCase()
    run(o, (latest) => {
      // The order may have changed on the other phone since this edit was opened. Rows are matched to lines by
      // position, so unless every line is still exactly what this edit started from, stop: saving would drop,
      // misplace or silently revert a line.
      const cur = latest.items || []
      if (cur.length !== edit.n || cur.some((it, i) => `${it.product}|${it.qty}` !== edit.rows[i].orig)) throw new Error('Order nahi mila jaisa tha — beech me badal gaya. Band karke dobara kholein.')
      // a line taken out here must not have had goods sent on it meanwhile
      if (cur.some((it, i) => !used.includes(edit.rows[i]) && lineSent(latest, it) > 0)) throw new Error('Order nahi mila jaisa tha — is line ka maal ja chuka hai. Band karke dobara kholein.')
      // and the "manager cannot remove a line" rule is applied to the latest lines, not to what this phone remembered
      if (!owner && (latest.items || []).some((_, i) => !used.includes(edit.rows[i]))) throw new Error('Line hata nahi sakte — sirf owner kar sakte hain. (nahi mil)')
      // rows are matched to the latest lines by position; what has already gone on a line is always kept
      const items = edit.rows.map((r, i) => ({ r, old: (latest.items || [])[i] })).filter(({ r }) => used.includes(r)).map(({ r, old }) => {
        const sentNow = old ? lineSent(latest, old) : 0
        if (Number(r.qty) < sentNow) throw new Error(`Baaki sirf — "${r.product}" me ${sentNow} ja chuka hai`)
        return { ...(old || { finish: '', dispatched: 0 }), unit: r.unit || old?.unit || 'Nos', product: r.product.trim(), qty: Number(r.qty), dispatched: sentNow }
      })
      const left = items.reduce((t, it) => t + Math.max(0, it.qty - it.dispatched), 0)
      // only an order whose line really went (or is on its way) gets a correction line; one still waiting is posted
      // from the corrected lines anyway, and one that never reached the group must not get a "BADLAV" for nothing
      const posted = ['sent', 'queued', 'uncertain'].includes(latest.mirror?.status)
      return {
        clientName: cn, items, status: left === 0 ? 'dispatched' : latest.status === 'dispatched' ? 'pending' : latest.status,
        // an order whose line is already in the staff group gets one "BADLAV" line with the corrected order
        ...(posted ? { groupNotes: [...(latest.groupNotes || []), { id: `n${Date.now()}`, kind: 'EDIT', lines: items.map(groupLine), status: 'pending', at: new Date().toISOString(), by: email }], notePending: true } : {}),
        editedAt: new Date().toISOString(), editedBy: by,
      }
    }, L('Order corrected ✓', 'Order theek ho gaya ✓')).then((ok) => { if (!ok) return; log('ORDER_EDIT', `${o.orderNo} · ${cn}\n${diff.join('\n')}`, by, o.id); setEdit(null) })
  }
  // Send the group line again after a failure / hold (owner or manager). The laptop job picks it up.
  const resend = async (o) => {
    try {
      await orders.updateSafe(o.id, { mirror: { status: 'pending', retry: (Number(o.mirror?.retry) || 0) + 1, why: '' } })
      log('GROUP_RESEND', `${o.orderNo} · ${o.clientName}`, by, o.id)
      show(L('Sending again', 'Dobara bheja ja raha hai'))
    } catch { show(L('NOT sent — check the internet and try again', 'NAHI gaya — internet dekh kar dobara karein'), 4000) }
  }
  // Cancel (not hard delete): keep the record + number permanently, mark cancelled.
  const cancelOrder = async (o) => {
    if (o.status === 'cancelled') return
    if (!(await askDeletePassword(L(`Cancel order ${o.orderNo} (${o.clientName})?`, `Order ${o.orderNo} (${o.clientName}) cancel karna hai?`)))) return
    const reason = prompt(`Cancel order ${o.orderNo} (${o.clientName})?\nOrder rakha jayega, number dobara use nahi hoga. Reason (optional):`)
    if (reason === null) return
    try {
      await orders.updateSafe(o.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'owner', cancelReason: (reason || '').trim() })
      log('CANCEL_ORDER', `${o.orderNo} · ${o.clientName}${reason ? ' · ' + reason : ''}`, 'owner', o.id)
      show(L('Order cancelled ✓', 'Order cancel ho gaya ✓'))
    } catch { show(L('NOT cancelled — check the internet and try again', 'Cancel NAHI hua — internet dekh kar dobara karein'), 4000) }
  }

  const chip = (k, label) => (
    <button key={k} onClick={() => setFilter(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${filter === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
  )

  // Customer-wise dispatch: "Pushback 700 gaya" entered once on the customer's card. It is shared out oldest order
  // first, on the LATEST copy of all his orders in one transaction (all of it is saved, or none of it), and each
  // order gets its own entry in the log exactly as if it had been entered inside that order.
  const [gEntry, setGEntry] = useState(null)   // { client, k, value }
  const saveGroupGaya = async (g, x, amount) => {
    const add = Number(amount ?? gEntry?.value)
    if (!(add > 0)) return show(L('How much went? Enter a number', 'Kitna gaya? Number likhein'), 2000)
    if (working) return
    setWorking(true)
    try {
      let parts = []
      await orders.changeMany(g.orders.map(o => o.id), (latest) => {
        const res = allocateDispatch(latest, x.key, x.unit, add, by)
        parts = res.parts
        const at = new Date().toISOString()
        return Object.fromEntries(Object.entries(res.patches).map(([id, p]) => [id, { ...p, lastDispatchAt: at }]))
      })
      const perOrder = new Map()
      for (const p of parts) { if (!perOrder.has(p.id)) perOrder.set(p.id, { ...p, qty: 0 }); perOrder.get(p.id).qty += p.qty }
      for (const p of perOrder.values()) log('DISPATCH', `${p.orderNo} · ${g.name} · ${p.product} +${p.qty} ${p.unit}`, by, p.id)
      setGEntry(null)
      show(`${x.name} ${qn(add)} ${L('dispatched', 'gaya')} ✓ — ${[...perOrder.values()].map(p => `${p.orderNo}: ${qn(p.qty)}`).join(', ')}`, 4500)
    } catch (e) {
      const m = String(e?.message || '')
      const only = /Baaki sirf (\S+) hai/.exec(m)
      show(only ? L(`Only ${only[1]} is pending`, m) : /Kitna gaya/.test(m) ? L('How much went? Enter a number', m) : L('NOT saved — check the internet and try again', 'Save NAHI hua — internet dekh kar dobara karein'), 4000)
    } finally { setWorking(false) }
  }

  // One order's card (also used inside a customer's group card).
  const orderCard = (o) => {
            const open = openId === o.id; const left = orderBalance(o); const total = itemsQty(o); const d = daysToDue(o)
            const m = MIRROR[o.mirror?.status]
            return (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => { setOpenId(open ? null : o.id); setEntry(null) }}>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{o.clientName} <span className="text-xs text-slate-400 font-normal">{o.orderNo}</span></div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{(o.items || []).filter(it => filter !== 'open' || lineBalance(o, it) > 0).map(it => `${it.product}${it.finish && !it.product.toLowerCase().includes(it.finish.toLowerCase()) ? ' ' + it.finish : ''} ${qn(filter === 'open' ? lineBalance(o, it) : it.qty)}`).join(' · ')}</div>
                    {['held', 'failed', 'uncertain'].includes(o.mirror?.status) && o.status !== 'cancelled' && <div className="text-[11px] font-bold text-red-600 mt-0.5">{L('⚠ Not posted in the order list — open', '⚠ Order list me nahi gaya — kholein')}</div>}
                    <div className="text-[11px] text-slate-400 mt-0.5">{fmtDate(o.orderDate)}{o.deliveryDate ? ` · delivery ${fmtDate(o.deliveryDate)}` : ''}{isOverdue(o) ? L(` · ${Math.abs(d)} days late`, ` · ${Math.abs(d)} din late`) : ''}</div>
                  </div>
                  {o.status === 'cancelled'
                    ? <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-rose-100 text-rose-700 flex-shrink-0">{L('Cancelled', 'Cancel')}</span>
                    : left === 0
                      ? <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 flex-shrink-0">{L('Dispatched ✓', 'Gaya ✓')}</span>
                      : <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0 text-right">{orderUnit(o) ? `${L('Pending', 'Baaki')} ${qn(left)}${left !== total ? ` / ${qn(total)}` : ''} ${orderUnit(o)}` : L(`${linesLeft(o)} items pending`, `${linesLeft(o)} item baaki`)}</span>}
                </div>

                {open && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    {(o.items || []).map((it, i) => {
                      const sent = lineSent(o, it); const bal = lineBalance(o, it); const editing = entry && entry.id === o.id && entry.line === i && entry.product === it.product
                      return (
                        <div key={i} className="rounded-xl bg-slate-50 p-3">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="font-bold text-slate-800">{it.product} <span className="font-normal text-slate-500">{it.finish}</span></span>
                            <span className="font-bold text-slate-700 flex-shrink-0">{qn(it.qty)} {lineUnit(it)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <span className="text-xs text-slate-500">{L('Sent', 'Gaya')} {qn(sent)} · <b className={bal ? 'text-amber-700' : 'text-emerald-700'}>{L('Pending', 'Baaki')} {qn(bal)}</b>{canPost && sent > 0 && o.status !== 'cancelled' && <button onClick={() => undoLine(o, i)} className="ml-2 underline text-slate-400">{L('Wrong entry?', 'Galat entry?')}</button>}</span>
                            {canPost && o.status !== 'cancelled' && bal > 0 && !editing && (
                              <button onClick={() => setEntry({ id: o.id, line: i, value: '', product: it.product })} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">{L('Dispatched', 'Maal gaya')}</button>
                            )}
                          </div>
                          {editing && (
                            <div className="mt-2 space-y-2">
                              <div className="flex gap-2 items-center">
                                <NumberInput autoFocus inputMode="decimal" className="flex-1 text-center !py-2" placeholder={L('How much went now?', 'Abhi kitna gaya?')} value={entry.value} onChange={e => setEntry({ ...entry, value: e.target.value })} />
                                <Button size="sm" variant="primary" disabled={working} onClick={() => saveGaya(o, i)}>OK</Button>
                                <Button size="sm" variant="neutral" onClick={() => setEntry(null)}>✕</Button>
                              </div>
                              <button disabled={working} onClick={() => saveGaya(o, i, bal)} className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold">{L('All pending went', 'Poora baaki gaya')} ({qn(bal)})</button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {edit && edit.id === o.id && (
                      <div className="rounded-xl border-2 border-blue-200 p-3 space-y-2">
                        <input className="w-full border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold" value={edit.client} onChange={e => setEdit({ ...edit, client: e.target.value })} placeholder="Customer" />
                        {edit.rows.map((r, i) => (
                          <div key={i} className="flex gap-1.5 items-center">
                            <div className="flex-1 min-w-0"><Suggest className="w-full border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold" value={r.product} onChange={v => setEditRow(i, { product: v })} onPick={p => setEditRow(i, { product: p.name, unit: p.unit || 'Nos' })} options={products.list} placeholder="Item" /></div>
                            <div className="w-24 flex-shrink-0"><NumberInput inputMode="decimal" className="text-center !px-2 !py-2 !text-sm" value={r.qty} onChange={e => setEditRow(i, { qty: e.target.value })} placeholder="Qty" /></div>
                            {r.sent > 0
                              ? <span className="w-10 text-[10px] text-slate-400 text-center flex-shrink-0">{L('sent', 'gaya')} {qn(r.sent)}</span>
                              : (owner || i >= (o.items || []).length)
                                ? <button aria-label="Line hatao" onClick={() => setEdit({ ...edit, rows: edit.rows.map((x, idx) => idx === i ? { ...x, product: '', qty: '' } : x) })} className="w-10 h-9 rounded-xl bg-red-50 text-red-500 font-bold flex-shrink-0">✕</button>
                                : <span className="w-10 flex-shrink-0" />}
                          </div>
                        ))}
                        <button onClick={() => setEdit({ ...edit, rows: [...edit.rows, { product: '', qty: '', sent: 0, unit: 'Nos' }] })} className="text-xs font-bold text-slate-500 py-1">{L('+ Add item', '+ Aur item')}</button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="primary" disabled={working} onClick={() => saveEdit(o)}>Save</Button>
                          <Button variant="neutral" onClick={() => setEdit(null)}>{L('Close', 'Chhodo')}</Button>
                        </div>
                      </div>
                    )}
                    {canPost && o.status !== 'cancelled' && !(edit && edit.id === o.id) && (
                      <button onClick={() => startEdit(o)} className="text-xs font-bold text-blue-600">{L('✎ Correct this order (name / item / quantity)', '✎ Order theek karein (naam / item / quantity)')}</button>
                    )}
                    {(o.groupNotes || []).filter(n => n.status !== 'sent').slice(-1).map(n => (
                      <div key={n.id} className={`text-xs font-semibold ${n.status === 'held' || n.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{n.kind === 'ADD' ? L('Added item', 'Naya item') : L('Correction', 'Badlav')}: {n.status === 'held' || n.status === 'failed' ? `${L('NOT posted in the order list', 'order list me NAHI gaya')}${n.why ? ' — ' + n.why : ''}` : L('going to the order list…', 'order list me ja raha hai…')}</div>
                    ))}
                    {canPost && o.status !== 'cancelled' && left > 0 && (o.items || []).length > 1 && (
                      <Button variant="neutral" className="w-full" onClick={() => allGaya(o)}>{L('Whole order dispatched', 'Poora order gaya')}</Button>
                    )}

                    {m && (
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-xs font-semibold ${m.cls}`}>{L(m.text[0], m.text[1])}{m.retry && o.mirror?.why ? ` — ${o.mirror.why}` : ''}</div>
                        {m.retry && canPost && o.status !== 'cancelled' && <button onClick={() => resend(o)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold flex-shrink-0">{L('Send now', 'Ab bhejo')}</button>}
                      </div>
                    )}
                    {(o.transport || o.remarks) && <div className="text-xs text-slate-500">{o.transport ? `🚚 ${o.transport}` : ''}{o.transport && o.remarks ? ' · ' : ''}{o.remarks}</div>}
                    {o.status === 'cancelled' && <div className="text-xs font-semibold text-rose-600">Cancelled{o.cancelReason ? ` · ${o.cancelReason}` : ''}{o.cancelledAt ? ` · ${fmtDate(localDay(o.cancelledAt))}` : ''}</div>}

                    {owner && o.status !== 'cancelled' && (
                      <>
                        <button onClick={() => setMoreId(moreId === o.id ? null : o.id)} className="text-xs font-bold text-slate-400">{moreId === o.id ? L('▲ Less', '▲ Kam') : L('▼ More (money, cancel)', '▼ More (paisa, cancel)')}</button>
                        {moreId === o.id && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 bg-emerald-50 rounded-xl p-3">
                              {/* typed here, written only with the Save button (leaving the box does not save on an iPhone) */}
                              <div><FieldLabel>Price ₹</FieldLabel><NumberInput className="mt-1 !py-2" value={money?.id === o.id ? money.price : (o.price || '')} onChange={e => setMoneyBox({ id: o.id, price: e.target.value, advance: money?.id === o.id ? money.advance : (o.advance || '') })} /></div>
                              <div><FieldLabel>Advance ₹</FieldLabel><NumberInput className="mt-1 !py-2" value={money?.id === o.id ? money.advance : (o.advance || '')} onChange={e => setMoneyBox({ id: o.id, advance: e.target.value, price: money?.id === o.id ? money.price : (o.price || '') })} /></div>
                              <div className="col-span-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-emerald-700">Balance: ₹{fmtNum(balance(o))}</span>{money?.id === o.id && <Button size="sm" variant="primary" onClick={() => saveMoney(o)}>{L('Save price', 'Paisa save')}</Button>}</div>
                            </div>
                            <Button size="sm" variant="danger" className="w-full" onClick={() => cancelOrder(o)}>Cancel Order</Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
  }
  // Baaki view: a customer with more than one pending order gets ONE card — the total still to go and every item
  // added up across his orders. Tap it to see the orders themselves (each keeps its own number, date and entries;
  // the orders are shown together, never joined into one).
  const groupCard = (g) => {
    const open = openClient === g.key
    return (
      <Card key={'g' + g.key} className="p-4 border-2 border-blue-100">
        <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => { setOpenClient(open ? null : g.key); setEntry(null) }}>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 truncate">{g.name} <span className="text-xs text-blue-600 font-bold">{g.orders.length} {L('orders', 'order')}</span></div>
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-3">{g.items.map(x => `${x.name} ${qn(x.bal)}${x.unit !== 'Nos' ? ' ' + x.unit : ''}`).join(' · ')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{g.orders.map(o => o.orderNo).join(' · ')}</div>
          </div>
          <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0 text-right">{g.unit ? `${L('Pending', 'Baaki')} ${qn(g.left)} ${g.unit}` : L(`${g.items.length} items pending`, `${g.items.length} item baaki`)}</span>
        </div>
        {open && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            {canPost && g.items.map(x => {
              const editing = gEntry && gEntry.client === g.key && gEntry.k === x.k
              return (
                <div key={x.k} className="rounded-xl bg-blue-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800 min-w-0">{x.name} <span className="font-semibold text-amber-700 whitespace-nowrap">· {L('Pending', 'Baaki')} {qn(x.bal)} {x.unit}</span></span>
                    {!editing && <button onClick={() => setGEntry({ client: g.key, k: x.k, value: '' })} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold flex-shrink-0">{L('Dispatched', 'Maal gaya')}</button>}
                  </div>
                  {editing && (
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2 items-center">
                        <NumberInput autoFocus inputMode="decimal" className="flex-1 text-center !py-2" placeholder={L('How much went now?', 'Abhi kitna gaya?')} value={gEntry.value} onChange={e => setGEntry({ ...gEntry, value: e.target.value })} />
                        <Button size="sm" variant="primary" disabled={working} onClick={() => saveGroupGaya(g, x)}>OK</Button>
                        <Button size="sm" variant="neutral" onClick={() => setGEntry(null)}>✕</Button>
                      </div>
                      <button disabled={working} onClick={() => saveGroupGaya(g, x, x.bal)} className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold">{L('All pending went', 'Poora baaki gaya')} ({qn(x.bal)})</button>
                      <div className="text-[11px] text-slate-500">{L('Fills the oldest order first.', 'Sabse purane order se pehle katega.')}</div>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1">{L('Orders', 'Order')}</div>
            {g.orders.map(orderCard)}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Toast msg={msg} />

      {overdue.length > 0 && (
        <Card className="p-4 border border-red-200 bg-red-50">
          <div className="text-sm font-bold text-red-700">⏰ {overdue.length} {L('orders late:', 'order late:')} {overdue.slice(0, 3).map(o => o.clientName).join(', ')}{overdue.length > 3 ? '…' : ''}</div>
        </Card>
      )}
      {dupNos.size > 0 && (
        <Card className="p-4 border border-rose-300 bg-rose-50">
          <div className="text-sm font-semibold text-rose-700">⚠ {L('Order number used twice:', 'Order number do baar:')} {[...dupNos].join(', ')}</div>
        </Card>
      )}

      <div className="flex gap-2">{chip('open', L('Pending', 'Baaki'))}{chip('done', L('Dispatched', 'Poora gaya'))}{chip('all', L('All', 'Sab'))}</div>
      <SearchBar value={q} onChange={setQ} placeholder={L('Customer, item or order no…', 'Customer, item ya order no…')} />

      {list.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">{filter === 'open' ? L('No pending orders.', 'Koi order baaki nahi.') : L('No orders.', 'Koi order nahi.')}</Card>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (row.orders ? groupCard(row) : orderCard(row.o)))}
        </div>
      )}
    </div>
  )
}
