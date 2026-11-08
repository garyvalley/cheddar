// Unit tests for pb_hooks/lib/lockout.js: five wrong tries, then 15 minutes
// locked. pb_hooks/glue/lockout.js applies it to a row; the routes that use
// it are covered by tests/api/account-security.test.mjs and authorization.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const lockout = loadHookModule('pb_hooks/lib/lockout.js')
const dates = loadHookModule('pb_hooks/lib/dates.js')
const NOW = Date.parse('2026-11-06T12:00:00Z')

test('the first four wrong tries are counted', () => {
  for (let tried = 0; tried < 4; tried++) {
    assert.deepEqual(lockout.strike(tried, NOW), { locked: false, attempts: tried + 1 })
  }
})

test('the fifth locks the row for 15 minutes and starts the count again', () => {
  assert.deepEqual(lockout.strike(4, NOW), { locked: true, attempts: 0, locked_until: dates.toPb(NOW + 15 * 60000) })
})

test('a row is locked, in whole minutes rounded up, until locked_until', () => {
  const until = lockout.strike(4, NOW).locked_until
  assert.equal(lockout.minutesLocked(until, NOW), 15)
  assert.equal(lockout.minutesLocked(until, NOW + 14 * 60000 + 1000), 1)
  assert.equal(lockout.minutesLocked(until, NOW + 15 * 60000), 0)
})

test('a row never locked, or locked in the past, is not locked', () => {
  assert.equal(lockout.minutesLocked('', NOW), 0)
  assert.equal(lockout.minutesLocked(dates.toPb(NOW - 1000), NOW), 0)
})

test('the message counts the minutes', () => {
  assert.equal(lockout.lockedMessage(1), 'Too many wrong tries. Try again in 1 minute.')
  assert.equal(lockout.lockedMessage(15), 'Too many wrong tries. Try again in 15 minutes.')
})
