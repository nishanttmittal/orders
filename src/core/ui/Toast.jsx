/**
 * useToast — tiny transient-message hook + Toast component. Reusable feedback
 * ("Saved!", "Deleted 3 entries") for any module.
 */
import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef()
  const show = useCallback((m, ms = 2500) => {
    clearTimeout(timer.current)   // an earlier message's timer must not wipe a later one
    setMsg(m)
    timer.current = setTimeout(() => setMsg(''), ms)
  }, [])
  return { msg, show }
}

// a message that says something did NOT happen is shown in red, whatever the caller passed
const BAD = /\bNOT\b|NAHI\b|No internet|Internet nahi|cannot|nahi sakt|not found|nahi mila|cancelled —|Enter |likhein|Only .* is pending|Baaki sirf|changed meanwhile|badal gaya/
export function Toast({ msg, tone }) {
  if (!msg) return null
  tone = tone || (BAD.test(String(msg)) ? 'error' : 'success')
  const tones = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-slate-800',
  }
  return (
    <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 ${tones[tone]} text-white rounded-2xl px-6 py-4 shadow-2xl font-bold text-base`}>
      {msg}
    </div>
  )
}
