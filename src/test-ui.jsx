import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import './index.css'
import { LocalOrdersProvider, useOrders } from './modules/orders/OrdersContext'
import Orders from './modules/orders/pages/Orders'
function Seed() {
  const { orders } = useOrders(); const [d, setD] = useState(false)
  useEffect(() => { if (d) return; setD(true); if (orders.list.length) return
    const it = (product, qty) => ({ product, finish: '', qty, unit: 'Nos', dispatched: 0 })
    orders.insert({ id: 'a', orderNo: 'UO-0025', orderDate: '2026-10-07', clientName: 'Polestar', items: [it('Vista', 170), it('Beeta Powder', 250), it('Pushback', 600), it('Beeta Chrome', 300)], status: 'pending', mirror: { status: 'none' } })
    orders.insert({ id: 'b', orderNo: 'UO-0047', orderDate: '2026-10-08', clientName: 'polestar ', items: [it('Pushback', 600), it('Tilting', 600), it('Beta chrome', 200)], status: 'pending', mirror: { status: 'none' } })
    orders.insert({ id: 'c', orderNo: 'UO-0030', orderDate: '2026-10-07', clientName: 'Saraf', items: [it('Tilting', 50)], status: 'pending', mirror: { status: 'none' } })
  }, []) // eslint-disable-line
  return null
}
createRoot(document.getElementById('root')).render(<LocalOrdersProvider><Seed /><Orders role="manager" /></LocalOrdersProvider>)
