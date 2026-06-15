/**
 * UNICO Orders module — configuration.
 */
export const APP_TITLE = 'UNICO Orders'

/** Bootstrap owner(s) — always have full access, even before any user is added.
 *  Everyone else signs in with Google and is granted a role in Admin → Users. */
export const OWNER_EMAILS = ['nspenterprises24@gmail.com']

/** Legacy password gate (kept only as reference; app now uses Google login). */
export const ADMIN_PASSWORD = '6133923_N'
export const MANAGER_PASSWORD = 'nsp@123'

/** Finishes available per order line (per-product). */
export const FINISHES = ['Chrome', 'Powder', 'Gold', 'Rose Gold', 'Raw']

/** Order lifecycle stages. */
export const STATUSES = [
  { key: 'pending',    label: 'Pending',       color: 'bg-slate-100 text-slate-600' },
  { key: 'production', label: 'In Production', color: 'bg-amber-100 text-amber-700' },
  { key: 'ready',      label: 'Ready',         color: 'bg-blue-100 text-blue-700' },
  { key: 'dispatched', label: 'Dispatched',    color: 'bg-emerald-100 text-emerald-700' },
]
export const statusMeta = (k) => STATUSES.find(s => s.key === k) || STATUSES[0]

/** Product master (UNICO metal furniture; editable in admin). */
export const DEFAULT_PRODUCTS = [
  'Spider', 'Beeta', 'Pune', 'Stool', 'Fan', 'Air', 'Wave',
  'Spider 20"', 'Frame Nickel 1.5"', 'Vista', 'Mona', '1" Frame', '1.25" Frame', 'Burfi',
]

export const KEYS = {
  orders:   'orders',
  clients:  'clients',
  products: 'products',
  logs:     'logs',
  lastUsed: 'last_used',
}
