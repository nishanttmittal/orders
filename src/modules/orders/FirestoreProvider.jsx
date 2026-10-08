/**
 * Firestore-backed Orders state — real-time, offline-capable. Same shape as the
 * local provider. Seeds the product master on first run (idempotent).
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { setDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore'

// Wait for a cloud write for a few seconds. 'cloud' = the server has it. 'local' = no answer yet (weak / no
// network): the write is stored on this phone and syncs by itself. A rejected write throws.
const settle = (p, ms = 5000) => Promise.race([p.then(() => 'cloud'), new Promise((resolve) => setTimeout(() => resolve('local'), ms))])
import { onSnapshot } from '../../core/db/readmeter'   // metered reads → usage_reads (quota diagnosis)
import { db, auth, paths, ensureSignedIn, watchAuth } from '../../core/db/firebase'
import { makeNormalizer } from '../../core/schema/field'
import { makeId } from '../../core/db/repository'
import { orderSchema, clientSchema, productSchema } from './schema'
import { OWNER_EMAILS } from './config'
import { lastUsedStore } from './data'
import { nextOrderNo, padOrderNo } from './orderNo'
import { OrdersCtx } from './OrdersContext'

// authKey re-subscribes the listener when the signed-in user changes (anon →
// Google). Without this, a listener that was permission-denied while anonymous
// would stay dead after login and the data would never appear.
// `state`: 'loading' (no answer yet) | 'ok' | 'denied' (this login may not read it) | 'error' (connection / quota).
// A connection error KEEPS the last list (an empty order book must never be shown because the line dropped) and
// the listener is tried again by itself. `enabled = false` opens no listener at all (screens this login cannot use).
function useCloudCollection(collPath, docPath, normalize, authKey, enabled = true) {
  const [list, setList] = useState([])
  const [state, setState] = useState('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let timer
    const signedIn = authKey !== 'anon' && authKey !== 'none'
    const unsub = onSnapshot(
      collPath(),
      (snap) => { setList(snap.docs.map(d => normalize({ id: d.id, ...d.data() }))); setState('ok') },
      (e) => {
        const denied = e?.code === 'permission-denied'
        if (denied) setList([])   // not allowed (before sign-in, or access removed): show nothing
        setState(denied ? 'denied' : 'error')
        if (signedIn) timer = setTimeout(() => setRetry(n => n + 1), denied ? 30000 : 5000)
      }
    )
    return () => { clearTimeout(timer); unsub() }
  }, [authKey, retry, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    list: enabled ? list : [],
    state: enabled ? state : 'off',
    insert: (rec) => { const id = rec.id || makeId('r'); const row = { createdAt: new Date().toISOString(), ...rec, id }; setDoc(docPath(id), row); return row },
    // Same as insert, but tells the truth about the result: resolves { row, where: 'cloud' | 'local' }, or throws
    // if the write was refused. Screens must not say "saved" before this resolves.
    insertSafe: async (rec) => { const id = rec.id || makeId('r'); const row = { createdAt: new Date().toISOString(), ...rec, id }; const where = await settle(setDoc(docPath(id), row)); return { row, where } },
    updateSafe: async (id, patch) => settle(setDoc(docPath(id), patch, { merge: true })),
    // Read-modify-write on ONE doc inside a transaction, so two phones can never overwrite each other. `fn` gets
    // the latest record and returns the patch (or throws a message to stop). Needs the network.
    change: (id, fn) => runTransaction(db, async (tx) => {
      const snap = await tx.get(docPath(id))
      if (!snap.exists()) throw new Error('Record nahi mila')
      const patch = fn(normalize({ id: snap.id, ...snap.data() }))
      tx.set(docPath(id), patch, { merge: true })
      return patch
    }),
    // The same for SEVERAL docs at once (customer-wise dispatch over more than one order): all are read, `fn` gets the
    // latest records and returns { [id]: patch }, and either every patch is written or none is.
    changeMany: (ids, fn) => runTransaction(db, async (tx) => {
      const rows = []
      for (const id of ids) { const snap = await tx.get(docPath(id)); if (snap.exists()) rows.push(normalize({ id: snap.id, ...snap.data() })) }
      const patches = fn(rows)
      for (const [id, patch] of Object.entries(patches)) tx.set(docPath(id), patch, { merge: true })
      return patches
    }),
    update: (id, patch) => setDoc(docPath(id), patch, { merge: true }),
    remove: (id) => deleteDoc(docPath(id)),
  }
}

// One odd record (a name that is not text, a line that is not an object) must never blank the whole screen:
// every record is brought to the shape the screens expect before it reaches them.
const baseOrder = makeNormalizer(orderSchema)
const normOrder = (r) => {
  const o = baseOrder(r)
  return {
    ...o, orderNo: String(o.orderNo ?? ''), orderDate: String(o.orderDate ?? ''), clientName: String(o.clientName ?? ''),
    mirror: o.mirror && typeof o.mirror === 'object' ? o.mirror : { status: 'none' },
    items: (Array.isArray(o.items) ? o.items : []).filter(x => x && typeof x === 'object').map(x => ({ ...x, product: String(x.product ?? ''), finish: String(x.finish ?? '') })),
  }
}
const baseClient = makeNormalizer(clientSchema)
const baseProduct = makeNormalizer(productSchema)
const normClient = (r) => { const c = baseClient(r); return { ...c, name: String(c.name ?? '') } }
const normProduct = (r) => { const c = baseProduct(r); return { ...c, name: String(c.name ?? '') } }
const normLog = (r) => ({ ...r, ts: String(r.ts ?? ''), action: String(r.action ?? ''), detail: String(r.detail ?? '') })

export function FirestoreProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState('')
  // changes anon -> Google so data listeners re-subscribe after login
  const [authKey, setAuthKey] = useState('anon')
  useEffect(() => watchAuth((u) => setAuthKey(u ? `${u.uid}:${u.email || ''}` : 'none')), [])

  const orders   = useCloudCollection(paths.orders, paths.order, normOrder, authKey)
  const clients  = useCloudCollection(paths.clients, paths.client, normClient, authKey)
  const products = useCloudCollection(paths.products, paths.product, normProduct, authKey)
  const users    = useCloudCollection(paths.users, paths.user, (r) => r, authKey)
  // The change log is the owner's screen: other logins do not download it at all. (The old WhatsApp inbox screen
  // is hidden, so its collection is not listened to by anyone.)
  const myEmail = (authKey.split(':')[1] || '').toLowerCase()
  const isOwner = !!myEmail && (OWNER_EMAILS.map(e => e.toLowerCase()).includes(myEmail) || users.list.some(u => (u.email || '').toLowerCase() === myEmail && u.role === 'owner' && u.active !== false))
  const logs     = useCloudCollection(paths.logs, paths.logDoc, normLog, authKey, isOwner)
  const inbox    = useCloudCollection(paths.inbox, paths.inboxDoc, (r) => r, authKey, false)
  const doubts   = useCloudCollection(paths.doubts, paths.doubt, (r) => r, authKey)

  useEffect(() => {
    let done = false
    const timer = setTimeout(() => { if (!done) setTimedOut(true) }, 12000)
    // probe the users collection (readable by any signed-in device, incl.
    // anonymous) so readiness resolves cleanly before Google sign-in — the
    // data collections are now allowlist-locked and would error under anon.
    const unsub = onSnapshot(paths.users(),
      () => { done = true; clearTimeout(timer); setReady(true) },
      // "not allowed" here only means nobody is signed in yet (the sign-in screen comes next): not a cloud error
      (e) => { done = true; clearTimeout(timer); if (e?.code !== 'permission-denied') setError(e.message); setReady(true) })
    ensureSignedIn().catch((e) => { done = true; clearTimeout(timer); setError(e.message); setTimedOut(true) })
    return () => { clearTimeout(timer); unsub() }
  }, [])

  const log = useCallback((action, detail, by = 'user', ref = '') => {
    const id = makeId('log')
    // byEmail comes from the signed-in Google account, so the owner's review screen does not depend on the
    // role label a screen passes in
    // `at` is filled in by the server, so the time of an entry does not depend on the phone's clock (ts is kept for
    // sorting while the write is still on its way)
    setDoc(paths.logDoc(id), { id, ts: new Date().toISOString(), at: serverTimestamp(), action: String(action).slice(0, 40), detail: String(detail ?? '').slice(0, 2000), by, ref, byEmail: (auth?.currentUser?.email || '').toLowerCase() })
      .catch((e) => console.warn('log entry not saved:', action, e?.code || e?.message))   // the laptop's own comparison still records the change
  }, [])

  // Order numbers come from one counter shared with the laptop job (which creates orders approved on WhatsApp),
  // allocated in a transaction so two writers can never get the same number. No network = no number: the screen
  // keeps what was typed and asks to save again. (A number is never invented on the phone: that gave duplicates.)
  const ordersRef = useRef([])
  useEffect(() => { ordersRef.current = orders.list }, [orders.list])
  const allocOrderNo = useCallback(async () => {
    const localNext = Number(/(\d+)\s*$/.exec(nextOrderNo(ordersRef.current))?.[1] || 1)
    const viaCounter = runTransaction(db, async (tx) => {
      const ref = paths.meta('counter')
      const snap = await tx.get(ref)
      const cur = snap.exists() ? Number(snap.data().next) || 1 : 1
      // normally the counter is already ahead of every order on this phone. If one stray order carries a far higher
      // number, it is ignored: the counter only ever moves forward in small steps.
      const n = localNext > cur && localNext <= cur + 15 ? localNext : cur
      tx.set(ref, { next: n + 1, updatedAt: new Date().toISOString() }, { merge: true })
      return padOrderNo(n)
    })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    return Promise.race([viaCounter, timeout])
  }, [])

  // (The first-run seeding of 14 default item names was removed 08-10-2026: the item list is filled, and on a slow
  // start it could bring back names the owner had deleted.)

  if (!ready && timedOut) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4 p-6 text-center">
        <div className="text-4xl">📡</div><div className="text-base font-bold">Can't reach the cloud</div>
        <div className="text-sm text-slate-300 max-w-xs">Check internet and try again.</div>
        <button onClick={() => window.location.reload()} className="mt-2 bg-white text-slate-900 rounded-xl px-6 py-3 font-bold text-sm">Retry</button>
      </div>
    )
  }
  if (!ready) {
    return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-3"><div className="text-2xl">☁️</div><div className="text-sm text-slate-300">Connecting to cloud…</div></div>
  }

  const value = { orders, clients, products, logs, inbox, users, doubts, lastUsed: lastUsedStore, log, allocOrderNo, cloud: { connected: !error, error } }
  return <OrdersCtx.Provider value={value}>{children}</OrdersCtx.Provider>
}
