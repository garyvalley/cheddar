// Unit tests for Projections' sums (shared/projections.ts): the savings rate,
// each debt's pace and payoff, and the investments' growth to retirement.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { debts, invested, monthsAfter, payoff, project, savings } from '../shared/projections.ts'

const acct = (id, kind, balance_cents, balance_date = '2026-11-09') => ({ id, name: id, kind, balance_cents, balance_date })
const month = (m, income_cents, spent_cents) => ({ month: m, label: m, income_cents, spent_cents })

describe('savings', () => {
  test('averages the months that had any money in or out', () => {
    const s = savings([month('2026-05', 0, 0), month('2026-06', 500000, 300000), month('2026-07', 500000, 400000)])
    assert.deepEqual(s, { months_counted: 2, income_cents: 500000, spent_cents: 350000, kept_cents: 150000, rate: 0.3 })
  })

  test('is negative when spending is more, and has no rate without income', () => {
    assert.equal(savings([month('2026-06', 100000, 150000)]).rate, -0.5)
    assert.equal(savings([month('2026-06', 0, 150000)]).rate, null)
    assert.equal(savings([]).months_counted, 0)
  })
})

describe('debts', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

  test('are paced by payments less charges, from the first month the account has any', () => {
    const rows = [
      { account: 'visa', posted: '2026-09-03', amount_cents: 50000 },
      { account: 'visa', posted: '2026-09-10', amount_cents: -20000 },
      { account: 'visa', posted: '2026-10-03', amount_cents: 50000 },
      { account: 'visa', posted: '2026-11-01', amount_cents: 99999 }, // this month: not counted
      { account: 'chk', posted: '2026-10-03', amount_cents: -50000 },
    ]
    const [d] = debts([acct('visa', 'credit_card', -300000), acct('chk', 'checking', 100)], rows, [], months)
    assert.deepEqual(d, { id: 'visa', name: 'visa', kind: 'credit_card', owed_cents: 300000, paydown_cents: 40000, basis: 'transactions' })
  })

  test('without transactions, are paced by balances at least four weeks apart', () => {
    const history = [
      { account: 'car', date: '2026-08-11', balance_cents: -1060000 },
      { account: 'car', date: '2026-11-01', balance_cents: -1010000 },
      { account: 'car', date: '2026-11-09', balance_cents: -1000000 },
    ]
    const [d] = debts([acct('car', 'loan', -1000000)], [], history, months)
    assert.equal(d.basis, 'balances')
    assert.ok(Math.abs(d.paydown_cents - 20000) < 300, String(d.paydown_cents))
    assert.equal(debts([acct('car', 'loan', -1000000)], [], history.slice(1), months)[0].paydown_cents, null)
  })

  test('leave out what owes nothing, and come biggest first', () => {
    const list = debts([acct('a', 'credit_card', 0), acct('b', 'loan', -100), acct('c', 'loan', -900), acct('d', 'loan', null, '')], [], [], ['2026-10'])
    assert.deepEqual(list.map(d => d.id), ['c', 'b'])
  })
})

describe('payoff', () => {
  test('without interest is the owed over the payment, rounded up', () => {
    assert.deepEqual(payoff(100000, 30000), { months: 4, interest_cents: 0 })
    assert.equal(payoff(100000, 0), null)
    assert.deepEqual(payoff(0, 0), { months: 0, interest_cents: 0 })
  })

  test('with interest matches the amortization formula', () => {
    // $10,000 at 6% for 60 months is $193.33 a month.
    const p = payoff(1000000, 19333, 0.06)
    assert.equal(p.months, 60)
    assert.ok(Math.abs(p.interest_cents - (19333 * 60 - 1000000)) < 100, String(p.interest_cents))
  })

  test('never ends when the payment doesn\'t outrun the interest, or takes over a century', () => {
    assert.equal(payoff(1000000, 10000, 0.12), null)
    assert.equal(payoff(1000000, 100), null)
  })

  test('lands in the right month', () => {
    assert.equal(monthsAfter('2026-11-09', 0), '2026-11')
    assert.equal(monthsAfter('2026-11-09', 2), '2027-01')
    assert.equal(monthsAfter('2026-11-09', 26), '2029-01')
  })
})

describe('project', () => {
  test('with no growth, adds up what goes in', () => {
    const p = project(100000, { years: 2, annual_return: 0, monthly_cents: 10000 })
    assert.deepEqual(p.map(x => [x.year, x.balance_cents, x.put_in_cents]), [[0, 100000, 100000], [1, 220000, 220000], [2, 340000, 340000]])
  })

  test('compounds monthly to the yearly rate given', () => {
    const p = project(1000000, { years: 10, annual_return: 0.05, monthly_cents: 0 })
    assert.equal(p.at(-1).balance_cents, Math.round(1000000 * 1.05 ** 10))
  })

  test('starts from the investment accounts only', () => {
    assert.equal(invested([acct('ira', 'retirement', 500), acct('brk', 'brokerage', 250), acct('chk', 'checking', 9999), acct('x', 'brokerage', null, '')]), 750)
  })
})
