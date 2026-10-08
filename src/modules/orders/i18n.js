/**
 * App language. Two choices: English ('en') and Hindi written the way the floor reads it ('hi', Hinglish).
 * The owner's app starts in English, everyone else's in Hindi; the EN / हिं button in the top bar switches it and
 * the choice is remembered on that phone.
 *   const L = useL();  L('Pending', 'Baaki')
 */
import { useSyncExternalStore } from 'react'

const KEY = 'ord:lang'
const read = () => { try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'hi' ? v : '' } catch { return '' } }
let chosen = read()        // '' = the user has not picked one yet
let lang = chosen || 'hi'
const subs = new Set()
const emit = () => subs.forEach((f) => f())

export const getLang = () => lang
export function setLang(l) { lang = l === 'en' ? 'en' : 'hi'; chosen = lang; try { localStorage.setItem(KEY, lang) } catch { /* private mode */ } emit() }
/** Default by role, used only until the user picks a language himself. */
export function defaultLangForRole(role) { if (!chosen) { const l = role === 'owner' ? 'en' : 'hi'; if (l !== lang) { lang = l; emit() } } }
/** Translate outside React (toasts built inside handlers use the hook's function instead). */
export const tr = (en, hi) => (lang === 'en' ? en : hi ?? en)
export function useL() {
  const l = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, getLang)
  return (en, hi) => (l === 'en' ? en : hi ?? en)
}
/** A manifest value may be a plain string or an [english, hindi] pair. */
export const pick = (L, v) => (Array.isArray(v) ? L(v[0], v[1]) : v)
