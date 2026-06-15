/**
 * OrdersContext — module state (orders + client/product masters + logs). Local
 * and Firestore providers share the same shape.
 */
import { createContext, useContext, useCallback } from 'react'
import { useCollection } from '../../core/hooks/useCollection'
import { ordersRepo, clientsRepo, productsRepo, logsRepo, lastUsedStore } from './data'
import { isFirebaseConfigured } from '../../core/db/firebaseConfig'
import { FirestoreProvider } from './FirestoreProvider'

const Ctx = createContext(null)
export { Ctx as OrdersCtx }

export function OrdersProvider({ children }) {
  return isFirebaseConfigured
    ? <FirestoreProvider>{children}</FirestoreProvider>
    : <LocalOrdersProvider>{children}</LocalOrdersProvider>
}

export function LocalOrdersProvider({ children }) {
  const orders   = useCollection(ordersRepo)
  const clients  = useCollection(clientsRepo)
  const products = useCollection(productsRepo)
  const logs     = useCollection(logsRepo)
  const log = useCallback((action, detail, by = 'user', ref = '') => {
    logs.insert({ ts: new Date().toISOString(), action, detail, by, ref })
  }, [logs])
  // WhatsApp inbox + users are cloud-only; stub them for local mode.
  const inbox = { list: [], insert: () => {}, update: () => {}, remove: () => {} }
  const users = { list: [], insert: () => {}, update: () => {}, remove: () => {} }
  const value = { orders, clients, products, logs, inbox, users, lastUsed: lastUsedStore, log, cloud: { connected: false, error: '' } }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOrders() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOrders must be used inside <OrdersProvider>')
  return v
}
