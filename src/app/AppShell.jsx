/**
 * AppShell — mounts the Orders module Provider, then routes to a password-gated
 * console by role: Production Manager (owner=false, ownerOnly pages hidden, no
 * money) or Owner (owner=true, all pages, money + dashboard). Role remembered
 * per device.
 */
import { useState } from 'react'
import { getModule } from '../modules/registry'
import { PasswordGate } from '../core/ui'
import ModuleHome from './ModuleHome'
import NavBar from './NavBar'
import RoleChooser from './RoleChooser'

const ROLE_KEY = 'ord:role'

function RoleBar({ label, onSwitch }) {
  return (
    <div className="bg-slate-900 text-slate-300 px-4 py-2 flex items-center justify-between text-xs no-print">
      <span className="font-semibold tracking-wide uppercase">{label}</span>
      <button onClick={onSwitch} className="flex items-center gap-1 text-slate-400 hover:text-white font-medium">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" /></svg>
        Switch
      </button>
    </div>
  )
}

function Console({ module, owner, onSwitch }) {
  const [activeKey, setActiveKey] = useState(null)
  const pages = module.pages.filter(p => owner || !p.ownerOnly)
  const view = { ...module, pages }
  const activePage = pages.find(p => p.key === activeKey)
  return (
    <div className="min-h-screen bg-slate-50">
      <RoleBar label={owner ? 'Owner' : 'Production Manager'} onSwitch={onSwitch} />
      {activePage ? (
        <>
          <NavBar title={activePage.title} onHome={() => setActiveKey(null)} />
          <activePage.Component owner={owner} />
        </>
      ) : (
        <ModuleHome module={view} onOpen={setActiveKey} />
      )}
    </div>
  )
}

export default function AppShell({ moduleId }) {
  const module = getModule(moduleId)
  const { Provider } = module
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY))
  const pick = (r) => { localStorage.setItem(ROLE_KEY, r); setRole(r) }
  const reset = () => { localStorage.removeItem(ROLE_KEY); setRole(null) }

  return (
    <Provider>
      {!role && <RoleChooser title={module.title} icon={module.icon} onPick={pick} />}
      {role === 'manager' && (
        <PasswordGate password={[module.managerPassword, module.adminPassword]} title="Production Manager — Login">
          <Console module={module} owner={false} onSwitch={reset} />
        </PasswordGate>
      )}
      {role === 'owner' && (
        <PasswordGate password={module.adminPassword} title="Owner — Login">
          <Console module={module} owner={true} onSwitch={reset} />
        </PasswordGate>
      )}
    </Provider>
  )
}
