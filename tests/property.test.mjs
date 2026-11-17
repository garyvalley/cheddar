// Home and car values that change at a yearly rate (shared/property.ts),
// and the account edit that sets one (shared/accounts.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkYearlyChange, daysBetween, valueAfter, yearlyChangeWords } from '../shared/property.ts'
import { checkAccountChange } from '../shared/accounts.ts'

test('checkYearlyChange: a percent as typed, to basis points', () => {
  assert.deepEqual(checkYearlyChange('3'), { ok: 300 })
  assert.deepEqual(checkYearlyChange('-15'), { ok: -1500 })
  assert.deepEqual(checkYearlyChange(' 2.5% '), { ok: 250 })
  assert.deepEqual(checkYearlyChange('−7'), { ok: -700 })
  assert.deepEqual(checkYearlyChange(''), { ok: 0 })
  assert.deepEqual(checkYearlyChange(4), { ok: 400 })
  for (const bad of ['lots', '60', '-50.5', '3.333', '1e2']) assert.ok('problem' in checkYearlyChange(bad), bad)
})

test('valueAfter compounds by the day, to the cent', () => {
  assert.equal(valueAfter(50_000_000, 300, 365), 51_500_000)
  assert.equal(valueAfter(2_000_000, -1500, 365), 1_700_000)
  // Day by day comes to the same, give or take rounding.
  let v = 2_000_000
  for (let d = 0; d < 365; d++) v = valueAfter(v, -1500, 1)
  assert.ok(Math.abs(v - 1_700_000) <= 200, String(v))
  assert.equal(valueAfter(12345, 0, 400), 12345)
  assert.equal(valueAfter(12345, 300, 0), 12345)
})

test('words and days', () => {
  assert.equal(yearlyChangeWords(300), 'Grows 3% a year')
  assert.equal(yearlyChangeWords(-1550), 'Loses 15.5% a year')
  assert.equal(yearlyChangeWords(0), '')
  assert.equal(daysBetween('2026-02-27', '2026-03-01'), 2)
})

test('checkAccountChange: a yearly change is for property only, and goes when it stops being property', () => {
  const home = { name: 'Home', kind: 'property', institution: '', last4: '' }
  assert.deepEqual(checkAccountChange({ yearly_change: '3' }, home, '2026-11-17'), { ok: { yearly_change_bp: 300 } })
  const checking = { ...home, kind: 'checking' }
  assert.ok('problem' in checkAccountChange({ yearly_change: '3' }, checking, '2026-11-17'))
  assert.deepEqual(checkAccountChange({ yearly_change: '' }, checking, '2026-11-17'), { ok: { yearly_change_bp: 0 } })
  const r = checkAccountChange({ kind: 'other' }, home, '2026-11-17')
  assert.equal(r.ok.yearly_change_bp, 0)
})
