/**
 * Delete password (owner's rule, 08-10-2026): anything the owner deletes in this app — an item or customer name, a
 * user, an order (cancel), or a restore that replaces data — asks for a password first.
 *
 * What it is: a guard against a wrong tap. The owner is already signed in with Google; this is a second "are you
 * sure, and is it really you" step. Only a salted slow hash of the word is kept here, never the word itself.
 * What it is not: real protection against someone technical. The check runs on the phone; the lasting protection
 * is the Firestore rule (only the owner's login may delete), which is the next step to add.
 */
import { tr } from './i18n'

// Kept as a salted, deliberately slow hash (PBKDF2, 600,000 rounds): this file is public, and a plain hash of a
// short word can be guessed back in seconds.
const DELETE_SALT = '96bf9faf909664230c7323b0fda5eb0a'
const DELETE_HASH = 'c82191a7d0010356fce554d8c7126098b4b04811fe9c2707f55b4d1d17af9e4d'

async function slowHash(text) {
  const enc = new TextEncoder()
  const salt = new Uint8Array(DELETE_SALT.match(/../g).map((x) => parseInt(x, 16)))
  const key = await crypto.subtle.importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits'])
  const buf = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, 256)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ask for the delete password. Resolves true only if it is right; says so if it is wrong. */
export async function askDeletePassword(what = '') {
  const typed = window.prompt(`${what ? what + '\n\n' : ''}${tr('Enter the delete password:', 'Delete password likhein:')}`)
  if (typed === null) return false
  const ok = await slowHash(typed.trim()).then((h) => h === DELETE_HASH).catch(() => false)
  if (!ok) window.alert(tr('Wrong password — nothing was deleted.', 'Password galat hai — kuch delete nahi hua.'))
  return ok
}
