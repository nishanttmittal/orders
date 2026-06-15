/**
 * Firebase service for UNICO Orders. Shares the `unico-operations` project under
 * namespace apps/orders so the combined ERP dashboard can read it.
 *   apps/orders/orders/{id}     ← one doc per client order
 *   apps/orders/clients/{id}    ← client master (autocomplete)
 *   apps/orders/products/{id}   ← product master
 *   apps/orders/logs/{id}
 * Offline-capable (persistent cache).
 */
import { initializeApp, getApp } from 'firebase/app'
import {
  initializeFirestore, collection, doc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup,
} from 'firebase/auth'
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig'

const APP_NS = 'orders'

let app = null, db = null, auth = null
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalAutoDetectLongPolling: true,
  })
  auth = getAuth(app)
}
export { app, db, auth, isFirebaseConfigured, APP_NS }

const coll = (name) => collection(db, 'apps', APP_NS, name)
const cdoc = (name, id) => doc(db, 'apps', APP_NS, name, id)

export const paths = {
  orders: () => coll('orders'),
  order: (id) => cdoc('orders', id),
  clients: () => coll('clients'),
  client: (id) => cdoc('clients', id),
  products: () => coll('products'),
  product: (id) => cdoc('products', id),
  logs: () => coll('logs'),
  logDoc: (id) => cdoc('logs', id),
  // AI-extracted order suggestions from the WhatsApp bridge (review queue).
  inbox: () => coll('whatsapp_inbox'),
  inboxDoc: (id) => cdoc('whatsapp_inbox', id),
  // Users & Access allowlist (Google email -> role). Read by any signed-in
  // device to resolve role; written by owner only (see Firestore rules).
  users: () => coll('users'),
  user: (id) => cdoc('users', id),
}

// ── Main-session Google auth (so Firestore rules see the email + role) ───────
export async function signInWithGoogle() {
  if (!auth) throw new Error('Cloud not configured')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}
export function signOutUser() {
  if (auth) auth.signOut().catch(() => {})
}
export function watchAuth(cb) {
  if (!auth) { cb(null); return () => {} }
  return onAuthStateChanged(auth, cb)
}

export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    if (!auth) return reject(new Error('Firebase not configured'))
    const unsub = onAuthStateChanged(auth, (user) => { if (user) { unsub(); resolve(user.uid) } })
    signInAnonymously(auth).catch(reject)
  })
}

export async function verifyAdminGoogle() {
  if (!isFirebaseConfigured) throw new Error('Cloud not configured')
  const NAME = 'adminVerify'
  let secondary
  try { secondary = getApp(NAME) } catch { secondary = initializeApp(firebaseConfig, NAME) }
  const aAuth = getAuth(secondary)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(aAuth, provider)
  const email = (cred.user.email || '').toLowerCase()
  await aAuth.signOut().catch(() => {})
  return email
}
