/**
 * Suggest — a text box that shows matching names right under it as you type; tap one to fill it in.
 * Used for Item and Customer. Typing "til ch" finds "Tilting Mechanism(Unico) … Chrome": every typed word only has
 * to appear somewhere in the name, and the factory's short forms are understood (tm = tilting, pm = pushback,
 * beeta/bita = beta, crome = chrome, pc = powder). Free typing is always allowed: a new name is simply kept.
 */
import { useMemo, useState } from 'react'
import { useL } from './i18n'
import { itemKey as norm } from './logic/itemName'

export default function Suggest({ value, onChange, onPick, options = [], placeholder = '', className = '' }) {
  const max = 80   // the list scrolls, so show every match (up to 80), not only the first few
  const [open, setOpen] = useState(false)
  const L = useL()
  const indexed = useMemo(() => options.map((o) => ({ o, key: norm(o.name) })), [options])
  const matches = useMemo(() => {
    const q = norm(value).split(' ').filter(Boolean)
    const hit = indexed.filter(({ key }) => q.every((w) => key.includes(w)))
    // most-used first (order), then names that START with what was typed, then alphabetical
    const first = q[0] || ''
    return hit.sort((a, b) => (Number(b.key.startsWith(first)) - Number(a.key.startsWith(first))) || ((a.o.order ?? 9999) - (b.o.order ?? 9999)) || a.o.name.localeCompare(b.o.name)).map((x) => x.o)
  }, [indexed, value])
  const exact = matches.length === 1 && matches[0].name.toLowerCase() === String(value || '').trim().toLowerCase()

  return (
    <div className="relative">
      <input value={value} placeholder={placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 250)} />
      {open && matches.length > 0 && !exact && (
        // A scrolling list: drag it up and down to see every match, tap one to pick it. Selection is on a real tap
        // (click), not on touch-down, so scrolling with a finger never picks an item by mistake.
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {matches.slice(0, max).map((o) => (
              <button key={o.id || o.name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick ? onPick(o) : onChange(o.name); setOpen(false) }}
                className="block w-full text-left px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100 last:border-b-0 active:bg-blue-50">
                {o.name}{o.unit && o.unit !== 'Nos' ? <span className="text-slate-400 font-normal"> · {o.unit}</span> : null}
              </button>
            ))}
          </div>
          <div className="px-4 py-1.5 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
            {matches.length > max ? L(`Showing ${max}, ${matches.length - max} more — type a little more`, `${max} dikh rahe hain, ${matches.length - max} aur — thoda aur likhein`) : matches.length > 5 ? L(`${matches.length} found — scroll down`, `${matches.length} mile — neeche scroll karein`) : L(`${matches.length} found`, `${matches.length} mile`)}
          </div>
        </div>
      )}
    </div>
  )
}
