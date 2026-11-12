// Unit tests for shared/overlap.ts and pb_hooks/lib/overlap.js: when a
// statement's row and a bank link's transaction are the same money.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'
import { MATCH_DAYS, alreadySynced, around, daysApart, nearest } from '../shared/overlap.ts'

const hook = loadHookModule('pb_hooks/lib/overlap.js')
const row = (posted, amount_cents) => ({ posted, amount_cents })

describe('matching a statement row to a synced one', () => {
  test('needs the same amount, at most four days apart', () => {
    const synced = [row('2026-10-10', -475)]
    assert.equal(nearest(row('2026-10-10', -475), synced), 0)
    assert.equal(nearest(row('2026-10-06', -475), synced), 0)
    assert.equal(nearest(row('2026-10-14', -475), synced), 0)
    assert.equal(nearest(row('2026-10-05', -475), synced), -1)
    assert.equal(nearest(row('2026-10-10', -476), synced), -1)
    assert.equal(nearest(row('2026-10-10', 475), synced), -1, 'a refund isn\'t the charge')
  })

  test('picks the nearest date, the earlier on a tie, and never one already taken', () => {
    const synced = [row('2026-10-01', -500), row('2026-10-03', -500), row('2026-10-05', -500)]
    assert.equal(nearest(row('2026-10-04', -500), synced), 1)
    assert.equal(nearest(row('2026-10-04', -500), synced, new Set([1])), 2)
    assert.equal(nearest(row('2026-10-02', -500), synced), 0)
  })

  test('one for one: two identical coffees in a statement and one from the bank leave one to add', () => {
    const synced = [row('2026-10-10', -475)]
    assert.deepEqual(alreadySynced([row('2026-10-10', -475), row('2026-10-10', -475), row('2026-10-11', -1200)], synced), [true, false, false])
    assert.deepEqual(alreadySynced([row('2026-01-01', -100)], []), [false])
  })

  test('counts days across months and years, either way round', () => {
    assert.equal(daysApart('2026-02-27', '2026-03-02'), 3)
    assert.equal(daysApart('2027-01-02', '2026-12-30'), 3)
    assert.deepEqual(around('2026-01-02', '2026-01-31'), { from: '2025-12-29', to: '2026-02-04' })
    assert.deepEqual(around('2026-03-01'), { from: '2026-02-25', to: '2026-03-05' })
  })
})

describe('the hooks\' copy', () => {
  test('matches the same way as the import\'s', () => {
    assert.equal(hook.MATCH_DAYS, MATCH_DAYS)
    const synced = [row('2026-10-01', -500), row('2026-10-03', -500), row('2026-10-09', -500), row('2026-10-03', -900)]
    for (const r of [row('2026-10-02', -500), row('2026-10-04', -500), row('2026-10-14', -500), row('2026-10-03', -900), row('2026-09-26', -500), row('2026-10-07', -100)]) {
      assert.equal(hook.nearest(r, synced), nearest(r, synced), JSON.stringify(r))
      assert.equal(hook.nearest(r, synced, { 1: true }), nearest(r, synced, new Set([1])), JSON.stringify(r))
    }
    for (const [a, b] of [['2026-02-27', '2026-03-02'], ['2027-01-02', '2026-12-30']]) assert.equal(hook.daysApart(a, b), daysApart(a, b))
    assert.deepEqual(hook.around('2026-03-01'), around('2026-03-01'))
    assert.deepEqual(hook.around('2026-01-02', '2026-01-31'), around('2026-01-02', '2026-01-31'))
  })
})
