/**
 * UNICO Orders — module manifest. Two roles: Production Manager (orders + status,
 * NO money) and Owner (everything + price/advance + dashboard). Pages flagged
 * ownerOnly are hidden from the manager; pages receive an `owner` prop.
 */
import { OrdersProvider, useOrders } from './OrdersContext'
import { ADMIN_PASSWORD, MANAGER_PASSWORD } from './config'
import { isOverdue } from './logic/orders'
import NewOrder from './pages/NewOrder'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import WhatsAppInbox from './pages/WhatsAppInbox'

function HomeStats() {
  const { orders } = useOrders()
  const open = orders.list.filter(o => o.status !== 'dispatched').length
  const overdue = orders.list.filter(isOverdue).length
  const stat = (n, l, tone = '') => <div className="bg-white/10 rounded-xl px-4 py-2.5 flex-1 text-center"><div className={`text-2xl font-bold ${tone}`}>{n}</div><div className="text-xs text-slate-400 mt-0.5">{l}</div></div>
  return <div className="mt-4 flex gap-3">{stat(orders.list.length, 'Orders')}{stat(open, 'Open')}{stat(overdue, 'Overdue', overdue ? 'text-red-300' : '')}</div>
}

export const ordersModule = {
  id: 'orders',
  title: 'UNICO Orders',
  icon: '📋',
  Provider: OrdersProvider,
  HomeStats,
  adminPassword: ADMIN_PASSWORD,
  managerPassword: MANAGER_PASSWORD,
  // roles: which signed-in roles see each page. employee = entry only.
  pages: [
    { key: 'newOrder',  title: 'New Order',  desc: 'Enter a client order',     icon: '➕', color: 'from-blue-600 to-blue-700',     roles: ['employee', 'manager', 'owner'], Component: NewOrder },
    { key: 'orders',    title: 'Order Book', desc: 'All orders, status & due',  icon: '📋', color: 'from-indigo-600 to-indigo-700', roles: ['employee', 'manager', 'owner'], Component: Orders },
    { key: 'whatsapp',  title: 'WhatsApp Inbox', desc: 'Review AI orders from WhatsApp', icon: '📥', color: 'from-green-600 to-green-700', roles: ['manager', 'owner'], Component: WhatsAppInbox },
    { key: 'dashboard', title: 'Dashboard',  desc: 'Money & delivery view',     icon: '📊', color: 'from-emerald-600 to-emerald-700', roles: ['owner'], Component: Dashboard },
    { key: 'admin',     title: 'Admin',      desc: 'Products, clients, backup, users', icon: '⚙️', color: 'from-slate-600 to-slate-700', roles: ['owner'], Component: Admin },
  ],
}
