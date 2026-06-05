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
  // items: [{ product, finish, qty }]
  field({ name: 'items',        label: 'Items',         type: 'list',   default: () => [] }),
  field({ name: 'transport',    label: 'Transport',     type: 'text',   default: '' }),
  field({ name: 'remarks',      label: 'Remarks',       type: 'text',   default: '' }),
  field({ name: 'status',       label: 'Status',        type: 'text',   default: 'pending' }),
  // Owner-only money fields.
  field({ name: 'price',        label: 'Price (₹)',     type: 'number', default: 0 }),
  field({ name: 'advance',      label: 'Advance (₹)',   type: 'number', default: 0 }),
  field({ name: 'createdBy',    label: 'By',            type: 'text',   default: '' }),
]

export const clientSchema = [field({ name: 'name', label: 'Client', type: 'text', default: '', required: true })]
export const productSchema = [field({ name: 'name', label: 'Product', type: 'text', default: '', required: true })]
