/** Top navigation bar shown inside a module page; "Home" returns to the grid. */
export default function NavBar({ title, onHome }) {
  return (
    <header className="bg-slate-800 text-white px-4 py-3 flex items-center gap-3 shadow-lg no-print">
      <button onClick={onHome} className="flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Home
      </button>
      <div className="h-4 w-px bg-slate-600" />
      <h1 className="text-base font-semibold">{title}</h1>
    </header>
  )
}
