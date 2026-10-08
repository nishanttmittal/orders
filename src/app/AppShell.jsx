/**
 * AppShell — mounts the Orders module Provider, then gates access with Google
 * sign-in (AuthGate). Pages are filtered by the signed-in user's role:
 *   • employee — entry only (pages with roles incl. 'employee')
 *   • manager  — + review/order-book
 *   • owner    — everything (money, dashboard, admin)
 * `owner` prop (role === 'owner') still hides money fields from others.
 */
import { useEffect, useState } from 'react'
import { getModule } from '../modules/registry'
import ModuleHome from './ModuleHome'
import NavBar from './NavBar'
import AuthGate from './AuthGate'
import { useL, pick, getLang, setLang, defaultLangForRole } from '../modules/orders/i18n'

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', employee: 'Employee' }

function RoleBar({ role, email, onSignOut }) {
  return (
    <div className="bg-slate-900 text-slate-300 px-4 py-2 flex items-center justify-between text-xs no-print">
      <span className="font-semibold tracking-wide uppercase truncate">
        {ROLE_LABEL[role] || role}
        {email ? ` · ${email}` : ''}
      </span>
      <LangSwitch />
      <button onClick={onSignOut} className="flex items-center gap-1 text-slate-400 hover:text-white font-medium flex-shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        Sign out
      </button>
    </div>
  )
}

/** EN / हिं switch (remembered on this phone). */
function LangSwitch() {
  useL()   // re-render when the language changes
  const cur = getLang()
  return (
    <button onClick={() => setLang(cur === 'en' ? 'hi' : 'en')} className="flex-shrink-0 mx-2 px-2 py-0.5 rounded-md bg-white/10 text-white font-bold text-[11px]" aria-label="Language">
      <span className={cur === 'en' ? '' : 'opacity-40'}>EN</span> · <span className={cur === 'hi' ? '' : 'opacity-40'}>हिं</span>
    </button>
  )
}

function Console({ module, role, email, onSignOut }) {
  const [activeKey, setActiveKey] = useState(null)
  const owner = role === 'owner'
  const L = useL()
  useEffect(() => { defaultLangForRole(role) }, [role])   // owner starts in English, others in Hindi, until they choose
  // a page is visible if it declares this role (or declares no roles = all)
  const pages = module.pages.filter((p) => !p.roles || p.roles.includes(role))
  const view = { ...module, pages }
  const activePage = pages.find((p) => p.key === activeKey)
  return (
    <div className="min-h-screen bg-slate-50">
      <RoleBar role={role} email={email} onSignOut={onSignOut} />
      {activePage ? (
        <>
          <NavBar title={pick(L, activePage.title)} onHome={() => setActiveKey(null)} />
          <div className="pb-24"><activePage.Component owner={owner} role={role} /></div>
          {/* one-tap switch between the daily screens (no trip through Home) */}
          <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex no-print" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {pages.filter((p) => ['newOrder', 'orders', 'itemwise', 'doubts'].includes(p.key)).map((p) => (
              <button key={p.key} onClick={() => setActiveKey(p.key)} className={`flex-1 py-3 text-xs font-bold ${p.key === activeKey ? 'text-blue-600' : 'text-slate-500'}`}>
                <div className="text-lg leading-none mb-0.5">{p.icon}</div>{pick(L, p.title)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <ModuleHome module={view} onOpen={setActiveKey} owner={owner} />
      )}
    </div>
  )
}

export default function AppShell({ moduleId }) {
  const module = getModule(moduleId)
  const { Provider } = module
  return (
    <Provider>
      <AuthGate title={module.title} icon={module.icon}>
        {({ role, email, signOut }) => <Console module={module} role={role} email={email} onSignOut={signOut} />}
      </AuthGate>
    </Provider>
  )
}
