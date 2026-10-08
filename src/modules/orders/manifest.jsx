/**
 * UNICO Orders — module manifest. Two roles: Production Manager (orders + status,
 * NO money) and Owner (everything + price/advance + dashboard). Pages flagged
 * ownerOnly are hidden from the manager; pages receive an `owner` prop.
 */
import { OrdersProvider, useOrders } from './OrdersContext'
import { isOverdue } from './logic/orders'
import NewOrder from './pages/NewOrder'
import Orders from './pages/Orders'
import Doubts from './pages/Doubts'
import ItemWise from './pages/ItemWise'
import DayReport from './pages/DayReport'
import { useL } from './i18n'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'

function HomeStats() {
  const { orders, doubts } = useOrders()
  const L = useL()
  const open = orders.list.filter(o => o.status !== 'dispatched' && o.status !== 'cancelled').length
  const overdue = orders.list.filter(isOverdue).length
  const stat = (n, l, tone = '') => <div className="bg-white/10 rounded-xl px-4 py-2.5 flex-1 text-center"><div className={`text-2xl font-bold ${tone}`}>{n}</div><div className="text-xs text-slate-400 mt-0.5">{l}</div></div>
  const doubtN = (doubts?.list || []).filter(d => d.status !== 'cleared').length
  return <div className="mt-4 flex gap-3">{stat(open, L('Pending orders', 'Baaki order'))}{stat(doubtN, 'Doubt', doubtN ? 'text-amber-300' : '')}{stat(overdue, L('Delivery late', 'Delivery late'), overdue ? 'text-red-300' : '')}</div>
}

export const ordersModule = {
  id: 'orders',
  title: 'UNICO Orders',
  icon: '📋',
  Provider: OrdersProvider,
  HomeStats,
  // roles: which signed-in roles see each page. employee = entry only.
  // title / desc are [English, Hindi] pairs (see i18n.js). Daily screens first.
  pages: [
    { key: 'newOrder',  title: ['New Order', 'New Order'],         desc: ['Enter a new order', 'Naya order likhein'],                 icon: '➕', color: 'from-blue-600 to-blue-700',       roles: ['employee', 'manager', 'owner'], Component: NewOrder },
    { key: 'orders',    title: ['Orders', 'Orders'],               desc: ['Pending orders · mark dispatch', 'Baaki order · maal gaya'], icon: '📋', color: 'from-indigo-600 to-indigo-700',   roles: ['employee', 'manager', 'owner'], Component: Orders },
    { key: 'itemwise',  title: ['Item-wise Pending', 'Item-wise Baaki'], desc: ['What to make — total per item', 'Kya banana hai — item ka total'], icon: '🏭', color: 'from-teal-600 to-teal-700', roles: ['manager', 'owner'], Component: ItemWise },
    { key: 'doubts',    title: ['Doubt', 'Doubt'],                 desc: ['Not clear yet — settle them', 'Jo pakka nahi — clear karein'], icon: '❓', color: 'from-amber-500 to-amber-600',     roles: ['manager', 'owner'], Component: Doubts },
    // WhatsApp Inbox tile hidden 08-10-2026: orders found on WhatsApp are approved by the owner's reply and arrive
    // here already created, so a second review screen would only add a step. (pages/WhatsAppInbox.jsx is kept.)
    { key: 'report',    title: ['Day Report', 'Din ka Report'],    desc: ['Dispatch client-wise · every change', 'Maal gaya client-wise · har badlav'], icon: '📊', color: 'from-sky-600 to-sky-700', roles: ['owner'], Component: DayReport },
    { key: 'dashboard', title: ['Money', 'Paisa'],                 desc: ['Order value, advance, outstanding', 'Order value, advance, baaki paisa'], icon: '💰', color: 'from-emerald-600 to-emerald-700', roles: ['owner'], Component: Dashboard },
    { key: 'admin',     title: ['Admin', 'Admin'],                 desc: ['Items, customers, users, backup', 'Item, customer, user, backup'], icon: '⚙️', color: 'from-slate-600 to-slate-700', roles: ['owner'], Component: Admin },
  ],
}
