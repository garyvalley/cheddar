// shared/notices.ts: the bell in the top bar. What each kind says, the order
// they come in, which are new since the bell was last opened, and what the
// routes take from the browser.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOTICE_KINDS, checkOff, checkSeen, freshSince, notices, readOff, readState, unseen } from '../shared/notices.ts'

const today = '2026-11-20'
const ev = (date, amount_cents, name = 'Rent', source = 'scheduled') => ({ id: `${name}:${date}`, account: 'a1', date, name, amount_cents, source, running_cents: null })
const link = (state, fields = {}) => ({ id: `l-${state}`, name: 'Wells Fargo', state, message: '', last_synced: '', accounts: [], ...fields })

test('every kind at once comes in NOTICE_KINDS\' order', () => {
  const list = notices({
    today,
    health: [link('ok'), link('reconnect')],
    balances: { accounts: [{ id: 'a1', name: 'Checking', kind: 'checking', balance_cents: 4000 }], under_cents: 10000 },
    overBudget: [{ id: 'dining', label: 'Dining', spent_cents: 30000, budget_cents: 20000 }],
    events: [ev('2026-11-21', -120000)],
    names: new Map([['a1', 'Checking']]),
    rises: [{ key: 'netflix', name: 'Netflix', category: 'entertainment', from_cents: 1549, to_cents: 1799, on: '2026-11-01', yearly_cents: 3000 }],
    invitations: [{ id: 'i1', name: 'The Valleys', invited_by: 'Sam' }],
    fresh: { count: 12, newest: 't9' },
    stale: [{ id: 'a2', name: 'House', balance_date: '2026-09-01' }],
    goals: [{ id: 'g1', name: 'Trip', target_cents: 100000, saved_cents: 100000 }, { id: 'g2', name: 'Car', target_cents: 500000, saved_cents: 1000 }],
  })
  assert.deepEqual(list.map(n => n.kind), NOTICE_KINDS.map(k => k.id))
  assert.deepEqual(list.map(n => n.key), [
    'bank:l-reconnect:reconnect', 'balance:a1', 'budget:dining:2026-11', 'bill:Rent:2026-11-21',
    'rise:netflix:2026-11-01', 'invite:i1', 'new:t9', 'stale:a2:2026-09-01', 'goal:g1:100000',
  ])
  const by = Object.fromEntries(list.map(n => [n.kind, n]))
  assert.equal(by.bank.title, 'Sign in to Wells Fargo again')
  assert.equal(by.bank.href, '/settings?reconnect=l-reconnect#linked-banks')
  assert.equal(by.balance.text, 'Down to $40.00, under the $100.00 you set.')
  assert.equal(by.bill.title, 'Rent tomorrow')
  assert.equal(by.bill.text, '$1,200.00 from Checking, as planned.')
  assert.equal(by.bill.href, '/spending#upcoming')
  assert.equal(by.new.title, '12 new transactions')
  assert.equal(by.goal.tone, 'good')
  assert.equal(by.bank.tone, 'warn')
})

test('bills: money out only, today through three days on', () => {
  const list = notices({ today, events: [ev('2026-11-19', -100, 'Past'), ev(today, -100, 'Gym', 'recurring'), ev('2026-11-23', -100, 'Phone'), ev('2026-11-24', -100, 'Later'), ev('2026-11-21', 250000, 'Pay')] })
  assert.deepEqual(list.map(n => n.title), ['Gym today', 'Phone on Mon, Nov 23'])
  assert.match(list[0].text, /its usual charge/)
})

test('no low-balance notice without an amount, and none at or over it', () => {
  const accounts = [{ id: 'a', name: 'Checking', kind: 'checking', balance_cents: 100 }, { id: 'b', name: 'Card', kind: 'credit', balance_cents: -90000 }, { id: 'c', name: 'Savings', kind: 'savings', balance_cents: 5000 }]
  assert.deepEqual(notices({ today, balances: { accounts, under_cents: 0 } }), [])
  assert.deepEqual(notices({ today, balances: { accounts, under_cents: 5000 } }).map(n => n.key), ['balance:a'])
})

test('a bank that failed, then needs signing in, is new news each time', () => {
  const failed = notices({ today, health: [link('error', { id: 'l', message: 'The bank is down.' })] })
  const signIn = notices({ today, health: [link('reconnect', { id: 'l' })] })
  assert.equal(failed[0].text, 'The bank is down.')
  assert.deepEqual(unseen(signIn, failed.map(n => n.key)).length, 1)
  assert.deepEqual(unseen(failed, failed.map(n => n.key)), [])
})

test('no new transactions, no notice; kinds turned off are left out', () => {
  assert.deepEqual(notices({ today, fresh: { count: 0, newest: '' } }), [])
  const list = notices({ today, fresh: { count: 1, newest: 't' }, goals: [{ id: 'g', name: 'Trip', target_cents: 10, saved_cents: 10 }] }, new Set(['new']))
  assert.deepEqual(list.map(n => n.kind), ['goal'])
  assert.equal(notices({ today, fresh: { count: 1, newest: 't' } })[0].title, '1 new transaction')
})

test('the stored state is read whatever it holds', () => {
  assert.deepEqual(readState(null), { keys: [], at: '' })
  assert.deepEqual(readState({ keys: ['a', 3, 'x'.repeat(200)], at: 'nonsense' }), { keys: ['a'], at: '' })
  assert.deepEqual(readState({ keys: ['a'], at: '2026-11-20T01:00:00.000Z' }), { keys: ['a'], at: '2026-11-20T01:00:00.000Z' })
  assert.deepEqual(readOff(['goal', 'nope', 'bank']), ['bank', 'goal'])
  assert.deepEqual(readOff('goal'), [])
})

test('what the browser sends is checked', () => {
  assert.deepEqual(checkSeen(['a', 'a', 'b']), { ok: ['a', 'b'] })
  assert.ok('problem' in checkSeen('a'))
  assert.ok('problem' in checkSeen([1]))
  assert.ok('problem' in checkSeen(['']))
  assert.equal(checkSeen(Array.from({ length: 500 }, (_, i) => `k${i}`)).ok.length, 200)
  assert.deepEqual(checkOff(['goal', 'bank']), { ok: ['bank', 'goal'] })
  assert.ok('problem' in checkOff(['email']))
  assert.ok('problem' in checkOff(null))
})

test('new transactions count from the last look, a week back at most', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  assert.equal(freshSince({ keys: [], at: '' }, now), '2026-11-13T12:00:00.000Z')
  assert.equal(freshSince({ keys: [], at: '2026-11-19T08:00:00.000Z' }, now), '2026-11-19T08:00:00.000Z')
  assert.equal(freshSince({ keys: [], at: '2026-10-01T08:00:00.000Z' }, now), '2026-11-13T12:00:00.000Z')
})
