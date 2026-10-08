// Emulator tests for the CANDIDATE Orders rules (orders/rules/firestore.rules.candidate).
// Each test is something the live app really does (taken from the app code), or something it must never allow.
import { test, before, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'

const RULES = process.env.RULES || '/home/nishel/orders/rules/firestore.rules.candidate'
const OWNER = 'nspenterprises24@gmail.com', MGR = 'anshulgoel5884@gmail.com', EMP = 'employee@example.com', OFF = 'inactive@example.com', STRANGER = 'stranger@example.com'
let env
const dbOf = (email, provider = 'google.com', verified = true) => env.authenticatedContext(email.replace(/[^a-z0-9]/g, ''), { email, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore()
const anonDb = () => env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const O = 'apps/orders/orders', P = 'apps/orders/products', C = 'apps/orders/clients', LG = 'apps/orders/logs', D = 'apps/orders/doubts', M = 'apps/orders/meta'
const order = (over = {}) => ({ id: 'o1', orderNo: 'UO-0100', orderDate: '2026-10-08', clientName: 'Polestar', items: [{ product: 'Tilting', finish: '', qty: 320, unit: 'Nos', dispatched: 0 }, { product: 'Pushback', finish: '', qty: 100, unit: 'Nos', dispatched: 0 }], status: 'pending', price: 0, advance: 0, createdBy: 'manager', createdByEmail: MGR, source: 'app', mirror: { status: 'pending' }, createdAt: '2026-10-08T05:00:00.000Z', ...over })
const seed = async (path, data) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data) })

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'unico-operations', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8089) } })
  await seed('apps/orders/users/' + MGR, { email: MGR, role: 'manager', active: true })
  await seed('apps/orders/users/' + EMP, { email: EMP, role: 'employee', active: true })
  await seed('apps/orders/users/' + OFF, { email: OFF, role: 'manager', active: false })
  await seed(O + '/o1', order())
  await seed(O + '/oOwner', order({ id: 'oOwner', orderNo: 'UO-0101', price: 50000, advance: 10000, createdBy: 'owner', createdByEmail: OWNER }))
  await seed(O + '/oHeld', order({ id: 'oHeld', orderNo: 'UO-0098', mirror: { status: 'held', why: 'x', text: 'UO-0098 …' } }))
  await seed(O + '/oSent', order({ id: 'oSent', orderNo: 'UO-0097', mirror: { status: 'sent', outboxId: 'ordapp_x' }, groupNotes: [{ id: 'g1', kind: 'EDIT', lines: ['Tilting : 320 Nos'], status: 'sent', at: 'x', by: MGR }] }))
  await seed(O + '/oCancelled', order({ id: 'oCancelled', orderNo: 'UO-0102', status: 'cancelled' }))
  await seed(P + '/p1', { id: 'p1', name: 'Tilting', order: 1 }); await seed(C + '/c1', { name: 'Polestar' })
  await seed(LG + '/l1', { id: 'l1', ts: '2026-10-08T05:00:00.000Z', action: 'ORDER', detail: 'x', by: 'manager', byEmail: MGR })
  await seed(D + '/d1', { id: 'd1', customer: 'Sahibabad', question: 'Synchro kitna?', lines: [], orderId: 'o1', orderNo: 'UO-0100', source: 'kagaz', status: 'open', createdAt: '2026-10-08T05:00:00.000Z' })
  await seed(M + '/counter', { next: 100 })
})
after(async () => { await env?.cleanup() })

// ---------- what the MANAGER's app really does: must work ----------
test('manager: reads orders, products, clients, doubts, counter', async () => {
  const d = dbOf(MGR)
  await assertSucceeds(getDocs(collection(d, O))); await assertSucceeds(getDocs(collection(d, P))); await assertSucceeds(getDocs(collection(d, C)))
  await assertSucceeds(getDocs(collection(d, D))); await assertSucceeds(getDoc(doc(d, M, 'counter'))); await assertSucceeds(getDocs(collection(d, 'apps/orders/users')))
})
test('manager: new order stamped with his own email, no money', async () => { await assertSucceeds(setDoc(doc(dbOf(MGR), O, 'n1'), order({ id: 'n1', orderNo: 'UO-0099' }))) })
test('manager: order-number counter transaction (goes up)', async () => {
  const d = dbOf(MGR)
  await assertSucceeds(runTransaction(d, async (tx) => { const s = await tx.get(doc(d, M, 'counter')); tx.set(doc(d, M, 'counter'), { next: s.data().next + 1, updatedAt: 'x' }, { merge: true }) }))
})
test('manager: dispatch entry in a transaction (items changed, status, lastDispatchAt)', async () => {
  const d = dbOf(MGR)
  await assertSucceeds(runTransaction(d, async (tx) => { const s = await tx.get(doc(d, O, 'o1')); const items = s.data().items.map((it, i) => (i === 0 ? { ...it, dispatched: 120, log: [{ at: 'x', qty: 120, by: 'manager' }] } : it)); tx.set(doc(d, O, 'o1'), { items, status: 'pending', lastDispatchAt: 'x' }, { merge: true }) }))
})
test('manager: correct an order (customer + qty), add a line with an ADD note, resend the group line', async () => {
  const d = dbOf(MGR), o = order()
  await assertSucceeds(setDoc(doc(d, O, 'o1'), { clientName: 'Polestar Inc', items: [{ ...o.items[0], qty: 400, dispatched: 120 }, o.items[1], { product: 'Synchro', finish: '', qty: 100, unit: 'Nos', dispatched: 0 }], status: 'pending', groupNotes: [{ id: 'n1', kind: 'ADD', lines: ['Synchro : 100 Nos'], status: 'pending', at: 'x', by: MGR }], notePending: true, editedAt: 'x', editedBy: 'manager' }, { merge: true }))
  await assertSucceeds(setDoc(doc(d, O, 'oHeld'), { mirror: { status: 'pending', retry: 1, why: '' } }, { merge: true }))   // "Send now" on a failed line
})
test('manager: adds a customer and an item name; writes a log line as himself; settles a doubt', async () => {
  const d = dbOf(MGR)
  await assertSucceeds(setDoc(doc(d, C, 'c2'), { name: 'New Party', createdAt: 'x' })); await assertSucceeds(setDoc(doc(d, P, 'p2'), { name: 'New Item', order: 999, unit: 'Nos' }))
  await assertSucceeds(setDoc(doc(d, LG, 'l2'), { id: 'l2', ts: 'x', at: serverTimestamp(), action: 'DISPATCH', detail: 'UO-0100 · Polestar · Tilting +120 Nos', by: 'manager', ref: 'o1', byEmail: MGR }))
  await assertSucceeds(setDoc(doc(d, D, 'd1'), { status: 'cleared', outcome: 'order me joda', clearedAt: 'x', clearedBy: 'manager', clearedByEmail: MGR, addedLines: [{ product: 'Synchro', qty: 100 }] }, { merge: true }))
})

test('manager: customer-wise dispatch — several orders changed in ONE transaction', async () => {
  const d = dbOf(MGR)
  for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) await seed(O + '/' + id, order({ id, orderNo: 'UO-009' + id.slice(1) }))
  await assertSucceeds(runTransaction(d, async (tx) => {
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], snaps = []
    for (const id of ids) snaps.push(await tx.get(doc(d, O, id)))
    snaps.forEach((s2, n) => tx.set(doc(d, O, ids[n]), { items: s2.data().items.map((it, i) => (i === 0 ? { ...it, dispatched: 320, log: [{ at: 'x', qty: 320, by: 'manager' }] } : it)), status: 'pending', lastDispatchAt: 'x' }, { merge: true }))
  }))
})

// ---------- what the manager must NEVER be able to do ----------
test('manager: cannot delete an order, a customer, an item, a log line, a doubt', async () => {
  const d = dbOf(MGR)
  await assertFails(deleteDoc(doc(d, O, 'oOwner'))); await assertFails(deleteDoc(doc(d, C, 'c1'))); await assertFails(deleteDoc(doc(d, P, 'p1'))); await assertFails(deleteDoc(doc(d, LG, 'l1'))); await assertFails(deleteDoc(doc(d, D, 'd1')))
})
test('manager: cannot remove a line from an order', async () => { await assertFails(setDoc(doc(dbOf(MGR), O, 'oOwner'), { items: [order().items[0]] }, { merge: true })) })
test('manager: cannot cancel an order, or change a cancelled one', async () => {
  await assertFails(setDoc(doc(dbOf(MGR), O, 'oOwner'), { status: 'cancelled' }, { merge: true })); await assertFails(setDoc(doc(dbOf(MGR), O, 'oCancelled'), { status: 'pending' }, { merge: true }))
})
test('manager: cannot change money, the order number, or whose order it is', async () => {
  const d = dbOf(MGR)
  await assertFails(setDoc(doc(d, O, 'oOwner'), { price: 1 }, { merge: true })); await assertFails(setDoc(doc(d, O, 'oOwner'), { advance: 0 }, { merge: true }))
  await assertFails(setDoc(doc(d, O, 'oOwner'), { orderNo: 'UO-0001' }, { merge: true })); await assertFails(setDoc(doc(d, O, 'oOwner'), { createdByEmail: MGR }, { merge: true }))
})
test('manager: cannot create an order in someone else\'s name, or with money in it', async () => {
  await assertFails(setDoc(doc(dbOf(MGR), O, 'n2'), order({ id: 'n2', createdByEmail: OWNER }))); await assertFails(setDoc(doc(dbOf(MGR), O, 'n3'), order({ id: 'n3', price: 500 })))
})
test('manager: cannot rename or overwrite an existing customer / item name', async () => {
  await assertFails(setDoc(doc(dbOf(MGR), C, 'c1'), { name: 'Changed' })); await assertFails(updateDoc(doc(dbOf(MGR), P, 'p1'), { name: 'Changed' }))
})
test('manager: cannot read the change log, edit a log line, or write one in another name', async () => {
  const d = dbOf(MGR)
  await assertFails(getDocs(collection(d, LG))); await assertFails(updateDoc(doc(d, LG, 'l1'), { detail: 'clean' })); await assertFails(setDoc(doc(d, LG, 'l3'), { id: 'l3', ts: 'x', at: serverTimestamp(), action: 'ORDER', detail: 'x', by: 'owner', byEmail: OWNER }))
  await assertFails(setDoc(doc(d, LG, 'l4'), { id: 'l4', ts: 'x', at: serverTimestamp(), action: 'ORDER', detail: 'x', by: 'manager' }))
})
test('manager: cannot back-date a log line, sign it as "owner", or add unknown fields', async () => {
  const d = dbOf(MGR), base = { ts: 'x', action: 'ORDER', detail: 'x', by: 'manager', byEmail: MGR }
  await assertFails(setDoc(doc(d, LG, 'l5'), { id: 'l5', ...base }))                                                        // no server time
  await assertFails(setDoc(doc(d, LG, 'l6'), { id: 'l6', ...base, at: Timestamp.fromDate(new Date('2026-10-01T10:00:00Z')) })) // a time he picked
  await assertFails(setDoc(doc(d, LG, 'l7'), { id: 'l7', ...base, at: serverTimestamp(), by: 'owner' }))                    // owner's label on his entry
  await assertFails(setDoc(doc(d, LG, 'l8'), { id: 'l8', ...base, at: serverTimestamp(), extra: 'x' }))
  await assertFails(setDoc(doc(d, LG, 'l2'), { id: 'l2', ...base, at: serverTimestamp(), detail: 'overwritten' }))          // overwrite an existing entry
})
test('manager: cannot throw the counter far ahead, or save an order with a made-up number / no items', async () => {
  const d = dbOf(MGR)
  await assertFails(runTransaction(d, async (tx) => { const s2 = await tx.get(doc(d, M, 'counter')); tx.set(doc(d, M, 'counter'), { next: s2.data().next + 5000 }, { merge: true }) }))
  await assertFails(setDoc(doc(d, O, 'n5'), order({ id: 'n5', orderNo: 'FREE TEXT' }))); await assertFails(setDoc(doc(d, O, 'n6'), order({ id: 'n6', orderNo: 'UO-0106', items: [] })))
})
test('manager: cannot move the counter back, or rewrite a doubt question', async () => {
  await assertFails(setDoc(doc(dbOf(MGR), M, 'counter'), { next: 1 }, { merge: true })); await assertFails(setDoc(doc(dbOf(MGR), D, 'd1'), { question: 'kuch nahi' }, { merge: true }))
})
test('manager: cannot change the users list (make himself owner)', async () => { await assertFails(setDoc(doc(dbOf(MGR), 'apps/orders/users', MGR), { role: 'owner' }, { merge: true })) })

test('manager: cannot mark a group line as sent, re-send a line that already went, or make a sent note go again', async () => {
  const d = dbOf(MGR)
  await assertFails(setDoc(doc(d, O, 'o1'), { mirror: { status: 'sent' } }, { merge: true }))          // hide a waiting post
  await assertFails(setDoc(doc(d, O, 'oSent'), { mirror: { status: 'pending' } }, { merge: true }))    // post the same order twice
  await assertFails(setDoc(doc(d, O, 'oHeld'), { mirror: { status: 'pending', text: 'anything' } }, { merge: true }))
  await assertFails(setDoc(doc(d, O, 'oSent'), { groupNotes: [{ id: 'g1', kind: 'EDIT', lines: ['Tilting : 320 Nos'], status: 'pending', at: 'x', by: MGR }], notePending: true }, { merge: true }))
  await assertFails(setDoc(doc(d, O, 'oSent'), { groupNotes: [{ id: 'g1', kind: 'EDIT', lines: ['Tilting : 320 Nos'], status: 'sent', at: 'x', by: MGR }, { id: 'g2', kind: 'EDIT', lines: ['x : 1 Nos'], status: 'pending', at: 'x', by: OWNER }], notePending: true }, { merge: true }))   // signed as someone else
  await assertFails(setDoc(doc(d, O, 'oSent'), { remarks: 'changed', deliveryDate: '2027-01-01' }, { merge: true }))   // fields outside the allowed list
  await assertSucceeds(setDoc(doc(d, O, 'oSent'), { groupNotes: [{ id: 'g1', kind: 'EDIT', lines: ['Tilting : 320 Nos'], status: 'sent', at: 'x', by: MGR }, { id: 'g2', kind: 'EDIT', lines: ['Tilting : 300 Nos'], status: 'pending', at: 'x', by: MGR }], notePending: true }, { merge: true }))
})
test('manager: cannot use an order number the counter has not given out, or write an AUDIT entry', async () => {
  const d = dbOf(MGR)
  await assertFails(setDoc(doc(d, O, 'n7'), order({ id: 'n7', orderNo: 'UO-999999' }))); await assertFails(setDoc(doc(d, O, 'n8'), order({ id: 'n8', orderNo: 'UO-0500' })))
  await assertFails(setDoc(doc(d, O, 'n9'), order({ id: 'n9', orderNo: 'UO-0095', mirror: { status: 'sent' } })))
  await assertFails(setDoc(doc(d, LG, 'l9'), { id: 'l9', ts: 'x', at: serverTimestamp(), action: 'AUDIT', detail: 'all fine', by: 'laptop audit', byEmail: MGR }))
  await assertFails(setDoc(doc(d, LG, 'l10'), { id: 'l10', ts: 'x', at: serverTimestamp(), action: 'AUDIT', detail: 'all fine', by: 'laptop audit', byEmail: 'laptop-audit' }))
})
test('users list: the manager can read it (his app needs it); a stranger, an inactive user and an anonymous device cannot', async () => {
  await assertSucceeds(getDocs(collection(dbOf(MGR), 'apps/orders/users'))); await assertSucceeds(getDocs(collection(dbOf(OWNER), 'apps/orders/users')))
  for (const d of [dbOf(STRANGER), dbOf(OFF), anonDb()]) await assertFails(getDocs(collection(d, 'apps/orders/users')))
})

// ---------- owner: everything the Admin / owner screens do ----------
test('owner: money, cancel, remove a line, delete a name, read logs, delete an order', async () => {
  const d = dbOf(OWNER)
  await assertSucceeds(setDoc(doc(d, O, 'oOwner'), { price: 60000, advance: 20000 }, { merge: true })); await assertSucceeds(setDoc(doc(d, O, 'oOwner'), { items: [order().items[0]] }, { merge: true }))
  await assertSucceeds(setDoc(doc(d, O, 'oOwner'), { status: 'cancelled', cancelledAt: 'x', cancelledBy: 'owner', cancelReason: 'test' }, { merge: true }))
  await assertSucceeds(getDocs(collection(d, LG))); await assertSucceeds(deleteDoc(doc(d, P, 'p2'))); await assertSucceeds(deleteDoc(doc(d, C, 'c2'))); await assertSucceeds(deleteDoc(doc(d, O, 'n1')))
  await assertSucceeds(setDoc(doc(d, 'apps/orders/users', 'new@example.com'), { email: 'new@example.com', role: 'employee', active: true }))
})
test('owner: even the owner cannot edit or delete a log line', async () => { await assertFails(updateDoc(doc(dbOf(OWNER), LG, 'l1'), { detail: 'x' })); await assertFails(deleteDoc(doc(dbOf(OWNER), LG, 'l1'))) })

// ---------- everyone else ----------
test('employee: may enter an order without a group line, nothing more', async () => {
  const d = dbOf(EMP)
  await assertSucceeds(setDoc(doc(d, O, 'e1'), order({ id: 'e1', orderNo: 'UO-0096', createdBy: 'employee', createdByEmail: EMP, mirror: { status: 'none' } })))
  await assertFails(setDoc(doc(d, O, 'e2'), order({ id: 'e2', createdBy: 'employee', createdByEmail: EMP, mirror: { status: 'pending' } })))
  await assertFails(setDoc(doc(d, O, 'o1'), { clientName: 'x' }, { merge: true })); await assertFails(setDoc(doc(d, P, 'p9'), { name: 'x' })); await assertFails(getDocs(collection(d, D)))
})
test('inactive user, stranger, anonymous device, password account, unverified email: nothing', async () => {
  for (const d of [dbOf(OFF), dbOf(STRANGER), anonDb(), dbOf(MGR, 'password'), dbOf(MGR, 'google.com', false)]) {
    await assertFails(getDocs(collection(d, O))); await assertFails(setDoc(doc(d, O, 'x1'), order({ id: 'x1' }))); await assertFails(getDocs(collection(d, P))); await assertFails(getDoc(doc(d, M, 'counter')))
  }
})
