// Unit tests for shared/profile.ts and shared/states.ts: what a profile
// change may hold, and the list of places a person files state tax in.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkProfile } from '../shared/profile.ts'
import { STATES, stateByCode } from '../shared/states.ts'

describe('the states', () => {
  test('are the 50 states and DC, each once', () => {
    assert.equal(STATES.length, 51)
    assert.equal(new Set(STATES.map(s => s.code)).size, 51)
    assert.ok(STATES.every(s => /^[A-Z]{2}$/.test(s.code)))
  })

  test('mark the nine with no tax on wages', () => {
    assert.deepEqual(STATES.filter(s => !s.incomeTax).map(s => s.code).sort(),
      ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY'])
  })

  test('are found by exact code only', () => {
    assert.equal(stateByCode('CA')?.name, 'California')
    assert.equal(stateByCode('ca'), undefined)
    assert.equal(stateByCode(''), undefined)
    assert.equal(stateByCode(42), undefined)
  })
})

describe('checkProfile', () => {
  test('passes a valid change through, trimming the name', () => {
    assert.deepEqual(checkProfile({ name: '  Pat ', state: 'CA', filing_status: 'single' }),
      { ok: { name: 'Pat', state: 'CA', filing_status: 'single' } })
  })

  test('returns only the fields sent, and allows clearing them', () => {
    assert.deepEqual(checkProfile({ state: '' }), { ok: { state: '' } })
    assert.deepEqual(checkProfile({ filing_status: '' }), { ok: { filing_status: '' } })
    assert.deepEqual(checkProfile({}), { ok: {} })
  })

  test('refuses what is not a state, a filing status or a short name', () => {
    assert.ok('problem' in checkProfile({ state: 'ZZ' }))
    assert.ok('problem' in checkProfile({ state: null }))
    assert.ok('problem' in checkProfile({ filing_status: 'married' }))
    assert.ok('problem' in checkProfile({ name: 'x'.repeat(101) }))
    assert.ok('problem' in checkProfile({ name: 7 }))
  })

  test('takes a known color theme and light, dark or automatic, and nothing else', () => {
    assert.deepEqual(checkProfile({ theme: 'cheddar', appearance: 'dark' }), { ok: { theme: 'cheddar', appearance: 'dark' } })
    assert.deepEqual(checkProfile({ theme: 'violet', appearance: 'system' }), { ok: { theme: 'violet', appearance: 'system' } })
    for (const theme of ['blue', 'rose', 'mint']) assert.deepEqual(checkProfile({ theme }), { ok: { theme } })
    for (const bad of [{ theme: '' }, { theme: 'orange' }, { theme: null }, { appearance: '' }, { appearance: 'auto' }, { appearance: 1 }]) {
      assert.ok('problem' in checkProfile(bad), JSON.stringify(bad))
    }
  })
})
