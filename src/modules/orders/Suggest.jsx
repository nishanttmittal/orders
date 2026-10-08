/**
 * Suggest — a text box that shows matching names right under it as you type; tap one to fill it in.
 * Used for Item and Customer. Typing "til ch" finds "Tilting Mechanism(Unico) … Chrome": every typed word only has
 * to appear somewhere in the name, and the factory's short forms are understood (tm = tilting, pm = pushback,
 * beeta/bita = beta, crome = chrome, pc = powder). Free typing is always allowed: a new name is simply kept.
 */
import { useMemo, useState } from 'react'

const SYN = [
  [/\bt\.?m\b|\btil\s*til\b|\btelting\b|\btitling\b/g, 'tilting'], [/\bp\.?m\b|\bp\.?b\b|\bpush\s*back\b|\bpushbek\b/g, 'pushback'],
  [/\bb[ei]+ta\b/g, 'beta'], [/\bc(h)?o?r[oa]?me?\b|\bcr\b/g, 'chrome'], [/\bp\.?c\b/g, 'powder'], [/\bs[iy]n[ck]h?ro\b|\bsingh?ro\b/g, 'synchro'],
  [/\bplet\b|\bpilet\b/g, 'plate'], [/\bta+pp?er\b/g, 'taper'], [/\bpuna\b|\bpoona\b/g, 'pune'], [/\bpaip\b/g, 'pipe'],
]
const norm = (t) => { let x = ' ' + String(t || '').toLowerCase().replace(/[()"'.,/\\-]+/g, ' ') + ' '; for (const [re, to] of SYN) x = x.replace(re, to); return x.replace(/\s+/g, ' ').trim() }

export default function Suggest({ value, onChange, onPick, options = [], placeholder = '', className = '', max = 8 }) {
  const [open, setOpen] = useState(false)
  const indexed = useMemo(() => options.map((o) => ({ o, key: norm(o.name) })), [options])
  const matches = useMemo(() => {
    const q = norm(value).split(' ').filter(Boolean)
    const hit = indexed.filter(({ key }) => q.every((w) => key.includes(w)))
    // most-used first (order), then names that START with what was typed, then alphabetical
    const first = q[0] || ''
    return hit.sort((a, b) => (Number(b.key.startsWith(first)) - Number(a.key.startsWith(first))) || ((a.o.order ?? 9999) - (b.o.order ?? 9999)) || a.o.name.localeCompare(b.o.name)).slice(0, max).map((x) => x.o)
  }, [indexed, value, max])
  const exact = matches.length === 1 && matches[0].name.toLowerCase() === String(value || '').trim().toLowerCase()

  return (
    <div className="relative">
      <input value={value} placeholder={placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && !exact && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          {matches.map((o) => (
            <button key={o.id || o.name} type="button" onPointerDown={(e) => { e.preventDefault(); onPick ? onPick(o) : onChange(o.name); setOpen(false) }}
              className="block w-full text-left px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100 last:border-b-0 active:bg-blue-50">
              {o.name}{o.unit && o.unit !== 'Nos' ? <span className="text-slate-400 font-normal"> · {o.unit}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
