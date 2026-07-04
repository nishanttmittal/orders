/**
 * AuthGate — Google sign-in for UNICO Orders. Three roles, resolved by email
 * against the Users & Access allowlist (Admin → Users):
 *   • owner    — bootstrap OWNER_EMAILS or a users-doc role 'owner' (active)
 *   • manager  — users-doc role 'manager' (active)
 *   • employee — users-doc role 'employee' (active) — entry only (log orders)
 * Children render only with a valid role. An email that isn't on the list gets
 * a "no access" screen. This is what locks the data to real people.
 */
import { useEffect, useState } from 'react'
import { signInWithGoogle, signOutUser, watchAuth } from '../core/db/firebase'
import { useOrders } from '../modules/orders/OrdersContext'
import { OWNER_EMAILS } from '../modules/orders/config'

/** 'owner' | 'manager' | 'employee' | null for an email against the users list. */
export function resolveRole(email, users) {
  if (!email) return null
  const e = email.toLowerCase()
  if (OWNER_EMAILS.map((x) => x.toLowerCase()).includes(e)) return 'owner'
  const u = (users || []).find((u) => (u.email || '').toLowerCase() === e && u.active !== false)
  if (!u) return null
  if (u.role === 'owner') return 'owner'
  if (u.role === 'employee') return 'employee'
  return 'manager'
}

function Screen({ children }) {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-white text-center"
      style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}
    >
      {children}
    </div>
  )
}

export default function AuthGate({ title = 'UNICO Orders', icon = '📋', children }) {
  const { users } = useOrders()
  const [user, setUser] = useState(undefined) // undefined = loading
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => watchAuth(setUser), [])

  const email = user && !user.isAnonymous ? user.email || '' : ''
  const role = resolveRole(email, users.list)

  const doSignIn = async () => {
    setBusy(true)
    setErr('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setErr(e?.message || 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  if (user === undefined) {
    return (
      <Screen>
        <div className="text-2xl">🔐</div>
        <div className="text-sm text-slate-300 mt-2">Checking sign-in…</div>
      </Screen>
    )
  }
  if (email && role) return children({ role, email, signOut: signOutUser })
  if (email && !role) {
    return (
      <Screen>
        <div className="text-4xl mb-3">🚫</div>
        <h1 className="text-xl font-bold">No access</h1>
        <p className="text-slate-400 text-sm mt-2 max-w-xs">
          {email} is not authorised. Ask the owner to add you in Admin → Users &amp; Access.
        </p>
        <button onClick={signOutUser} className="mt-6 bg-white/15 rounded-xl px-5 py-2.5 font-bold text-sm">
          Use a different account
        </button>
      </Screen>
    )
  }
  return (
    <Screen>
      <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center p-2.5 mb-4 shadow-xl">
        <img src={`${import.meta.env.BASE_URL}unico-logo.png`} alt="UNICO" className="max-w-full max-h-full object-contain" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-slate-400 text-sm mt-1 mb-8">Sign in to continue</p>
      <button
        onClick={doSignIn}
        disabled={busy}
        className="w-full max-w-xs bg-white text-slate-800 rounded-2xl px-6 py-4 font-bold shadow-xl active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-3"
      >
        <span className="text-lg">🟦</span>
        {busy ? 'Opening…' : 'Sign in with Google'}
      </button>
      {err && <p className="text-red-300 text-xs mt-4 max-w-xs">{err}</p>}
    </Screen>
  )
}
