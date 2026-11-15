// Overview's linked-bank health (shared/link-health.ts): judged by each link's
// last successful sync and its accounts' balance dates, not by new transactions.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { linkHealth, needsAttention } from '../shared/link-health.ts'

const now = Date.parse('2026-11-15T12:00:00Z')
const today = '2026-11-15'
const account = (over = {}) => ({ id: 'a', name: 'Checking', institution: '', kind: 'checking', last4: '0000', balance_cents: 100, balance_date: '2026-11-15', closed_on: '', excluded: false, ...over })
const link = (over = {}) => ({ id: 'l', provider: 'plaid', institutions: ['Chase'], status: 'ok', message: '', last_synced: '2026-11-15 03:00:00.000Z', accounts: [account()], brought_in: { count: 0, from: '', history: 0, review_from: '' }, ...over })

describe('linked bank health', () => {
  test('a recent sync with today\'s balances is ok, whether or not it brought anything new', () => {
    const [h] = linkHealth([link()], now, today)
    assert.deepEqual([h.name, h.state, h.accounts[0].stale], ['Chase', 'ok', false])
    assert.deepEqual(needsAttention([h]), [])
  })

  test('is out of date with no successful sync in 36 hours, or a balance over 3 days old', () => {
    assert.equal(linkHealth([link({ last_synced: '2026-11-13 23:00:00.000Z' })], now, today)[0].state, 'stale')
    assert.equal(linkHealth([link({ last_synced: '' })], now, today)[0].state, 'stale')
    const [h] = linkHealth([link({ accounts: [account(), account({ id: 'b', name: 'Savings', balance_date: '2026-11-11' })] })], now, today)
    assert.deepEqual([h.state, h.accounts.map(a => a.stale)], ['stale', [false, true]])
    assert.equal(linkHealth([link({ accounts: [account({ balance_date: '2026-11-12' })] })], now, today)[0].state, 'ok')
  })

  test('says when a sync failed or the bank wants signing in again, worst first', () => {
    const list = linkHealth([
      link({ id: 'old', last_synced: '' }),
      link({ id: 'err', status: 'error', message: 'Chase is down' }),
      link({ id: 'fine' }),
      link({ id: 'in', status: 'reconnect', message: 'Sign in again' }),
    ], now, today)
    assert.deepEqual(needsAttention(list).map(h => [h.id, h.state]), [['in', 'reconnect'], ['err', 'error'], ['old', 'stale']])
  })

  test('leaves out closed and left-out accounts', () => {
    const [h] = linkHealth([link({ accounts: [account({ id: 'x', closed_on: '2026-10-01', balance_date: '2026-01-01' }), account({ id: 'y', excluded: true, balance_date: '' }), account()] })], now, today)
    assert.deepEqual([h.state, h.accounts.map(a => a.id)], ['ok', ['a']])
  })
})
