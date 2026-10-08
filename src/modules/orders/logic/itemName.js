/**
 * One spelling for an item name, so "Beeta Chrome", "beta chrome" and "Beta cr" are treated as the same item
 * (used by the suggestion list and by the customer-wise total in the order book). Only for matching — the name
 * the user typed is what is stored and shown.
 */
const SYN = [
  [/\bt\.?m\b|\btil\s*til\b|\btelting\b|\btitling\b/g, 'tilting'], [/\bp\.?m\b|\bp\.?b\b|\bpush\s*back\b|\bpushbek\b/g, 'pushback'],
  [/\bb[ei]+ta\b/g, 'beta'], [/\bc(h)?o?r[oa]?me?\b|\bcr\b/g, 'chrome'], [/\bp\.?c\b/g, 'powder'], [/\bs[iy]n[ck]h?ro\b|\bsingh?ro\b/g, 'synchro'],
  [/\bplet\b|\bpilet\b/g, 'plate'], [/\bta+pp?er\b/g, 'taper'], [/\bpuna\b|\bpoona\b/g, 'pune'], [/\bpaip\b/g, 'pipe'],
]
export const itemKey = (t) => { let x = ' ' + String(t || '').toLowerCase().replace(/[()"'.,/\\-]+/g, ' ') + ' '; for (const [re, to] of SYN) x = x.replace(re, to); return x.replace(/\s+/g, ' ').trim() }

