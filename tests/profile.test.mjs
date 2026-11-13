// Unit tests for shared/profile.ts, shared/states.ts and shared/time-zone.ts:
// what a profile change may hold, the places a person files state tax in, and
// "today" in the person's own time zone.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkProfile } from '../shared/profile.ts'
import { STATES, stateByCode } from '../shared/states.ts'
import { localToday } from '../shared/categories.ts'
import { timeZoneChoices, timeZoneLabel, todayIn, US_ZONES } from '../shared/time-zone.ts'
import { loadHookModule } from './load-hook-module.mjs'

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

describe('time zones', () => {
  test('a profile change takes a real zone, or clears it', () => {
    assert.deepEqual(checkProfile({ time_zone: 'America/Los_Angeles' }), { ok: { time_zone: 'America/Los_Angeles' } })
    assert.deepEqual(checkProfile({ time_zone: '' }), { ok: { time_zone: '' } })
    assert.ok('problem' in checkProfile({ time_zone: 'Mars/Olympus_Mons' }))
    assert.ok('problem' in checkProfile({ time_zone: 42 }))
    assert.ok('problem' in checkProfile({ time_zone: 'x'.repeat(65) }))
  })

  test('23:30 in Los Angeles on Dec 31 is still the old year, though UTC is in the new one', () => {
    const now = new Date('2027-01-01T07:30:00Z')
    assert.equal(todayIn('America/Los_Angeles', now), '2026-12-31')
    assert.equal(todayIn('America/New_York', now), '2027-01-01')
    assert.equal(todayIn('UTC', now), '2027-01-01')
  })

  test('an evening in Los Angeles at month end is still that month', () => {
    assert.equal(todayIn('America/Los_Angeles', new Date('2026-12-01T01:00:00Z')), '2026-11-30')
    assert.equal(todayIn('Pacific/Honolulu', new Date('2026-11-14T09:59:00Z')), '2026-11-13')
  })

  test('a zone that isn\'t known falls back to where the code runs', () => {
    const now = new Date('2026-06-15T12:00:00Z')
    assert.equal(todayIn('', now), localToday(now))
    assert.equal(todayIn('Nowhere/Special', now), localToday(now))
  })

  test('the choices put the US zones first, each once, and keep a saved one', () => {
    const list = timeZoneChoices()
    assert.deepEqual(list.slice(0, US_ZONES.length).map(z => z.zone), US_ZONES.map(z => z.zone))
    assert.equal(new Set(list.map(z => z.zone)).size, list.length)
    assert.equal(timeZoneLabel('America/Los_Angeles'), 'Pacific (Los Angeles)')
    assert.equal(timeZoneLabel('Europe/Isle_of_Man'), 'Europe / Isle of Man')
  })
})

describe('the hooks\' own "today"', () => {
  const dates = loadHookModule('pb_hooks/lib/dates.js')
  const NOW = Date.parse('2026-11-14T03:30:00Z')

  test('takes the person\'s day when it is within a day of UTC\'s', () => {
    assert.equal(dates.personToday('2026-11-13', NOW), '2026-11-13')
    assert.equal(dates.personToday('2026-11-15', NOW), '2026-11-15')
  })

  test('falls back to the UTC day for anything else', () => {
    assert.equal(dates.personToday(undefined, NOW), '2026-11-14')
    assert.equal(dates.personToday('2026-11-11', NOW), '2026-11-14')
    assert.equal(dates.personToday('2026-02-30', NOW), '2026-11-14')
    assert.equal(dates.personToday('soon', NOW), '2026-11-14')
  })
})
