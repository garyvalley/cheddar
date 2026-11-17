// Reports (shared/reports.ts): months and ranges, each month's income and
// spending, a category and a merchant over time, where the income went, and
// a year in review.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRange, flow, monthEnd, monthsBack, monthsFrom, rangeMonths, report, yearReview, FLOW_MAX, MAX_MONTHS, TOP_MERCHANTS } from '../shared/reports.ts'

const row = (posted, amount_cents, category, merchant_key = '', payee = '') => ({ posted, amount_cents, category, merchant_key, payee, description: merchant_key.toUpperCase() })

describe('months', () => {
  test('counting and ranges', () => {
    assert.deepEqual(monthsFrom('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'])
    assert.deepEqual(monthsFrom('2026-02', '2026-01'), [])
    assert.equal(monthsBack('2026-01', 1), '2025-12')
    assert.equal(monthsBack('2026-03', 14), '2025-01')
    assert.equal(monthEnd('2024-02'), '2024-02-29')
    assert.equal(monthEnd('2026-12'), '2026-12-31')
    assert.deepEqual(rangeMonths('12m', '2026-11-16'), { from: '2025-12', to: '2026-11' })
    assert.deepEqual(rangeMonths('6m', '2026-03-01'), { from: '2025-10', to: '2026-03' })
    assert.deepEqual(rangeMonths('ytd', '2026-11-16'), { from: '2026-01', to: '2026-11' })
    assert.deepEqual(rangeMonths('last-year', '2026-11-16'), { from: '2025-01', to: '2025-12' })
  })

  test('checkRange takes real months in order, up to five years', () => {
    assert.deepEqual(checkRange('2025-01', '2026-06'), { from: '2025-01', to: '2026-06' })
    for (const [from, to] of [['2026-13', '2026-12'], ['2026-1', '2026-02'], [undefined, '2026-01'], ['2026-05', '2026-04']]) assert.ok('problem' in checkRange(from, to), `${from} ${to}`)
    assert.ok('problem' in checkRange('2020-01', monthsBack('2020-01', -MAX_MONTHS)))
    assert.ok(!('problem' in checkRange('2020-01', monthsBack('2020-01', -(MAX_MONTHS - 1)))))
  })
})

test('report: each month, each category and merchant over time, as Spending counts them', () => {
  const r = report([
    row('2026-01-03', 300000, 'income', 'acme payroll'),
    row('2026-01-05', -12000, 'groceries', 'whole foods'),
    row('2026-01-20', -4500, 'dining', 'blue bottle', 'Blue Bottle'),
    row('2026-01-21', -50000, 'transfer'),
    row('2026-02-03', 300000, 'income', 'acme payroll'),
    row('2026-02-05', -20000, 'groceries', 'whole foods', 'Whole Foods'),
    row('2026-02-06', 2000, 'groceries', 'whole foods'),
    row('2026-03-01', -1000, 'dining', 'blue bottle'),
    row('2025-12-31', -999999, 'dining', 'outside'),
  ], ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(r.months, [
    { month: '2026-01', income_cents: 300000, spent_cents: 16500, net_cents: 283500 },
    { month: '2026-02', income_cents: 300000, spent_cents: 18000, net_cents: 282000 },
    { month: '2026-03', income_cents: 0, spent_cents: 1000, net_cents: -1000 },
  ])
  assert.deepEqual([r.income_cents, r.spent_cents, r.saved_percent], [600000, 35500, 94])
  assert.deepEqual(r.categories.map(c => [c.id, c.months, c.total_cents, c.count]), [['groceries', [12000, 18000, 0], 30000, 3], ['dining', [4500, 0, 1000], 5500, 2]])
  // A refund takes off; the name is the latest one's; transfers and income aren't merchants.
  assert.deepEqual(r.merchants.map(m => [m.id, m.label, m.months, m.total_cents]), [['whole foods', 'WHOLE FOODS', [12000, 18000, 0], 30000], ['blue bottle', 'BLUE BOTTLE', [4500, 0, 1000], 5500]])
  assert.deepEqual(r.flow, { income_cents: 600000, to: [{ id: 'groceries', label: 'Groceries', cents: 30000 }, { id: 'dining', label: 'Dining and drinks', cents: 5500 }], saved_cents: 564500, short_cents: 0 })
})

test('report keeps only the top merchants', () => {
  const rows = Array.from({ length: TOP_MERCHANTS + 5 }, (_, i) => row('2026-01-10', -(i + 1) * 100, 'shopping', `shop ${i}`))
  const r = report(rows, ['2026-01'])
  assert.equal(r.merchants.length, TOP_MERCHANTS)
  assert.equal(r.merchants[0].id, `shop ${TOP_MERCHANTS + 4}`)
})

test('flow: past the income, and the small categories put together', () => {
  const cats = Array.from({ length: FLOW_MAX + 2 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, total_cents: (20 - i) * 100 }))
  const f = flow(1000, cats)
  assert.equal(f.to.length, FLOW_MAX)
  assert.equal(f.to.at(-1).id, 'rest')
  assert.equal(f.to.reduce((n, c) => n + c.cents, 0), cats.reduce((n, c) => n + c.total_cents, 0))
  assert.equal(f.saved_cents, 0)
  assert.equal(f.short_cents, f.to.reduce((n, c) => n + c.cents, 0) - 1000)
  assert.deepEqual(flow(-500, []), { income_cents: 0, to: [], saved_cents: 0, short_cents: 0 })
})

test('yearReview: the year so far, against the one before', () => {
  const rows = [
    row('2026-01-03', 500000, 'income'),
    row('2026-02-05', -100000, 'housing', 'landlord'),
    row('2026-03-05', -150000, 'housing', 'landlord'),
    row('2026-03-07', -20000, 'groceries', 'whole foods'),
  ]
  const lastYear = [row('2025-01-01', 100000, 'income'), row('2025-02-01', 100000, 'income'), row('2025-03-02', -300000, 'housing'), row('2025-04-01', 200000, 'income'), row('2025-06-01', 999999, 'income')]
  const y = yearReview(2026, rows, lastYear, '2026-04-10')
  assert.equal(y.partial, true)
  assert.deepEqual([y.income_cents, y.spent_cents, y.saved_cents, y.saved_percent], [500000, 270000, 230000, 46])
  assert.equal(y.monthly_cents, 67500, 'over the four months gone')
  assert.deepEqual(y.biggest_month, { month: '2026-03', spent_cents: 170000 })
  assert.deepEqual(y.top_categories.map(c => c.id), ['housing', 'groceries'])
  assert.deepEqual(y.top_merchant, { name: 'LANDLORD', total_cents: 250000, count: 2 })
  assert.deepEqual(y.before, { income_cents: 400000, spent_cents: 300000, months: 4 }, 'the same four months, not June')
  assert.equal(yearReview(2026, rows, [row('2025-03-01', 1, 'income')], '2026-04-10').before, null, 'a year Cheddar barely saw')
  assert.equal(yearReview(2025, [], [], '2026-04-10').partial, false)
  assert.equal(yearReview(2025, [], [], '2026-04-10').before, null)
})
