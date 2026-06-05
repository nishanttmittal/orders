/**
 * RoleChooser — pick Production Manager (orders + status, no money) or Owner
 * (everything + money + dashboard). Both password-protected.
 */
export default function RoleChooser({ title, icon, onPick }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-white">
      <div className="text-5xl mb-3">{icon}</div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-slate-400 text-sm mt-1 mb-8">Who are you?</p>
      <div className="w-full max-w-sm space-y-4">
        <button onClick={() => onPick('manager')} className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-2xl p-6 flex items-center gap-4 shadow-xl active:scale-95 transition-transform text-left">
          <div className="text-4xl w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">👨‍🏭</div>
          <div><div className="font-bold text-lg">Production Manager</div><div className="text-white/80 text-sm mt-0.5">Orders &amp; production status</div></div>
        </button>
        <button onClick={() => onPick('owner')} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-2xl p-6 flex items-center gap-4 shadow-xl active:scale-95 transition-transform text-left">
          <div className="text-4xl w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">🔑</div>
          <div><div className="font-bold text-lg">Owner</div><div className="text-white/80 text-sm mt-0.5">Everything + money + dashboard</div></div>
        </button>
      </div>
      <p className="text-slate-500 text-xs mt-8 text-center max-w-xs">Switch anytime from the top bar.</p>
    </div>
  )
}
