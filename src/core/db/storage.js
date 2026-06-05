/**
 * Storage Adapter — single low-level gateway, swappable backend, namespaced keys.
 */
const APP_PREFIX = 'ord:' // orders app namespace

const localStorageAdapter = {
  getRaw(key) { try { const r = localStorage.getItem(APP_PREFIX + key); return r == null ? null : JSON.parse(r) } catch { return null } },
  setRaw(key, value) { localStorage.setItem(APP_PREFIX + key, JSON.stringify(value)) },
  remove(key) { localStorage.removeItem(APP_PREFIX + key) },
  keys() { return Object.keys(localStorage).filter(k => k.startsWith(APP_PREFIX)).map(k => k.slice(APP_PREFIX.length)) },
}

let activeAdapter = localStorageAdapter
export function setStorageAdapter(adapter) { activeAdapter = adapter }
export const storage = {
  get: (key) => activeAdapter.getRaw(key),
  set: (key, value) => activeAdapter.setRaw(key, value),
  remove: (key) => activeAdapter.remove(key),
  keys: () => activeAdapter.keys(),
}
