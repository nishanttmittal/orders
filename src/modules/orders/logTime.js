/** When a log entry was made, as an ISO string: the server's clock (`at`) when the entry has it, else the phone's
 *  own stamp (`ts`, older entries or an entry still on its way to the server). */
export const logTime = (l) => {
  const at = l?.at
  if (at && typeof at.toDate === 'function') { try { return at.toDate().toISOString() } catch { /* fall through */ } }
  if (at && typeof at.seconds === 'number') return new Date(at.seconds * 1000).toISOString()
  return l?.ts || ''
}
