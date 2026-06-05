/**
 * UNICO Orders — data access. Orders accumulate; clients/products are masters.
 */
import { createCollection, createSingleton, makeId } from '../../core/db/repository'
import { makeNormalizer } from '../../core/schema/field'
import { orderSchema, clientSchema, productSchema } from './schema'
import { KEYS, DEFAULT_PRODUCTS } from './config'

export const ordersRepo = createCollection(KEYS.orders, {
  seed: () => [],
  normalize: makeNormalizer(orderSchema),
})
export const clientsRepo = createCollection(KEYS.clients, {
  seed: () => [],
  normalize: makeNormalizer(clientSchema),
})
export const productsRepo = createCollection(KEYS.products, {
  seed: () => DEFAULT_PRODUCTS.map((name, i) => ({ id: makeId('p'), name, order: i })),
  normalize: makeNormalizer(productSchema),
})
export const logsRepo = createCollection(KEYS.logs, { seed: () => [] })
export const lastUsedStore = createSingleton(KEYS.lastUsed, {})
