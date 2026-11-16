// shared/upcoming.ts: Overview's "Coming up": the week ahead from the
// cash-flow forecast, and recent price rises.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upcoming } from '../shared/upcoming.ts'

const ev = (date, amount_cents, name = 'Bill') => ({ id: `${name}:${date}`, account: 'a', date, name, amount_cents, source: 'recurring', running_cents: null })
const sub = (fields = {}) => ({ key: 'netflix', name: 'Netflix', category: 'entertainment', account: 'a', cadence: 'monthly', amount_cents: 1799, varies: false, yearly_cents: 0, count: 5, first: '2026-06-01', last: '2026-11-01', next: '2026-12-01', stopped: false, change: { from_cents: 1549, to_cents: 1799, on: '2026-11-01' }, ...fields })

test('the next seven days, today included, and what they take out', () => {
  const u = upcoming([ev('2026-11-15', -100), ev('2026-11-16', -500), ev('2026-11-22', -700), ev('2026-11-20', 250000, 'Pay'), ev('2026-11-23', -900)], [], '2026-11-16')
  assert.deepEqual(u.events.map(e => [e.date, e.amount_cents]), [['2026-11-16', -500], ['2026-11-22', -700], ['2026-11-20', 250000]])
  assert.equal(u.due_cents, 1200)
  assert.equal(u.events[0].running_cents, undefined)
})

test('price rises: only up, still charging, and in the last 45 days', () => {
  const u = upcoming([], [
    sub(),
    sub({ key: 'old', change: { from_cents: 1000, to_cents: 1200, on: '2026-09-01' } }),
    sub({ key: 'down', change: { from_cents: 1200, to_cents: 1000, on: '2026-11-01' } }),
    sub({ key: 'gone', stopped: true }),
    sub({ key: 'none', change: null }),
    sub({ key: 'yearly', name: 'Prime', cadence: 'yearly', change: { from_cents: 13900, to_cents: 14900, on: '2026-11-10' } }),
  ], '2026-11-16')
  assert.deepEqual(u.rises.map(r => [r.key, r.yearly_cents]), [['yearly', 1000], ['netflix', 250 * 12]])
})
