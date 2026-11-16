// shared/projections.ts strategyPlan(): paying every debt together, with an
// extra amount going to one at a time (avalanche or snowball).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthsAfter, payoff, strategyPlan } from '../shared/projections.ts'

const card = { id: 'card', name: 'Card', owed_cents: 500000, payment_cents: 15000, apr: 0.24 }
const car = { id: 'car', name: 'Car', owed_cents: 120000, payment_cents: 10000, apr: 0.05 }
const loan = { id: 'loan', name: 'Loan', owed_cents: 900000, payment_cents: 20000, apr: 0.07 }

test('one debt, no extra: the same as its own payoff', () => {
  const p = strategyPlan([card], 0, 'avalanche', '2026-11-16')
  const own = payoff(card.owed_cents, card.payment_cents, card.apr)
  assert.equal(p.months, own.months)
  assert.ok(Math.abs(p.interest_cents - own.interest_cents) <= 1)
  assert.equal(p.when, monthsAfter('2026-11-16', own.months))
})

test('avalanche pays the highest rate first and costs no more interest; snowball the smallest first', () => {
  const a = strategyPlan([card, car, loan], 30000, 'avalanche', '2026-11-16')
  const s = strategyPlan([card, car, loan], 30000, 'snowball', '2026-11-16')
  assert.deepEqual(a.order.map(d => d.id).slice(0, 1), ['card'])
  assert.deepEqual(s.order.map(d => d.id).slice(0, 1), ['car'])
  assert.ok(a.interest_cents <= s.interest_cents, `${a.interest_cents} <= ${s.interest_cents}`)
  assert.equal(a.order.length, 3)
  assert.equal(a.when, a.order.at(-1).when)
  // An extra amount gets it done sooner than the payments alone.
  const none = strategyPlan([card, car, loan], 0, 'avalanche', '2026-11-16')
  assert.ok(a.months < none.months)
  assert.ok(a.interest_cents < none.interest_cents)
})

test('no payments and no extra, or payments the interest outruns: never', () => {
  assert.equal(strategyPlan([{ ...card, payment_cents: 0 }], 0, 'snowball', '2026-11-16').months, null)
  assert.equal(strategyPlan([{ ...card, payment_cents: 5000 }], 0, 'snowball', '2026-11-16').months, null)
  // The extra rescues a debt with no payment of its own; an unknown rate is charged as none.
  const p = strategyPlan([{ ...car, payment_cents: 0, apr: null }], 10000, 'snowball', '2026-11-16')
  assert.deepEqual([p.months, p.interest_cents], [12, 0])
  assert.deepEqual(strategyPlan([], 100, 'avalanche', '2026-11-16').order, [])
})
