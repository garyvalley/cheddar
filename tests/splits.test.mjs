// Splitting a transaction across categories: shared/splits.ts (the form's
// check, reading the stored parts, totals counting the parts) and
// checkStored() (the check as they're saved, which the hooks run from its
// build, pb_hooks/lib/gen/splits.js).

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'
import { MAX_PARTS, MIN_PARTS, checkSplit, expandSplits, leftOver, partsOf } from '../shared/splits.ts'
import { summarize } from '../shared/categories.ts'
import { monthly } from '../shared/overview.ts'
import { taxYear } from '../shared/taxes.ts'

const hook = loadHookModule('pb_hooks/lib/gen/splits.js')
const usable = id => ['groceries', 'shopping', 'dining', 'other', 'transfer', 'income', 'c-abcdefghijklmno'].includes(id)
const problem = r => r.problem
const part = (category, amount) => ({ category, amount })
const costco = { account: 'a', posted: '2026-11-02', amount_cents: -12000, category: 'groceries' }

describe('a split from the form', () => {
  test('takes each part\'s size and signs it like the whole', () => {
    assert.deepEqual(checkSplit([part('groceries', '80'), part('shopping', '$40.00')], -12000, usable).ok,
      [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }])
    assert.deepEqual(checkSplit([part('income', '1,000'), part('transfer', '200.50')], 120050, usable).ok,
      [{ category: 'income', amount_cents: 100000 }, { category: 'transfer', amount_cents: 20050 }])
  })

  test('parts in the same category become one', () => {
    assert.deepEqual(checkSplit([part('groceries', '50'), part('shopping', '40'), part('groceries', '30')], -12000, usable).ok,
      [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }])
  })

  test('an empty list undoes it', () => {
    assert.deepEqual(checkSplit([], -12000, usable).ok, [])
  })

  test('must add up to the whole, to the cent', () => {
    assert.match(problem(checkSplit([part('groceries', '80'), part('shopping', '39.99')], -12000, usable)), /\$0\.01 less/)
    assert.match(problem(checkSplit([part('groceries', '80'), part('shopping', '41')], -12000, usable)), /\$1\.00 more/)
  })

  test('refuses what isn\'t a split', () => {
    assert.match(problem(checkSplit([part('groceries', '120')], -12000, usable)), /two different/)
    assert.match(problem(checkSplit([part('groceries', '60'), part('groceries', '60')], -12000, usable)), /two different/)
    assert.match(problem(checkSplit([part('groceries', '80'), part('', '40')], -12000, usable)), /category for each/)
    assert.match(problem(checkSplit([part('groceries', '80'), part('c-notmineatall00', '40')], -12000, usable)), /category for each/)
    assert.match(problem(checkSplit([part('groceries', '80'), part('shopping', '-40')], -12000, usable)), /as a number/)
    assert.match(problem(checkSplit([part('groceries', '120'), part('shopping', '0')], -12000, usable)), /Each part needs an amount/)
    assert.match(problem(checkSplit([part('groceries', '1'), part('shopping', '1')], 0, usable)), /\$0\.00/)
    assert.match(problem(checkSplit('groceries', -12000, usable)), /parts/)
    const many = Array.from({ length: MAX_PARTS + 1 }, (_, i) => part(['groceries', 'shopping', 'dining', 'other', 'transfer', 'income', 'c-abcdefghijklmno'][i % 7], '1'))
    assert.ok(problem(checkSplit(many, -1100, usable)), 'more parts than allowed, even before merging')
  })
})

describe('the stored parts', () => {
  test('are read only when they\'re a list of real parts', () => {
    const parts = [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }]
    assert.deepEqual(partsOf(parts), parts)
    for (const v of [null, undefined, [], 'x', [parts[0]], [parts[0], { category: 'shopping', amount_cents: 1.5 }], [parts[0], { category: '', amount_cents: -1 }], [parts[0], null]]) {
      assert.deepEqual(partsOf(v), [], JSON.stringify(v))
    }
  })

  test('leave nothing over when they add up, and say what\'s left when the amount changed', () => {
    const splits = [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }]
    assert.equal(leftOver({ ...costco, splits }), 0)
    assert.equal(leftOver({ ...costco, amount_cents: -12500, splits }), -500)
    assert.equal(leftOver(costco), 0)
  })
})

describe('totals', () => {
  const splits = [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }]
  const coffee = { account: 'a', posted: '2026-11-03', amount_cents: -450, category: 'dining' }

  test('count a split one as its parts, and the rest as it is', () => {
    const rows = expandSplits([{ ...costco, splits }, coffee])
    assert.deepEqual(rows.map(r => [r.category, r.amount_cents, r.posted, r.account]),
      [['groceries', -8000, '2026-11-02', 'a'], ['shopping', -4000, '2026-11-02', 'a'], ['dining', -450, '2026-11-03', 'a']])
    const s = summarize(rows)
    assert.equal(s.spent_cents, 12450)
    assert.deepEqual(s.categories.map(c => [c.id, c.total_cents, c.count]), [['groceries', 8000, 1], ['shopping', 4000, 1], ['dining', 450, 1]])
  })

  test('still add up to the money that moved when the amount changed: the left-over stays in its own category', () => {
    const rows = expandSplits([{ ...costco, amount_cents: -12500, splits }])
    assert.deepEqual(rows.map(r => [r.category, r.amount_cents]), [['groceries', -8000], ['shopping', -4000], ['groceries', -500]])
    assert.equal(rows.reduce((n, r) => n + r.amount_cents, 0), -12500)
  })

  test('move part of a charge out of spending, on Overview\'s months and on Taxes', () => {
    // A $200 deposit that's $150 pay and $50 paid back by a friend.
    const pay = { account: 'a', posted: '2026-11-05', amount_cents: 20000, category: 'income', splits: [{ category: 'income', amount_cents: 15000 }, { category: 'transfer', amount_cents: 5000 }] }
    const rows = expandSplits([pay, { ...costco, splits }])
    const [m] = monthly(rows, ['2026-11'])
    assert.deepEqual([m.income_cents, m.spent_cents], [15000, 12000])
    const plain = monthly([pay, costco], ['2026-11'])[0]
    assert.equal(plain.income_cents, 20000)
    // A $300 charge that's $250 of estimated tax and $50 of a fee.
    const irs = { account: 'a', posted: '2026-11-06', amount_cents: -30000, category: 'taxes', splits: [{ category: 'taxes', amount_cents: -25000 }, { category: 'fees', amount_cents: -5000 }] }
    const year = taxYear(expandSplits([pay, irs]), [{ id: 'a', kind: 'checking' }], '2026-11-30', '2026-01-01')
    assert.deepEqual([year.income_cents, year.tax_paid_cents], [15000, 25000])
  })
})

describe('the hook checks what\'s saved the same way', () => {
  const huse = usable

  test('a split the form makes is one the hook stores', () => {
    for (const [input, amount] of [
      [[part('groceries', '80'), part('shopping', '40')], -12000],
      [[part('groceries', '50'), part('shopping', '40'), part('groceries', '30')], -12000],
      [[part('income', '1,000'), part('transfer', '200.50')], 120050],
      [[part('c-abcdefghijklmno', '0.01'), part('other', '0.02')], -3],
    ]) {
      const ok = checkSplit(input, amount, usable).ok
      assert.deepEqual(hook.checkStored(ok, amount, huse), { parts: ok }, JSON.stringify(input))
      assert.deepEqual(partsOf(ok), ok)
    }
  })

  test('an empty list or null is no split', () => {
    assert.deepEqual(hook.checkStored([], -100, huse), { parts: null })
    assert.deepEqual(hook.checkStored(null, -100, huse), { parts: null })
  })

  test('refuses what the form would never send', () => {
    const g = { category: 'groceries', amount_cents: -8000 }
    for (const [value, amount] of [
      [[g, { category: 'shopping', amount_cents: -3999 }], -12000], // doesn't add up
      [[g, { category: 'shopping', amount_cents: 4000 }, { category: 'dining', amount_cents: -8000 }], -12000], // a part the wrong way
      [[g, { category: 'groceries', amount_cents: -4000 }], -12000], // the same category twice
      [[g, { category: 'c-notmineatall00', amount_cents: -4000 }], -12000], // not their category
      [[g, { category: 'shopping', amount_cents: -40.5 }], -12040.5],
      [[{ category: 'groceries', amount_cents: -12000 }], -12000], // one part
      [Array.from({ length: hook.MAX_PARTS + 1 }, () => ({ category: 'groceries', amount_cents: -1 })), -(hook.MAX_PARTS + 1)],
      ['[{"category":"groceries"}]', -1],
      [{ category: 'groceries', amount_cents: -1 }, -1],
      [[g, { category: 'shopping', amount_cents: 0 }], -8000],
      [[{ category: 'groceries', amount_cents: 1 }, { category: 'shopping', amount_cents: -1 }], 0],
    ]) {
      assert.ok(hook.checkStored(value, amount, huse).problem, JSON.stringify(value))
    }
  })

  test('the same limits', () => {
    assert.deepEqual([hook.MIN_PARTS, hook.MAX_PARTS], [MIN_PARTS, MAX_PARTS])
  })

  test('parts in a category that\'s deleted move to Other, joining a part there', () => {
    const parts = [{ category: 'c-abcdefghijklmno', amount_cents: -5000 }, { category: 'other', amount_cents: -1000 }, { category: 'groceries', amount_cents: -6000 }]
    assert.deepEqual(hook.moveParts(parts, 'c-abcdefghijklmno', 'other'), [{ category: 'other', amount_cents: -6000 }, { category: 'groceries', amount_cents: -6000 }])
    assert.equal(hook.moveParts([{ category: 'c-abcdefghijklmno', amount_cents: -5000 }, { category: 'other', amount_cents: -1000 }], 'c-abcdefghijklmno', 'other'), null)
  })
})
