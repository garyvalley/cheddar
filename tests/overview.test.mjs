// Unit tests for Overview's sums (shared/overview.ts) and for the balance a
// person types on Accounts (shared/accounts.ts).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseBalance } from '../shared/accounts.ts'
import { balancesOn, growth, growthStart, lastMonths, monthly, netWorth, netWorthChange } from '../shared/overview.ts'

const acct = (id, kind, balance_cents, balance_date = '2026-11-09') => ({ id, name: id, kind, balance_cents, balance_date })

describe('netWorth', () => {
  test('adds what is held and takes off what is owed, by kind of account', () => {
    const w = netWorth([
      acct('chk', 'checking', 250000), acct('sav', 'savings', 1000000), acct('ira', 'retirement', 5000000),
      acct('visa', 'credit_card', -120000), acct('home', 'property', 40000000, '2026-10-01'), acct('car', 'loan', -1500000),
    ])
    assert.equal(w.total_cents, 250000 + 1000000 + 5000000 - 120000 + 40000000 - 1500000)
    assert.equal(w.assets_cents, 46250000)
    assert.equal(w.debts_cents, -1620000)
    assert.deepEqual(w.groups.map(g => [g.id, g.total_cents, g.count]), [
      ['cash', 1250000, 2], ['investments', 5000000, 1], ['property', 40000000, 1], ['debts', -1620000, 2],
    ])
    assert.equal(w.as_of, '2026-11-09')
  })

  test('leaves out, and names, accounts with no balance yet', () => {
    const w = netWorth([acct('chk', 'checking', 100), acct('new', 'savings', null, '')])
    assert.equal(w.total_cents, 100)
    assert.deepEqual(w.missing, [{ id: 'new', name: 'new' }])
  })
})

describe('balance history', () => {
  const history = [
    { account: 'a', date: '2026-09-01', balance_cents: 100 },
    { account: 'a', date: '2026-10-01', balance_cents: 200 },
    { account: 'b', date: '2026-10-20', balance_cents: 50 },
  ]

  test('an account\'s balance on a day is its latest by then', () => {
    assert.deepEqual([...balancesOn(history, '2026-10-15')], [['a', 200]])
    assert.deepEqual([...balancesOn(history, '2026-08-01')], [])
  })

  test('net worth\'s change counts only accounts that had a balance then', () => {
    const now = [acct('a', 'checking', 500), acct('b', 'checking', 9999)]
    assert.deepEqual(netWorthChange(now, history, '2026-10-09'), { since: '2026-10-09', change_cents: 300 })
    assert.equal(netWorthChange(now, history, '2026-08-01'), null)
  })
})

describe('monthly', () => {
  test('lists the last months oldest first, across a new year', () => {
    assert.deepEqual(lastMonths('2026-02-10', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  test('adds up each month\'s income and spending, leaving out transfers', () => {
    const rows = [
      { posted: '2026-10-01', amount_cents: 300000, category: 'income' },
      { posted: '2026-10-02', amount_cents: -5000, category: 'groceries' },
      { posted: '2026-10-03', amount_cents: 1000, category: 'groceries' }, // a refund
      { posted: '2026-10-04', amount_cents: -100000, category: 'transfer' },
      { posted: '2026-11-01', amount_cents: -2500, category: '' }, // not sorted yet: Other
      { posted: '2026-07-01', amount_cents: -999, category: 'dining' }, // before the months asked for
    ]
    assert.deepEqual(monthly(rows, ['2026-09', '2026-10', '2026-11']).map(m => [m.month, m.label, m.income_cents, m.spent_cents]), [
      ['2026-09', 'Sep', 0, 0], ['2026-10', 'Oct', 300000, 4000], ['2026-11', 'Nov', 0, 2500],
    ])
  })
})

describe('growth', () => {
  test('periods count back from today, the end of a short month included', () => {
    assert.equal(growthStart('1m', '2026-03-31'), '2026-02-28')
    assert.equal(growthStart('3m', '2026-01-15'), '2025-10-15')
    assert.equal(growthStart('1y', '2026-11-09'), '2025-11-09')
    assert.equal(growthStart('ytd', '2026-11-09'), '2025-12-31')
  })

  const brokerage = acct('brk', 'brokerage', 1_150_000)
  const history = [
    { account: 'brk', date: '2025-06-01', balance_cents: 800_000 },
    { account: 'brk', date: '2025-11-01', balance_cents: 1_000_000 },
    { account: 'brk', date: '2026-11-09', balance_cents: 1_150_000 },
    { account: 'chk', date: '2025-11-01', balance_cents: 5 },
  ]

  test('is the change in the investment balances on what they started with', () => {
    const g = growth([brokerage, acct('chk', 'checking', 999)], history, [], '1y', '2026-11-09')
    assert.deepEqual([g.since, g.start_cents, g.end_cents, g.gain_cents], ['2025-11-09', 1_000_000, 1_150_000, 150_000])
    assert.equal(g.rate, 0.15)
  })

  test('does not count money moved in as growth', () => {
    const transfers = [{ account: 'brk', posted: '2026-03-01', amount_cents: 50_000 }, { account: 'brk', posted: '2025-10-01', amount_cents: 1 }]
    const g = growth([brokerage], history, transfers, '1y', '2026-11-09')
    assert.deepEqual([g.added_cents, g.gain_cents, g.rate], [50_000, 100_000, 0.1])
  })

  test('starts from the first balance seen when that came after the period began', () => {
    const g = growth([brokerage], history, [], 'all', '2026-11-09')
    assert.deepEqual([g.since, g.start_cents, g.gain_cents], ['2025-06-01', 800_000, 350_000])
  })

  test('has nothing to say with only today\'s balance', () => {
    const g = growth([brokerage], [{ account: 'brk', date: '2026-11-09', balance_cents: 1_150_000 }], [], '1m', '2026-11-09')
    assert.deepEqual([g.since, g.rate], ['', null])
  })
})

describe('parseBalance', () => {
  test('reads amounts as people type them', () => {
    assert.deepEqual(parseBalance('1,234.56', 'checking'), { ok: 123456 })
    assert.deepEqual(parseBalance('$12', 'savings'), { ok: 1200 })
    assert.deepEqual(parseBalance('-$80.5', 'checking'), { ok: -8050 })
    assert.deepEqual(parseBalance('.99', 'checking'), { ok: 99 })
    assert.deepEqual(parseBalance(250, 'brokerage'), { ok: 25000 })
  })

  test('stores what a card or loan owes as negative however it is typed', () => {
    assert.deepEqual(parseBalance('500', 'credit_card'), { ok: -50000 })
    assert.deepEqual(parseBalance('-500', 'loan'), { ok: -50000 })
    assert.deepEqual(parseBalance('0', 'loan'), { ok: 0 })
  })

  test('refuses what is not an amount', () => {
    for (const bad of ['', 'abc', '1.234', '12,34', '--5', '$', '1e5', null]) assert.ok('problem' in parseBalance(bad, 'checking'), String(bad))
  })
})
