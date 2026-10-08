/**
 * Delete password (owner's rule, 08-10-2026): anything the owner deletes in this app — an item or customer name, a
 * user, an order (cancel), or a restore that replaces data — asks for a password first.
 *
 * What it is: a guard against a wrong tap. The owner is already signed in with Google; this is a second "are you
 * sure, and is it really you" step. Only the SHA-256 of the word is kept here, never the word itself.
 * What it is not: real protection against someone technical. The check runs on the phone; the lasting protection
 * is the Firestore rule (only the owner's login may delete), which is the next step to add.
 */
import { tr } from './i18n'

const DELETE_HASH = 'c8356fe4fc3ed0554e721b8f8348d658696d8a1b1ea657dddbe70164d6a4fa61'

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ask for the delete password. Resolves true only if it is right; says so if it is wrong. */
export async function askDeletePassword(what = '') {
  const typed = window.prompt(`${what ? what + '\n\n' : ''}${tr('Enter the delete password:', 'Delete password likhein:')}`)
  if (typed === null) return false
  const ok = await sha256(typed.trim()).then((h) => h === DELETE_HASH).catch(() => false)
  if (!ok) window.alert(tr('Wrong password — nothing was deleted.', 'Password galat hai — kuch delete nahi hua.'))
  return ok
}
