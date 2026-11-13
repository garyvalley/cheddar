// Unit tests for monthly budgets (shared/budgets.ts): what's accepted, the
// budget for a week, month, year or range, and which categories are over.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetFor, checkBudget, overBudget } from '../shared/budgets.ts'

describe('checkBudget', () => {
  test('an amount in dollars, or nothing to remove it', () => {
    assert.deepEqual(checkBudget('450'), { ok: 45000 })
    assert.deepEqual(checkBudget('$1,200.50'), { ok: 120050 })
    assert.deepEqual(checkBudget(''), { ok: null })
    assert.deepEqual(checkBudget('0'), { ok: null })
    assert.deepEqual(checkBudget(undefined), { ok: null })
  })

  test('no negative, unreadable or huge amounts', () => {
    for (const v of ['-5', 'lots', '20000000', {}]) assert.ok('problem' in checkBudget(v), String(v))
  })
})

describe('budgetFor', () => {
  test('whole months count the monthly amount each', () => {
    assert.equal(budgetFor(30000, '2026-11-01', '2026-11-30'), 30000)
    assert.equal(budgetFor(30000, '2026-02-01', '2026-02-28'), 30000)
    assert.equal(budgetFor(30000, '2026-01-01', '2026-12-31'), 360000)
    assert.equal(budgetFor(30000, '2025-12-01', '2026-01-31'), 60000)
  })

  test('anything else its share by days', () => {
    assert.equal(budgetFor(30000, '2026-11-09', '2026-11-15'), Math.round(30000 * 7 * 12 / 365.25))
    assert.equal(budgetFor(30000, '2026-11-02', '2026-11-30'), Math.round(30000 * 29 * 12 / 365.25))
  })
})

describe('overBudget', () => {
  test('only spending over its budget, most over first', () => {
    const categories = [
      { id: 'dining', label: 'Dining', spending: true, total_cents: 50000 },
      { id: 'groceries', label: 'Groceries', spending: true, total_cents: 61000 },
      { id: 'travel', label: 'Travel', spending: true, total_cents: 10000 },
      { id: 'income', label: 'Income', spending: false, total_cents: 900000 },
    ]
    const budgets = [
      { category: 'dining', budget_cents: 30000 },
      { category: 'groceries', budget_cents: 60000 },
      { category: 'travel', budget_cents: 10000 },
      { category: 'income', budget_cents: 1 },
      { category: 'health', budget_cents: 5000 },
    ]
    assert.deepEqual(overBudget(categories, budgets).map(b => [b.id, b.spent_cents - b.budget_cents]), [['dining', 20000], ['groceries', 1000]])
  })
})
