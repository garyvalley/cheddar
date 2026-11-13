// Unit tests for pb_hooks/lib/lockout.js: five wrong tries, then locked for
// 15 minutes, doubling with each lockout after it up to a day, until a right
// code. pb_hooks/glue/lockout.js applies it to a row; the routes that use it
// are covered by tests/api/auth.test.mjs and account-security.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const lockout = loadHookModule('pb_hooks/lib/lockout.js')
const dates = loadHookModule('pb_hooks/lib/dates.js')
const NOW = Date.parse('2026-11-06T12:00:00Z')

test('the first four wrong tries are counted', () => {
  for (let tried = 0; tried < 4; tried++) {
    assert.deepEqual(lockout.strike(tried, NOW, 0), { locked: false, attempts: tried + 1, lockouts: 0 })
  }
})

test('the fifth locks the row for 15 minutes and starts the count again', () => {
  assert.deepEqual(lockout.strike(4, NOW), { locked: true, attempts: 0, lockouts: 1, minutes: 15, locked_until: dates.toPb(NOW + 15 * 60000) })
})

test('each lockout after the first lasts twice as long, up to a day', () => {
  const minutes = [0, 1, 2, 3, 4, 5, 6, 7, 20].map(n => lockout.strike(4, NOW, n).minutes)
  assert.deepEqual(minutes, [15, 30, 60, 120, 240, 480, 960, 1440, 1440])
  const third = lockout.strike(4, NOW, 2)
  assert.deepEqual([third.lockouts, third.locked_until], [3, dates.toPb(NOW + 60 * 60000)])
})

test('a wrong try keeps the count of lockouts', () => {
  assert.deepEqual(lockout.strike(0, NOW, 3), { locked: false, attempts: 1, lockouts: 3 })
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

test('the message says how long, in minutes, hours or a day', () => {
  assert.equal(lockout.lockedMessage(1), 'Too many wrong tries. Try again in 1 minute.')
  assert.equal(lockout.lockedMessage(15, 'codes'), 'Too many wrong codes. Try again in 15 minutes.')
  assert.equal(lockout.lockedMessage(60, 'codes'), 'Too many wrong codes. Try again in 1 hour.')
  assert.equal(lockout.lockedMessage(480, 'codes'), 'Too many wrong codes. Try again in 8 hours.')
  assert.equal(lockout.lockedMessage(1440, 'codes'), 'Too many wrong codes. Try again in 1 day.')
  assert.equal(lockout.lockedMessage(75, 'codes'), 'Too many wrong codes. Try again in 75 minutes.')
})
