// Unit tests for server/data/memo.ts: report rows kept between loads
// (issue #115) only at the version they were read at, for a while, frozen,
// and within a bound.

import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { MEMO_MAX_ROWS, MEMO_TTL_MS, forgetAll, keep, recall } from '../server/data/memo.ts'

const rows = n => Array.from({ length: n }, (_, i) => ({ amount_cents: -i }))

describe('kept report rows', () => {
  beforeEach(forgetAll)

  test('come back only at the version they were read at', () => {
    keep('me\nq', '3@t1', rows(3), 0)
    assert.equal(recall('me\nq', '3@t1', 1).length, 3)
    assert.equal(recall('me\nq', '4@t2', 2), null, 'a new version reads again')
    assert.equal(recall('me\nq', '3@t1', 3), null, 'and the old one is gone')
    assert.equal(recall('you\nq', '3@t1', 4), null)
  })

  test('are let go after a while', () => {
    keep('k', 'v', rows(1), 0)
    assert.ok(recall('k', 'v', MEMO_TTL_MS))
    assert.equal(recall('k', 'v', MEMO_TTL_MS * 2 + 1), null)
  })

  test('are frozen, so no reader changes another\'s', () => {
    const kept = keep('k', 'v', rows(2), 0)
    assert.throws(() => { kept[0].amount_cents = 5 }, TypeError)
    assert.throws(() => { kept.push({ amount_cents: 1 }) }, TypeError)
  })

  test('stay within the bound, the least recently read let go first', () => {
    const half = Math.floor(MEMO_MAX_ROWS / 2)
    keep('a', 'v', rows(half), 0)
    keep('b', 'v', rows(half), 0)
    assert.ok(recall('a', 'v', 1), 'read again: now the newest')
    keep('c', 'v', rows(half), 2)
    assert.equal(recall('b', 'v', 3), null)
    assert.ok(recall('a', 'v', 3))
    assert.ok(recall('c', 'v', 3))
    const huge = keep('d', 'v', rows(MEMO_MAX_ROWS + 1), 4)
    assert.equal(huge.length, MEMO_MAX_ROWS + 1, 'too many to keep is still answered')
    assert.equal(recall('d', 'v', 5), null)
  })
})
