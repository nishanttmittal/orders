/**
 * Firestore-backed Orders state — real-time, offline-capable. Same shape as the
 * local provider. Seeds the product master on first run (idempotent).
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { onSnapshot, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore'
import { db, paths, ensureSignedIn } from '../../core/db/firebase'
import { makeNormalizer } from '../../core/schema/field'
import { makeId } from '../../core/db/repository'
import { orderSchema, clientSchema, productSchema } from './schema'
import { DEFAULT_PRODUCTS } from './config'
import { lastUsedStore } from './data'
import { OrdersCtx } from './OrdersContext'

function useCloudCollection(collPath, docPath, normalize) {
  const [list, setList] = useState([])
  useEffect(() => {
    const unsub = onSnapshot(collPath(), (snap) => setList(snap.docs.map(d => normalize({ id: d.id, ...d.data() }))))
    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    list,
    insert: (rec) => { const id = rec.id || makeId('r'); const row = { createdAt: new Date().toISOString(), ...rec, id }; setDoc(docPath(id), row); return row },
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

  const orders   = useCloudCollection(paths.orders, paths.order, normOrder)
  const clients  = useCloudCollection(paths.clients, paths.client, normClient)
  const products = useCloudCollection(paths.products, paths.product, normProduct)
  const logs     = useCloudCollection(paths.logs, paths.logDoc, (r) => r)

  useEffect(() => {
    let done = false
    const timer = setTimeout(() => { if (!done) setTimedOut(true) }, 12000)
    const unsub = onSnapshot(paths.products(),
      () => { done = true; clearTimeout(timer); setReady(true) },
      (e) => { done = true; clearTimeout(timer); setError(e.message); setReady(true) })
    ensureSignedIn().catch((e) => { done = true; clearTimeout(timer); setError(e.message); setTimedOut(true) })
    return () => { clearTimeout(timer); unsub() }
  }, [])

  const log = useCallback((action, detail, by = 'user', ref = '') => {
    const id = makeId('log')
    setDoc(paths.logDoc(id), { id, ts: new Date().toISOString(), action, detail, by, ref })
  }, [])

  const seededRef = useRef(false)
  useEffect(() => {
    if (!ready || seededRef.current) return
    seededRef.current = true
    if (products.list.length === 0) DEFAULT_PRODUCTS.forEach((name, i) => setDoc(paths.product(`seed_p${i + 1}`), { id: `seed_p${i + 1}`, name, order: i }))
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const value = { orders, clients, products, logs, lastUsed: lastUsedStore, log, cloud: { connected: !error, error } }
  return <OrdersCtx.Provider value={value}>{children}</OrdersCtx.Provider>
}
