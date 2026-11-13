// Unit tests for finding recurring charges (shared/recurring.ts).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN } from '../shared/categories.ts'
import { addMonths, recurring } from '../shared/recurring.ts'

const charge = (merchant_key, posted, amount_cents, category = 'entertainment', extra = {}) =>
  ({ account: 'visa', posted, amount_cents, merchant_key, payee: '', description: merchant_key.toUpperCase(), category, ...extra })

/** One charge per month on `day`, from `from` (YYYY-MM) for `n` months. */
const monthly = (key, from, n, amount, day = 5, category) =>
  Array.from({ length: n }, (_, i) => {
    const ymd = addMonths(`${from}-${String(day).padStart(2, '0')}`, i)
    return charge(key, ymd, typeof amount === 'function' ? amount(i) : amount, category)
  })

const TODAY = '2026-11-13'

describe('addMonths', () => {
  test('keeps the day, or the month\'s last when it has fewer', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
    assert.equal(addMonths('2026-11-15', 2), '2027-01-15')
    assert.equal(addMonths('2024-02-29', 12), '2025-02-28')
  })
})

describe('recurring', () => {
  test('finds a monthly subscription, with its next date and yearly cost', () => {
    const r = recurring(monthly('netflix com', '2026-05', 7, -1549), BUILT_IN, TODAY)
    assert.equal(r.items.length, 1)
    const [n] = r.items
    assert.deepEqual([n.cadence, n.amount_cents, n.varies, n.count, n.last, n.next, n.stopped], ['monthly', 1549, false, 7, '2026-11-05', '2026-12-05', false])
    assert.equal(n.yearly_cents, 1549 * 12)
    assert.equal(r.yearly_cents, 1549 * 12)
    assert.equal(r.monthly_cents, 1549)
    assert.equal(n.name, 'NETFLIX COM')
  })

  test('needs three charges', () => {
    assert.equal(recurring(monthly('gym', '2026-09', 2, -3000), BUILT_IN, TODAY).items.length, 0)
    assert.equal(recurring(monthly('gym', '2026-09', 3, -3000), BUILT_IN, TODAY).items.length, 1)
  })

  test('takes a few days early or late, and one missed month', () => {
    const dates = ['2026-05-03', '2026-06-01', '2026-07-06', '2026-09-02', '2026-10-04', '2026-11-03']
    const r = recurring(dates.map(d => charge('spotify', d, -1199)), BUILT_IN, TODAY)
    assert.deepEqual(r.items.map(i => [i.cadence, i.count]), [['monthly', 6]])
  })

  test('tells weekly, every two weeks, quarterly and yearly apart', () => {
    const every = (key, start, days, n, amount) => Array.from({ length: n }, (_, i) =>
      charge(key, new Date(Date.parse(`${start}T00:00:00Z`) + i * days * 86_400_000).toISOString().slice(0, 10), amount))
    const rows = [
      ...every('car wash', '2026-09-04', 7, 10, -1500),
      ...every('lawn care', '2026-07-03', 14, 10, -4500),
      ...['2026-02-20', '2026-05-20', '2026-08-20'].map(d => charge('water softener', d, -6000)),
      ...['2024-03-01', '2025-03-02', '2026-03-01'].map(d => charge('amazon prime', d, -13900)),
    ]
    const r = recurring(rows, BUILT_IN, TODAY)
    const by = Object.fromEntries(r.items.map(i => [i.key, i]))
    assert.equal(by['car wash'].cadence, 'weekly')
    assert.equal(by['car wash'].yearly_cents, 1500 * 52)
    assert.equal(by['lawn care'].cadence, 'biweekly')
    assert.equal(by['water softener'].cadence, 'quarterly')
    assert.equal(by['water softener'].next, '2026-11-20')
    assert.equal(by['amazon prime'].cadence, 'yearly')
    assert.equal(by['amazon prime'].next, '2027-03-01')
    assert.deepEqual(r.items.map(i => i.key), ['lawn care', 'car wash', 'water softener', 'amazon prime'])
  })

  test('flags a price rise after the price stayed the same', () => {
    const rows = monthly('netflix com', '2026-05', 7, i => (i < 6 ? -1549 : -1799))
    const [n] = recurring(rows, BUILT_IN, TODAY).items
    assert.deepEqual(n.change, { from_cents: 1549, to_cents: 1799, on: '2026-11-05' })
    assert.equal(n.amount_cents, 1799)
    assert.equal(n.varies, false)
    assert.equal(n.count, 7)
  })

  test('averages a bill that changes every month, without calling it a price change', () => {
    const amounts = [-8412, -9230, -12050, -10400, -7700, -6980]
    const [b] = recurring(monthly('city power', '2026-05', 6, i => amounts[i], 18, 'utilities'), BUILT_IN, TODAY).items
    assert.equal(b.varies, true)
    assert.equal(b.change, null)
    assert.equal(b.amount_cents, Math.round((10400 + 7700 + 6980) / 3))
  })

  test('says a charge stopped once it is well past due, and forgets it after a while', () => {
    const r = recurring(monthly('hulu', '2026-03', 6, -999), BUILT_IN, TODAY)
    assert.equal(r.items.length, 0)
    assert.deepEqual(r.stopped.map(s => [s.key, s.last, s.next]), [['hulu', '2026-08-05', '2026-09-05']])
    assert.equal(r.yearly_cents, 0)
    const old = recurring(monthly('hulu', '2025-03', 6, -999), BUILT_IN, TODAY)
    assert.deepEqual([old.items.length, old.stopped.length], [0, 0])
  })

  test('a charge a few days late is due, not stopped', () => {
    const [d] = recurring(monthly('gym', '2026-07', 4, -3000, 1), BUILT_IN, TODAY).items
    assert.deepEqual([d.next, d.stopped], ['2026-11-01', false])
  })

  test('keeps two subscriptions from one merchant apart', () => {
    const rows = [...monthly('apple com', '2026-06', 6, -299, 2), ...monthly('apple com', '2026-06', 6, -1099, 20)]
    const r = recurring(rows, BUILT_IN, TODAY)
    assert.deepEqual(r.items.map(i => [i.key, i.amount_cents]), [['apple com 2', 1099], ['apple com', 299]])
  })

  test('a shop visited on a schedule, for different amounts, is not a subscription', () => {
    const amounts = [-4210, -11833, -6502, -9120, -3888, -7400]
    const rows = monthly('trader joe', '2026-06', 6, i => amounts[i], 7, 'groceries')
    assert.equal(recurring(rows, BUILT_IN, TODAY).items.length, 0)
  })

  test('irregular charges are not recurring', () => {
    const dates = ['2026-05-02', '2026-05-19', '2026-07-01', '2026-07-04', '2026-09-22', '2026-10-30']
    assert.equal(recurring(dates.map(d => charge('netflix com', d, -1549)), BUILT_IN, TODAY).items.length, 0)
  })

  test('only spending counts: not money in, transfers, pending rows, or rows with no merchant', () => {
    const rows = [
      ...monthly('payroll', '2026-05', 6, 250000, 1, 'income'),
      ...monthly('payroll', '2026-05', 6, -250000, 1, 'income'),
      ...monthly('card payment', '2026-05', 6, -50000, 1, 'transfer'),
      ...monthly('', '2026-05', 6, -1000),
      ...monthly('netflix com', '2026-05', 6, -1549).map(c => ({ ...c, pending: true })),
    ]
    assert.equal(recurring(rows, BUILT_IN, TODAY).items.length, 0)
  })

  test('counts a person\'s own category as spending, and a retried charge once', () => {
    const list = [...BUILT_IN, { id: 'c-abcdefghijklmno', label: 'Kids', spending: true, custom: true }]
    const rows = monthly('piano lessons', '2026-06', 5, -12000, 10, 'c-abcdefghijklmno')
    rows.push({ ...rows.at(-1) })
    const [p] = recurring(rows, list, TODAY).items
    assert.deepEqual([p.count, p.category], [5, 'c-abcdefghijklmno'])
  })

  test('names it by the latest charge\'s payee', () => {
    const rows = monthly('netflix com', '2026-08', 3, -1549)
    rows[2] = { ...rows[2], payee: 'Netflix' }
    assert.equal(recurring(rows, BUILT_IN, TODAY).items[0].name, 'Netflix')
  })
})

describe('recurring, prices', () => {
  test('a price that creeps up every time is not a subscription', () => {
    const rows = monthly('corner cafe', '2026-06', 5, i => -(425 + i * 100))
    assert.equal(recurring(rows, BUILT_IN, TODAY).items.length, 0)
  })

  test('a price that moves a little with the exchange rate is still one, about its average', () => {
    const amounts = [-1013, -1008, -1011, -1006]
    const [r] = recurring(monthly('foreign app', '2026-07', 4, i => amounts[i]), BUILT_IN, TODAY).items
    assert.deepEqual([r.varies, r.amount_cents, r.change], [true, Math.round((1008 + 1011 + 1006) / 3), null])
  })
})
