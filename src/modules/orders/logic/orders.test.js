// Unit tests for the order arithmetic (the part where a wrong number costs real goods). Run: npm test
import { describe, it, expect } from 'vitest'
import { lineSent, lineBalance, orderBalance, orderSent, orderUnit, linesLeft, isOpen, applyDispatch, undoLastDispatch, dispatchAll, groupLine, itemsQty } from './orders'

const order = (over = {}) => ({ id: 'o', status: 'pending', items: [{ product: 'Tilting', finish: '', qty: 320, unit: 'Nos', dispatched: 0 }, { product: 'Taper Pipe (Kg)', finish: '', qty: 2.5, unit: 'kg', dispatched: 0 }], ...over })

describe('balances', () => {
  it('a new order: everything pending', () => { const o = order(); expect(orderBalance(o)).toBe(322.5); expect(orderSent(o)).toBe(0); expect(linesLeft(o)).toBe(2); expect(isOpen(o)).toBe(true) })
  it('old record without per-line dispatched: Dispatched status = fully sent, otherwise nothing sent', () => {
    const items = [{ product: 'Vista', qty: 100 }]
    expect(lineSent({ status: 'dispatched', items }, items[0])).toBe(100); expect(lineBalance({ status: 'dispatched', items }, items[0])).toBe(0)
    expect(lineSent({ status: 'pending', items }, items[0])).toBe(0); expect(lineBalance({ status: 'pending', items }, items[0])).toBe(100)
  })
  it('sent is never more than ordered, balance never negative', () => { const o = order(); o.items[0].dispatched = 999; expect(lineSent(o, o.items[0])).toBe(320); expect(lineBalance(o, o.items[0])).toBe(0) })
  it('mixed units: no single unit, lines counted', () => { expect(orderUnit(order())).toBe(''); expect(orderUnit({ items: [{ qty: 1 }, { qty: 2, unit: 'Nos' }] })).toBe('Nos') })
  it('survives odd records', () => { expect(orderBalance({})).toBe(0); expect(itemsQty({ items: [{ qty: 'x' }, { qty: '5' }] })).toBe(5); expect(linesLeft({ items: [] })).toBe(0) })
})

describe('dispatch', () => {
  it('partial dispatch reduces the balance and logs the entry', () => {
    const o = order(); const n = applyDispatch(o, 0, 120, 'manager')
    expect(n.items[0].dispatched).toBe(120); expect(n.items[0].log).toHaveLength(1); expect(n.items[0].log[0].qty).toBe(120); expect(n.status).toBe('pending')
    expect(lineBalance({ ...o, ...n }, n.items[0])).toBe(200); expect(o.items[0].dispatched).toBe(0)   // the input order is not mutated
  })
  it('the last piece closes the order', () => {
    let o = order(); o = { ...o, ...applyDispatch(o, 0, 320) }; expect(o.status).toBe('pending')
    o = { ...o, ...applyDispatch(o, 1, 2.5) }; expect(o.status).toBe('dispatched'); expect(orderBalance(o)).toBe(0); expect(isOpen(o)).toBe(false)
  })
  it('more than the balance is refused; zero, negative and junk are refused', () => {
    const o = order()
    expect(() => applyDispatch(o, 0, 321)).toThrow(/Baaki sirf/); expect(() => applyDispatch(o, 0, 0)).toThrow(); expect(() => applyDispatch(o, 0, -5)).toThrow(); expect(() => applyDispatch(o, 0, 'abc')).toThrow(); expect(() => applyDispatch(o, 9, 1)).toThrow()
  })
  it('decimal kg: 0.1 + 0.2 style sums stay exact to 2 places', () => {
    let o = order({ items: [{ product: 'Pipe', qty: 1, unit: 'kg', dispatched: 0 }] })
    o = { ...o, ...applyDispatch(o, 0, 0.1) }; o = { ...o, ...applyDispatch(o, 0, 0.2) }; expect(o.items[0].dispatched).toBe(0.3)
    o = { ...o, ...applyDispatch(o, 0, 0.7) }; expect(o.status).toBe('dispatched')
  })
  it('undo takes back only the last entry and re-opens a closed order', () => {
    let o = order({ items: [{ product: 'Tilting', qty: 100, unit: 'Nos', dispatched: 0 }] })
    o = { ...o, ...applyDispatch(o, 0, 40) }; o = { ...o, ...applyDispatch(o, 0, 60) }; expect(o.status).toBe('dispatched')
    o = { ...o, ...undoLastDispatch(o, 0) }; expect(o.items[0].dispatched).toBe(40); expect(o.items[0].log).toHaveLength(1); expect(o.status).toBe('pending')
    o = { ...o, ...undoLastDispatch(o, 0) }; expect(o.items[0].dispatched).toBe(0); expect(o.items[0].log).toHaveLength(0)
    o = { ...o, ...undoLastDispatch(o, 0) }; expect(o.items[0].dispatched).toBe(0)   // nothing left to undo: stays at zero
  })
  it('undo on a line with no log (old record) clears it', () => { const o = { status: 'dispatched', items: [{ product: 'Vista', qty: 100 }] }; const n = undoLastDispatch(o, 0); expect(n.items[0].dispatched).toBe(0); expect(n.status).toBe('pending') })
  it('whole-order dispatch logs only what was still pending', () => {
    let o = order(); o = { ...o, ...applyDispatch(o, 0, 300) }; const n = dispatchAll(o, 'owner')
    expect(n.status).toBe('dispatched'); expect(n.items[0].dispatched).toBe(320); expect(n.items[0].log.map((e) => e.qty)).toEqual([300, 20]); expect(n.items[1].log.map((e) => e.qty)).toEqual([2.5])
  })
  it('a dispatch on one line never changes another line', () => { const o = order(); o.items[1].dispatched = 1; const n = applyDispatch(o, 0, 10); expect(n.items[1].dispatched).toBe(1); expect(n.items[1].log).toBeUndefined() })
})

describe('group line', () => {
  it('finish is not repeated when the item name already says it', () => {
    expect(groupLine({ product: 'Beta chrome', finish: 'Chrome', qty: 48, unit: 'Nos' })).toBe('Beta chrome : 48 Nos')
    expect(groupLine({ product: 'Tilting', finish: 'Powder', qty: 5 })).toBe('Tilting Powder : 5 Nos'); expect(groupLine({ product: 'Taper Pipe (Kg)', qty: 250.5, unit: 'kg' })).toBe('Taper Pipe (Kg) : 250.5 kg')
  })
})
