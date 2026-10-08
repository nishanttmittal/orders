/**
 * OrdersContext — module state (orders + client/product masters + logs). Local
 * and Firestore providers share the same shape.
 */
import { createContext, useContext, useCallback } from 'react'
import { useCollection } from '../../core/hooks/useCollection'
import { ordersRepo, clientsRepo, productsRepo, logsRepo, doubtsRepo, lastUsedStore } from './data'
import { isFirebaseConfigured } from '../../core/db/firebaseConfig'
import { nextOrderNo } from './orderNo'
import { FirestoreProvider } from './FirestoreProvider'

const Ctx = createContext(null)
export { Ctx as OrdersCtx }

export function OrdersProvider({ children }) {
  return isFirebaseConfigured
    ? <FirestoreProvider>{children}</FirestoreProvider>
    : <LocalOrdersProvider>{children}</LocalOrdersProvider>
}

export function LocalOrdersProvider({ children }) {
  const base     = useCollection(ordersRepo)
  const orders   = { ...base,
    insertSafe: async (rec) => ({ row: base.insert(rec), where: 'cloud' }),
    updateSafe: async (id, patch) => { base.update(id, patch); return 'cloud' },
    changeMany: async (ids, fn) => { const patches = fn(base.list.filter((o) => ids.includes(o.id))); for (const [id, patch] of Object.entries(patches)) base.update(id, patch); return patches },
    change: async (id, fn) => { const cur = base.list.find((o) => o.id === id); if (!cur) throw new Error('Record nahi mila'); const patch = fn(cur); base.update(id, patch); return patch },
  }
  // local mode (no cloud): the "safe" writes are the plain ones
  const safe = (c) => ({ ...c, state: 'ok', insertSafe: async (rec) => ({ row: c.insert(rec), where: 'cloud' }), updateSafe: async (id, patch) => { c.update(id, patch); return 'cloud' } })
  const clients  = safe(useCollection(clientsRepo))
  const products = safe(useCollection(productsRepo))
  const logs     = useCollection(logsRepo)
  const log = useCallback((action, detail, by = 'user', ref = '') => {
    logs.insert({ ts: new Date().toISOString(), action, detail, by, ref })
  }, [logs])
  // WhatsApp inbox + users are cloud-only; stub them for local mode.
  const inbox = { list: [], insert: () => {}, update: () => {}, remove: () => {} }
  const users = { list: [], state: 'ok', insert: () => {}, update: () => {}, remove: () => {}, insertSafe: async () => ({}), updateSafe: async () => 'cloud' }
  const doubts = safe(useCollection(doubtsRepo))
  const allocOrderNo = async () => nextOrderNo(orders.list)
  const value = { orders, clients, products, logs, inbox, users, doubts, lastUsed: lastUsedStore, log, allocOrderNo, cloud: { connected: false, error: '' } }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOrders() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOrders must be used inside <OrdersProvider>')
  return v
}
