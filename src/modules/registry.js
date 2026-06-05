/** Module registry — the orders app's single module. */
import { ordersModule } from './orders/manifest'

export const modules = [ordersModule]
export const getModule = (id) => modules.find(m => m.id === id) || modules[0]
