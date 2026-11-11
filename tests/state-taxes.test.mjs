// Unit tests for the Taxes page's state estimate (shared/state-taxes.ts).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { STATE_TAX, stateEstimate } from '../shared/state-taxes.ts'
import { STATES } from '../shared/states.ts'
import { estimate } from '../shared/taxes.ts'

describe('state tax figures', () => {
  test('every state that taxes wages has them, and no other state does', () => {
    for (const s of STATES) assert.equal(s.code in STATE_TAX, s.incomeTax, s.code)
    assert.equal(Object.keys(STATE_TAX).length, STATES.filter(s => s.incomeTax).length)
  })

  test('each schedule starts at or above zero and rises', () => {
    for (const [code, t] of Object.entries(STATE_TAX)) {
      for (const schedule of [t.single, t.joint]) {
        assert.ok(schedule.length > 0, code)
        for (let i = 0; i < schedule.length; i++) {
          const [rate, from] = schedule[i]
          assert.ok(rate >= 0 && rate < 15, `${code} rate ${rate}`)
          assert.ok(from >= 0, code)
          if (i) assert.ok(from > schedule[i - 1][1] && rate > schedule[i - 1][0], `${code} bracket ${i}`)
        }
      }
    }
  })
})

describe('stateEstimate', () => {
  test('is null with no state, or where wages aren\'t taxed', () => {
    assert.equal(stateEstimate(undefined, 100_000_00, 'single'), null)
    assert.equal(stateEstimate('TX', 100_000_00, 'single'), null)
    assert.equal(stateEstimate('WA', 100_000_00, 'single'), null)
  })

  test('a flat tax with no deduction taxes every dollar', () => {
    const e = stateEstimate('PA', 100_000_00, 'single')
    assert.deepEqual([e.taxable_cents, e.tax_cents, e.marginal], [100_000_00, 3_070_00, 3.07])
  })

  test('takes the exemption off income', () => {
    const e = stateEstimate('IL', 100_000_00, 'married_joint')
    assert.equal(e.deduction_cents, 5_850_00)
    assert.equal(e.tax_cents, Math.round((100_000_00 - 5_850_00) * 0.0495))
  })

  test('taxes each bracket at its own rate, after the standard deduction', () => {
    const e = stateEstimate('CA', 100_000_00, 'single')
    const taxable = 100_000 - 5_540
    const gross = 0.01 * 11_079 + 0.02 * (26_264 - 11_079) + 0.04 * (41_452 - 26_264) + 0.06 * (57_542 - 41_452)
      + 0.08 * (72_724 - 57_542) + 0.093 * (taxable - 72_724)
    assert.equal(e.taxable_cents, taxable * 100)
    assert.equal(e.credit_cents, 153_00, 'California\'s exemption is a credit')
    assert.equal(e.tax_cents, Math.round(gross * 100) - 153_00)
    assert.equal(e.marginal, 9.3)
  })

  test('nothing is taxed below a schedule that starts above zero', () => {
    const low = stateEstimate('ND', 40_000_00, 'single')
    assert.deepEqual([low.taxable_cents, low.tax_cents, low.marginal], [23_900_00, 0, 0])
    const oh = stateEstimate('OH', 50_000_00, 'single')
    assert.equal(oh.tax_cents, Math.round((50_000 - 2_400 - 26_050) * 2.75))
    assert.equal(oh.marginal, 2.75)
  })

  test('a credit never takes the tax below zero', () => {
    const e = stateEstimate('UT', 10_000_00, 'single')
    assert.equal(e.tax_cents, 0)
    assert.equal(e.credit_cents, 450_00)
  })

  test('joint filers use the joint schedule, others the single one', () => {
    const joint = stateEstimate('MN', 120_000_00, 'married_joint')
    const qss = stateEstimate('MN', 120_000_00, 'qualifying_surviving_spouse')
    const hoh = stateEstimate('MN', 120_000_00, 'head_of_household')
    const single = stateEstimate('MN', 120_000_00, 'single')
    assert.equal(joint.tax_cents, qss.tax_cents)
    assert.equal(hoh.tax_cents, single.tax_cents)
    assert.ok(joint.tax_cents < single.tax_cents)
  })

  test('Alabama deducts federal tax paid', () => {
    const fed = estimate(100_000_00, 'single').tax_cents
    const without = stateEstimate('AL', 100_000_00, 'single')
    const withFed = stateEstimate('AL', 100_000_00, 'single', fed)
    assert.equal(without.tax_cents - withFed.tax_cents, Math.round(fed * 0.05))
  })

  test('no income, no tax', () => {
    const e = stateEstimate('NY', 0, 'single')
    assert.deepEqual([e.tax_cents, e.effective, e.marginal], [0, 0, 0])
  })
})
