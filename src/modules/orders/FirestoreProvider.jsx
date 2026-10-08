/**
 * Firestore-backed Orders state — real-time, offline-capable. Same shape as the
 * local provider. Seeds the product master on first run (idempotent).
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore'

// Wait for a cloud write for a few seconds. 'cloud' = the server has it. 'local' = no answer yet (weak / no
// network): the write is stored on this phone and syncs by itself. A rejected write throws.
const settle = (p, ms = 5000) => Promise.race([p.then(() => 'cloud'), new Promise((resolve) => setTimeout(() => resolve('local'), ms))])
import { onSnapshot, getDocs } from '../../core/db/readmeter'   // metered reads → usage_reads (quota diagnosis)
import { db, auth, paths, ensureSignedIn, watchAuth } from '../../core/db/firebase'
import { makeNormalizer } from '../../core/schema/field'
import { makeId } from '../../core/db/repository'
import { orderSchema, clientSchema, productSchema } from './schema'
import { DEFAULT_PRODUCTS } from './config'
import { lastUsedStore } from './data'
import { nextOrderNo, padOrderNo } from './orderNo'
import { OrdersCtx } from './OrdersContext'

// authKey re-subscribes the listener when the signed-in user changes (anon →
// Google). Without this, a listener that was permission-denied while anonymous
// would stay dead after login and the data would never appear.
function useCloudCollection(collPath, docPath, normalize, authKey) {
  const [list, setList] = useState([])
  useEffect(() => {
    const unsub = onSnapshot(
      collPath(),
      (snap) => setList(snap.docs.map(d => normalize({ id: d.id, ...d.data() }))),
      () => setList([]) // denied before sign-in → empty; re-subscribes when authKey changes
    )
    return unsub
  }, [authKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    list,
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
    update: (id, patch) => setDoc(docPath(id), patch, { merge: true }),
    remove: (id) => deleteDoc(docPath(id)),
    replaceAll: async (rows) => {
      const ex = await getDocs(collPath()); const b1 = writeBatch(db); ex.forEach(d => b1.delete(d.ref)); await b1.commit()
      const b2 = writeBatch(db); (rows || []).forEach(r => { const id = r.id || makeId('r'); b2.set(docPath(id), { ...r, id }) }); await b2.commit()
    },
    reset: async () => { const ex = await getDocs(collPath()); const b = writeBatch(db); ex.forEach(d => b.delete(d.ref)); await b.commit() },
  }
}

const normOrder = makeNormalizer(orderSchema)
const normClient = makeNormalizer(clientSchema)
const normProduct = makeNormalizer(productSchema)

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
  const logs     = useCloudCollection(paths.logs, paths.logDoc, (r) => r, authKey)
  const inbox    = useCloudCollection(paths.inbox, paths.inboxDoc, (r) => r, authKey)
  const users    = useCloudCollection(paths.users, paths.user, (r) => r, authKey)
  const doubts   = useCloudCollection(paths.doubts, paths.doubt, (r) => r, authKey)

  useEffect(() => {
    let done = false
    const timer = setTimeout(() => { if (!done) setTimedOut(true) }, 12000)
    // probe the users collection (readable by any signed-in device, incl.
    // anonymous) so readiness resolves cleanly before Google sign-in — the
    // data collections are now allowlist-locked and would error under anon.
    const unsub = onSnapshot(paths.users(),
      () => { done = true; clearTimeout(timer); setReady(true) },
      (e) => { done = true; clearTimeout(timer); setError(e.message); setReady(true) })
    ensureSignedIn().catch((e) => { done = true; clearTimeout(timer); setError(e.message); setTimedOut(true) })
    return () => { clearTimeout(timer); unsub() }
  }, [])

  const log = useCallback((action, detail, by = 'user', ref = '') => {
    const id = makeId('log')
    // byEmail comes from the signed-in Google account, so the owner's review screen does not depend on the
    // role label a screen passes in
    setDoc(paths.logDoc(id), { id, ts: new Date().toISOString(), action, detail, by, ref, byEmail: (auth?.currentUser?.email || '').toLowerCase() })
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
      const n = Math.max(snap.exists() ? Number(snap.data().next) || 1 : 1, localNext)
      tx.set(ref, { next: n + 1, updatedAt: new Date().toISOString() }, { merge: true })
      return padOrderNo(n)
    })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    return Promise.race([viaCounter, timeout])
  }, [])

  const seededRef = useRef(false)
  useEffect(() => {
    // only seed once a real (allowlisted) user is signed in — writes are denied
    // for anonymous devices under the locked rules.
    const realUser = authKey !== 'anon' && authKey !== 'none'
    if (!ready || !realUser || seededRef.current) return
    seededRef.current = true
    if (products.list.length === 0) DEFAULT_PRODUCTS.forEach((name, i) => setDoc(paths.product(`seed_p${i + 1}`), { id: `seed_p${i + 1}`, name, order: i }))
  }, [ready, authKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
