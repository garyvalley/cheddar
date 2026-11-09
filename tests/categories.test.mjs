// Unit tests for spending categories: how pb_hooks/lib/categories.js sorts a
// transaction, the merchant a learned rule matches, and shared/categories.ts's
// totals and periods.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'
import { CATEGORIES, categoryLabel, periodOf, summarize } from '../shared/categories.ts'

const cats = loadHookModule('pb_hooks/lib/categories.js')
const sort = (description, amount_cents, more = {}) => cats.categorize({ description, payee: '', bank_category: '', amount_cents, liability: false, ...more }, more.rule ?? '')

test('the browser\'s list is the hooks\' list', () => {
  assert.deepEqual(CATEGORIES.map(c => ({ ...c })), cats.CATEGORIES)
})

describe('categorize', () => {
  test('follows the person\'s rule before anything else', () => {
    assert.deepEqual(sort('WHOLE FOODS', -5000, { rule: 'shopping', bank_category: 'FOOD_AND_DRINK_GROCERIES' }), { category: 'shopping', by: 'rule' })
  })

  test('ignores a rule naming no category', () => {
    assert.equal(sort('WHOLE FOODS', -5000, { rule: 'nonsense' }).category, 'groceries')
  })

  test('takes the bank\'s category next', () => {
    assert.deepEqual(sort('SOMETHING', -500, { bank_category: 'FOOD_AND_DRINK_COFFEE' }), { category: 'dining', by: 'bank' })
    assert.equal(sort('X', -500, { bank_category: 'FOOD_AND_DRINK_GROCERIES' }).category, 'groceries')
    assert.equal(sort('X', -500, { bank_category: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }).category, 'transfer')
    assert.equal(sort('X', 500, { bank_category: 'TRANSFER_IN_ACCOUNT_TRANSFER' }).category, 'transfer')
    assert.equal(sort('X', 500, { bank_category: 'INCOME' }).category, 'income')
    assert.equal(sort('X', -500, { bank_category: 'RENT_AND_UTILITIES_RENT' }).category, 'housing')
    assert.equal(sort('X', -500, { bank_category: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE' }).category, 'utilities')
  })

  test('then what the description says', () => {
    const cases = [
      ['STARBUCKS STORE #1234 SEATTLE WA', -450, 'dining'],
      ['SQ *BLUE BOTTLE COFFEE', -500, 'dining'],
      ['GROCERY, INC', -8210, 'groceries'],
      ['PUBLIX #123', -5000, 'groceries'],
      ['TRADER JOE\'S #552', -6000, 'groceries'],
      ['UBER EATS', -1500, 'dining'],
      ['UBER *TRIP', -1500, 'transport'],
      ['SHELL OIL 5744', -4000, 'transport'],
      ['NETFLIX.COM', -1599, 'entertainment'],
      ['AMAZON.COM*AB12CD AMZN.COM/BILL WA', -2999, 'shopping'],
      ['COMCAST CABLE', -8000, 'utilities'],
      ['RENT', -180000, 'housing'],
      ['PAYROLL ACME', 320000, 'income'],
      ['CHASE CREDIT CARD PAYMENT', -50000, 'transfer'],
      ['MONTHLY SERVICE FEE', -1200, 'fees'],
    ]
    for (const [d, a, want] of cases) assert.equal(sort(d, a).category, want, d)
  })

  test('matches whole words: a pub is not Publix, nor a spa a spark plug', () => {
    assert.equal(sort('PUBLIX', -100).category, 'groceries')
    assert.equal(sort('SPARK PLUGS', -100).category, 'other')
  })

  test('a refund goes back against its category; money out is never income', () => {
    assert.deepEqual(sort('AMAZON REFUND', 2500), { category: 'shopping', by: 'match' })
    assert.equal(sort('PAYROLL CORRECTION', -100).category, 'other')
  })

  test('falls back to income for money in, a payment for a card\'s, and Other for money out', () => {
    assert.deepEqual(sort('MYSTERY', 1000), { category: 'income', by: 'default' })
    assert.deepEqual(sort('MYSTERY', 1000, { liability: true }), { category: 'transfer', by: 'default' })
    assert.deepEqual(sort('MYSTERY', -1000), { category: 'other', by: 'default' })
    assert.deepEqual(sort('', -1000), { category: 'other', by: 'default' })
  })
})

describe('merchantKey', () => {
  test('is the same merchant across stores, card processors and reference numbers', () => {
    assert.equal(cats.merchantKey('', 'STARBUCKS STORE #1234 SEATTLE WA'), cats.merchantKey('', 'Starbucks Store 88 Portland OR'))
    assert.equal(cats.merchantKey('', 'SQ *BLUE BOTTLE COFFEE'), 'blue bottle')
    assert.equal(cats.merchantKey('', 'POS DEBIT TST* JOE\'S PIZZA 0042'), 'joes pizza')
  })

  test('prefers the payee the bank named, and tells Uber Eats from an Uber ride', () => {
    assert.equal(cats.merchantKey('Uber', 'UBER 072515 SF**POOL**'), 'uber')
    assert.notEqual(cats.merchantKey('', 'UBER EATS'), cats.merchantKey('', 'UBER TRIP'))
  })

  test('is empty with nothing to go on', () => {
    assert.equal(cats.merchantKey('', ''), '')
    assert.equal(cats.merchantKey('', '#1234 0001'), '')
  })
})

describe('summarize', () => {
  test('adds each category up, refunds against spending, and leaves income and transfers out of it', () => {
    const s = summarize([
      { amount_cents: -5000, category: 'groceries' },
      { amount_cents: -2000, category: 'groceries' },
      { amount_cents: 1000, category: 'groceries' }, // a refund
      { amount_cents: -9000, category: 'dining' },
      { amount_cents: -700, category: '' }, // not sorted yet
      { amount_cents: 250000, category: 'income' },
      { amount_cents: -50000, category: 'transfer' },
    ])
    assert.deepEqual(s.categories.map(c => [c.id, c.total_cents, c.count]), [
      ['dining', 9000, 1], ['groceries', 6000, 3], ['other', 700, 1], ['income', 250000, 1], ['transfer', -50000, 1],
    ])
    assert.equal(s.spent_cents, 15700)
    assert.equal(s.income_cents, 250000)
    assert.equal(categoryLabel(''), 'Other')
  })
})

describe('periodOf', () => {
  test('a month, with the months either side, across a year end', () => {
    assert.deepEqual(periodOf('month', '2026-12', '2026-11-09'), {
      kind: 'month', at: '2026-12', from: '2026-12-01', to: '2026-12-31', label: 'December 2026', prev: '2026-11', next: '2027-01',
    })
    assert.equal(periodOf('month', '2028-02', '2026-11-09').to, '2028-02-29')
    assert.equal(periodOf('month', '2026-01', '2026-11-09').prev, '2025-12')
  })

  test('this month or year when none is named, or a malformed one', () => {
    assert.equal(periodOf('month', undefined, '2026-11-09').at, '2026-11')
    assert.equal(periodOf('month', '2026-13', '2026-11-09').at, '2026-11')
    assert.deepEqual([periodOf('year', 'x', '2026-11-09').from, periodOf('year', '2025', '2026-11-09').to], ['2026-01-01', '2025-12-31'])
  })
})
