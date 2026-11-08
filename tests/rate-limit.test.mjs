// Unit tests for server/utils/rate-limit.ts: the fixed window that limits
// sign-in tries per address.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RateLimiter } from '../server/utils/rate-limit.ts'

test('allows the limit, then says how long to wait until the window ends', () => {
  const l = new RateLimiter(3, 60_000)
  assert.deepEqual([l.hit('a', 0), l.hit('a', 1000), l.hit('a', 2000)], [0, 0, 0])
  assert.equal(l.hit('a', 30_000), 30)
})

test('counts each key on its own', () => {
  const l = new RateLimiter(1, 60_000)
  assert.equal(l.hit('a', 0), 0)
  assert.equal(l.hit('b', 0), 0)
  assert.ok(l.hit('a', 0) > 0)
})

test('starts again once the window has passed', () => {
  const l = new RateLimiter(1, 60_000)
  l.hit('a', 0)
  assert.ok(l.hit('a', 59_999) > 0)
  assert.equal(l.hit('a', 60_000), 0)
})
