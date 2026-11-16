// The monthly budget plan (shared/budget-plan.ts): budgets beside a month's
// spending, the plan's totals, suggestions, and moving budget between categories.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetPlan, moveBudget, planTotals, suggestion } from '../shared/budget-plan.ts'

const cats = [
  { id: 'groceries', label: 'Groceries', spending: true, custom: false },
  { id: 'dining', label: 'Dining', spending: true, custom: false },
  { id: 'travel', label: 'Travel', spending: true, custom: false },
  { id: 'income', label: 'Income', spending: false, custom: false },
  { id: 'c-theirs', label: 'Theirs', spending: true, custom: true, shared: true },
]

describe('budget plan', () => {
  test('lists every own spending category, budgeted first, with what each came to and a suggestion', () => {
    const p = budgetPlan({
      month: '2026-11',
      income_cents: 500000,
      categories: cats,
      budgets: [{ category: 'dining', amount_cents: 30000 }],
      spent: new Map([['groceries', 42000], ['dining', 35000]]),
      before: [new Map([['groceries', 40000]]), new Map([['groceries', 45000], ['travel', 3000]]), new Map()],
    })
    assert.deepEqual(p.lines.map(l => [l.id, l.budget_cents, l.spent_cents, l.suggested_cents]), [
      ['dining', 30000, 35000, null],
      ['groceries', null, 42000, 29000],
      ['travel', null, 0, 1000],
    ])
    assert.deepEqual(
      [p.planned_cents, p.spent_budgeted_cents, p.remaining_cents, p.unbudgeted_cents, p.unplanned_income_cents],
      [30000, 35000, -5000, 42000, 470000],
    )
  })

  test('totals follow budgets as they are typed', () => {
    const t = planTotals([{ budget_cents: 50000, spent_cents: 42000 }, { budget_cents: 30000, spent_cents: 35000 }, { budget_cents: null, spent_cents: 1000 }], 60000)
    assert.deepEqual(t, { planned_cents: 80000, carry_cents: 0, spent_budgeted_cents: 77000, remaining_cents: 3000, unbudgeted_cents: 1000, unplanned_income_cents: -20000 })
  })

  test('what rolled over counts toward what\'s left, but not toward the plan', () => {
    const t = planTotals([{ budget_cents: 50000, spent_cents: 42000, carry_cents: 12000 }, { budget_cents: 30000, spent_cents: 35000, carry_cents: -2000 }, { budget_cents: null, spent_cents: 1000, carry_cents: 900 }], 60000)
    assert.deepEqual(t, { planned_cents: 80000, carry_cents: 10000, spent_budgeted_cents: 77000, remaining_cents: 13000, unbudgeted_cents: 1000, unplanned_income_cents: -20000 })
  })

  test('suggestions round the average up to whole dollars of ten, and say nothing for nothing spent', () => {
    assert.equal(suggestion([12345, 0, 0]), 5000)
    assert.equal(suggestion([0, 0, 0]), null)
    assert.equal(suggestion([-5000, 0]), null)
    assert.equal(suggestion([]), null)
  })

  test('moving budget takes it from one category to another, never more than it has', () => {
    assert.deepEqual(moveBudget(30000, null, 10000), { from: 20000, to: 10000 })
    assert.deepEqual(moveBudget(30000, 5000, 30000), { from: null, to: 35000 })
    assert.ok('problem' in moveBudget(30000, 0, 40000))
    assert.ok('problem' in moveBudget(null, 0, 1))
    assert.ok('problem' in moveBudget(100, 0, 0))
  })
})
