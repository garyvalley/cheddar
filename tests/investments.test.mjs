// Unit tests for shared/investments.ts: the Investments page's value, growth
// and month-end values, from the accounts' balances over time.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { investments } from '../shared/investments.ts'

const acct = (id, kind, balance, date, extra = {}) => ({ id, name: id, kind, institution: 'Bank', last4: '', linked: true, closed_on: '', balance_cents: balance, balance_date: date, ...extra })

describe('investments', () => {
  test('counts only brokerage and retirement accounts', () => {
    const r = investments([acct('b', 'brokerage', 100_000_00, '2026-11-15'), acct('c', 'checking', 5_000_00, '2026-11-15'), acct('r', 'retirement', 50_000_00, '2026-11-14')], [], [], '2026-11-15')
    assert.equal(r.total_cents, 150_000_00)
    assert.equal(r.as_of, '2026-11-15')
    assert.deepEqual(r.accounts.map(a => a.id), ['b', 'r'])
  })

  test('a new link has today\'s value and no growth yet', () => {
    const r = investments([acct('b', 'brokerage', 100_000_00, '2026-11-15')], [{ account: 'b', date: '2026-11-15', balance_cents: 100_000_00 }], [], '2026-11-15')
    assert.equal(r.growth.find(g => g.period === '1y').rate, null)
    assert.equal(r.months.at(-1).value_cents, 100_000_00)
    assert.equal(r.months.at(-2).value_cents, null)
  })

  test('growth leaves out money moved in, overall and per account', () => {
    const history = [
      { account: 'b', date: '2026-10-01', balance_cents: 100_000_00 },
      { account: 'b', date: '2026-10-31', balance_cents: 104_000_00 },
      { account: 'b', date: '2026-11-15', balance_cents: 112_000_00 },
    ]
    // $2,000 deposited: of the $12,000 rise, $10,000 is growth.
    const transfers = [{ account: 'b', posted: '2026-10-20', amount_cents: 2_000_00 }]
    const r = investments([acct('b', 'brokerage', 112_000_00, '2026-11-15')], history, transfers, '2026-11-15')
    const all = r.growth.find(g => g.period === 'all')
    assert.equal(all.gain_cents, 10_000_00)
    assert.equal(all.added_cents, 2_000_00)
    assert.equal(r.accounts[0].growth.find(g => g.period === 'all').gain_cents, 10_000_00)
    // October's end, then today's.
    assert.equal(r.months.at(-2).value_cents, 104_000_00)
    assert.equal(r.months.at(-1).value_cents, 112_000_00)
  })

  test('a closed account holds nothing from the day it closed', () => {
    const history = [{ account: 'x', date: '2026-09-10', balance_cents: 20_000_00 }]
    const r = investments([acct('x', 'brokerage', 20_000_00, '2026-09-10', { closed_on: '2026-10-05' })], history, [], '2026-11-15')
    assert.equal(r.total_cents, 0)
    assert.equal(r.months.find(m => m.month === '2026-09').value_cents, 20_000_00)
    assert.equal(r.months.find(m => m.month === '2026-10').value_cents, 0)
  })
})
