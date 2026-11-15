// Which synced transactions are a new link's history, kept out of the review
// inbox (shared/review.ts): from more than REVIEW_DAYS before the link was made.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isHistory, REVIEW_DAYS, reviewFrom } from '../shared/review.ts'

describe('review history', () => {
  test('starts the inbox REVIEW_DAYS before the link was made, in PocketBase\'s date format or ISO', () => {
    assert.equal(REVIEW_DAYS, 30)
    assert.equal(reviewFrom('2026-11-15 03:22:09.000Z'), '2026-10-16')
    assert.equal(reviewFrom('2026-03-01T23:59:59Z'), '2026-01-30')
    assert.equal(reviewFrom('2026-11-15'), '2026-10-16')
  })

  test('a row before that day is history; that day and later go to review', () => {
    const made = '2026-11-15 03:22:09.000Z'
    assert.equal(isHistory('2026-10-15', made), true)
    assert.equal(isHistory('2025-01-03', made), true)
    assert.equal(isHistory('2026-10-16', made), false)
    assert.equal(isHistory('2026-11-20', made), false)
  })

  test('nothing is history when a date can\'t be read', () => {
    assert.equal(reviewFrom(''), '')
    assert.equal(reviewFrom('soon'), '')
    assert.equal(isHistory('2020-01-01', ''), false)
    assert.equal(isHistory('', '2026-11-15'), false)
  })
})
