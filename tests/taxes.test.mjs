// Unit tests for the Taxes page's federal estimate and ideas (shared/taxes.ts).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { FEDERAL, NEWEST_TAX_YEAR, brackets, defaultTaxYear, estimate, federalFor, ideas, projectIncome, taxYear, taxYearsOn } from '../shared/taxes.ts'
import { STATE_TAXES, stateTableYear } from '../shared/state-taxes.ts'
import { FILING_STATUSES } from '../shared/filing-status.ts'

describe('estimate', () => {
  test('takes the standard deduction and taxes each bracket at its own rate', () => {
    const e = estimate(100_000_00, 'single')
    assert.equal(e.taxable_cents, 83_900_00)
    // 10% of 12,400 + 12% of 38,000 + 22% of 33,500
    assert.equal(e.tax_cents, 1_240_00 + 4_560_00 + 7_370_00)
    assert.equal(e.marginal, 22)
    assert.equal(e.to_next_cents, 105_700_00 - 83_900_00)
    assert.equal(e.in_top_cents, 33_500_00)
  })

  test('joint returns get the wider brackets and the bigger deduction', () => {
    const e = estimate(100_000_00, 'married_joint')
    assert.equal(e.taxable_cents, 67_800_00)
    assert.equal(e.tax_cents, 2_480_00 + Math.round(43_000_00 * 0.12))
    assert.equal(e.marginal, 12)
  })

  test('no income under the deduction is taxed', () => {
    const e = estimate(10_000_00, 'head_of_household')
    assert.deepEqual([e.taxable_cents, e.tax_cents, e.marginal, e.effective], [0, 0, 10, 0])
  })

  test('the top bracket has no end', () => {
    const e = estimate(2_000_000_00, 'married_separate')
    assert.equal(e.marginal, 37)
    assert.equal(e.to_next_cents, null)
    assert.equal(e.brackets.reduce((n, b) => n + b.taxed_cents, 0), e.taxable_cents)
  })

  test('every filing status has seven rising brackets', () => {
    for (const { value } of FILING_STATUSES) {
      const b = brackets(value)
      assert.equal(b.length, 7)
      for (let i = 1; i < b.length; i++) assert.equal(b[i].from_cents, b[i - 1].to_cents)
    }
  })
})

describe('the year so far', () => {
  const accounts = [{ id: 'chk', kind: 'checking' }, { id: 'ira', kind: 'retirement' }, { id: 'brk', kind: 'brokerage' }]
  const rows = [
    { account: 'chk', posted: '2025-12-31', amount_cents: 500_00, category: 'income' },
    { account: 'chk', posted: '2026-01-15', amount_cents: 3_000_00, category: 'income' },
    { account: 'chk', posted: '2026-04-15', amount_cents: -1_200_00, category: 'taxes' },
    { account: 'chk', posted: '2026-05-01', amount_cents: -1_000_00, category: 'transfer' },
    { account: 'ira', posted: '2026-05-01', amount_cents: 1_000_00, category: 'transfer' },
    { account: 'chk', posted: '2026-06-01', amount_cents: -80_00, category: 'health' },
    { account: 'chk', posted: '2026-06-02', amount_cents: -50_00, category: 'gifts' },
  ]

  test('adds up income, tax payments and money moved into retirement accounts', () => {
    const t = taxYear(rows, accounts, '2026-07-01', '2025-12-31')
    assert.deepEqual(
      [t.from, t.income_cents, t.tax_paid_cents, t.retirement_in_cents, t.health_cents, t.gifts_cents, t.has_brokerage, t.has_retirement],
      ['2026-01-01', 3_000_00, 1_200_00, 1_000_00, 80_00, 50_00, true, true],
    )
  })

  test('starts from the first transaction when Cheddar has none from January', () => {
    assert.equal(taxYear(rows.slice(1), accounts, '2026-07-01', '2026-01-15').from, '2026-01-15')
  })

  test('projects income through December only once there are four weeks of it', () => {
    assert.equal(projectIncome(1_000_00, '2026-01-01', '2026-01-20'), null)
    assert.equal(projectIncome(1_000_00, '2026-07-02', '2026-12-31'), Math.round(1_000_00 * 365 / 183))
    assert.equal(projectIncome(1_000_00, '2026-01-01', '2026-12-31'), 1_000_00)
  })
})

describe('ideas', () => {
  const year = { year: 2026, from: '2026-01-01', to: '2026-11-09', income_cents: 0, tax_paid_cents: 0, retirement_in_cents: 0, health_cents: 0, gifts_cents: 0, projected_income_cents: null, has_brokerage: false, has_retirement: false }
  const ids = list => list.map(i => i.id)

  test('suggest saving before tax at 22% and up, and coming down a bracket when it\'s close', () => {
    assert.deepEqual(ids(ideas(estimate(70_000_00, 'single'), year, 'Ohio', 2.75)), ['pre-tax', 'bracket'])
    assert.deepEqual(ids(ideas(estimate(400_000_00, 'single'), year, 'Ohio', 2.75)), ['pre-tax'])
  })

  test('suggest Roth in the low brackets, and 0% gains only with a brokerage account', () => {
    assert.deepEqual(ids(ideas(estimate(40_000_00, 'single'), year, 'Texas', 0)), ['roth'])
    assert.deepEqual(ids(ideas(estimate(40_000_00, 'single'), { ...year, has_brokerage: true }, 'Texas', 0)), ['roth', 'zero-gains'])
  })

  test('mention an HSA and charity only for those who spend on them, and nothing without income', () => {
    const y = { ...year, health_cents: 500_00, gifts_cents: 100_00 }
    assert.deepEqual(ids(ideas(estimate(40_000_00, 'married_joint'), y, 'Ohio', 2.75)), ['roth', 'hsa', 'charity'])
    assert.deepEqual(ideas(estimate(0, 'single'), y, 'Ohio', 2.75), [])
  })

  test('leave state tax out where there is none', () => {
    assert.doesNotMatch(ideas(estimate(90_000_00, 'single'), year, 'Florida', 0)[0].body, /Florida/)
    assert.match(ideas(estimate(90_000_00, 'single'), year, 'Ohio', 2.75)[0].body, /Ohio's by about \$28\./)
  })
})

describe('tax years (#32)', () => {
  test('last year is shown first until April 15, then this year', () => {
    assert.equal(defaultTaxYear('2027-01-01'), 2026)
    assert.equal(defaultTaxYear('2027-04-15'), 2026)
    assert.equal(defaultTaxYear('2027-04-16'), 2027)
    assert.deepEqual(taxYearsOn('2027-02-01'), [2027, 2026])
  })

  test('a year without figures uses the newest year before it, and says which', () => {
    assert.equal(federalFor(NEWEST_TAX_YEAR).table_year, NEWEST_TAX_YEAR)
    assert.equal(federalFor(NEWEST_TAX_YEAR + 1).table_year, NEWEST_TAX_YEAR)
    assert.equal(estimate(100_000_00, 'single', NEWEST_TAX_YEAR + 1).table_year, NEWEST_TAX_YEAR)
    assert.equal(estimate(100_000_00, 'single', NEWEST_TAX_YEAR + 1).year, NEWEST_TAX_YEAR + 1)
    assert.equal(stateTableYear(NEWEST_TAX_YEAR + 1), NEWEST_TAX_YEAR)
  })

  test('the newest year has federal and state figures', () => {
    assert.ok(NEWEST_TAX_YEAR in STATE_TAXES)
    for (const y of Object.keys(STATE_TAXES)) assert.ok(y in FEDERAL, y)
  })

  test('2025 has its own federal figures, and no charity deduction without itemizing yet', () => {
    const e = estimate(100_000_00, 'single', 2025)
    assert.deepEqual([e.table_year, e.deduction_cents, e.marginal], [2025, 15_750_00, 22])
    const y = { year: 2025, from: '2025-01-01', to: '2025-12-31', income_cents: 0, tax_paid_cents: 0, retirement_in_cents: 0, health_cents: 0, gifts_cents: 100_00, projected_income_cents: null, has_brokerage: false, has_retirement: false }
    assert.equal(ideas(e, y, 'Ohio', 2.75).some(i => i.id === 'charity'), false)
  })

  test('a past year runs to December 31 and counts only its own days', () => {
    const rows = [
      { account: 'chk', posted: '2026-12-31', amount_cents: 500_00, category: 'income' },
      { account: 'chk', posted: '2027-01-02', amount_cents: 700_00, category: 'income' },
    ]
    const t = taxYear(rows, [], '2027-02-01', '2026-01-01', 2026)
    assert.deepEqual([t.year, t.from, t.to, t.income_cents, t.projected_income_cents], [2026, '2026-01-01', '2026-12-31', 500_00, 500_00])
  })

  // The autumn update can't be forgotten: from February of a year Cheddar has
  // no figures for, this fails until shared/taxes.ts and
  // shared/state-taxes.ts have them.
  test('this year\'s figures are in by February', () => {
    const today = new Date().toISOString().slice(0, 10)
    const due = `${NEWEST_TAX_YEAR + 1}-02-01`
    assert.ok(today < due, `Add ${NEWEST_TAX_YEAR + 1}'s federal and state tax figures (FEDERAL in shared/taxes.ts, STATE_TAXES in shared/state-taxes.ts).`)
  })
})
