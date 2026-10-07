/**
 * UNICO Orders — schemas. An ORDER is one client order with multiple product
 * line items, a lifecycle status, and (owner-only) money fields.
 */
import { field } from '../../core/schema/field'
import { todayStr } from '../../core/utils/format'

export const orderSchema = [
  field({ name: 'orderNo',      label: 'Order No',      type: 'text',   default: '' }),
  field({ name: 'orderDate',    label: 'Order Date',    type: 'date',   default: todayStr, required: true }),
  field({ name: 'clientName',   label: 'Client',        type: 'text',   default: '', required: true }),
  field({ name: 'deliveryDate', label: 'Delivery Date', type: 'date',   default: '' }),
  // items: [{ product, finish, qty, unit, dispatched }]  (unit + dispatched added 08-10-2026; missing = 'Nos' / 0)
  field({ name: 'items',        label: 'Items',         type: 'list',   default: () => [] }),
  field({ name: 'transport',    label: 'Transport',     type: 'text',   default: '' }),
  field({ name: 'remarks',      label: 'Remarks',       type: 'text',   default: '' }),
  field({ name: 'status',       label: 'Status',        type: 'text',   default: 'pending' }),
  // Owner-only money fields.
  field({ name: 'price',        label: 'Price (₹)',     type: 'number', default: 0 }),
  field({ name: 'advance',      label: 'Advance (₹)',   type: 'number', default: 0 }),
  field({ name: 'createdBy',    label: 'By',            type: 'text',   default: '' }),
  // 08-10-2026 additions (all optional):
  //   source: 'app' | 'scan'   scanKey: WhatsApp scan reference
  //   mirror: { status: 'none'|'pending'|'queued'|'sent'|'held'|'failed'|'uncertain', text, why }  — the one clean
  //           line posted to the staff order group by the laptop job (never remarks / transport / money)
  field({ name: 'source',       label: 'Source',        type: 'text',   default: '' }),
  field({ name: 'scanKey',      label: 'Scan key',      type: 'text',   default: '' }),
  field({ name: 'mirror',       label: 'Group post',    type: 'object', default: () => ({ status: 'none' }) }),
  field({ name: 'test',         label: 'Test',          type: 'bool',   default: false }),
]

export const clientSchema = [field({ name: 'name', label: 'Client', type: 'text', default: '', required: true })]
export const productSchema = [field({ name: 'name', label: 'Product', type: 'text', default: '', required: true })]
