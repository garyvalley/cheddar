// Unit tests for shared/legal.ts and shared/contact.ts: the terms version the
// app and the hooks share, and what a contact message may hold.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasAgreed, legalDate, PRIVACY_UPDATED, TERMS_VERSION } from '../shared/legal.ts'
import { checkContact, MESSAGE_MAX, topicLabel } from '../shared/contact.ts'

test('versions are dates, and only the one in force counts as agreed', () => {
  for (const v of [TERMS_VERSION, PRIVACY_UPDATED]) assert.match(v, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(hasAgreed(TERMS_VERSION), true)
  for (const v of ['', '2000-01-01', null, undefined, 20261116]) assert.equal(hasAgreed(v), false)
})

test('dates read the American way', () => {
  assert.equal(legalDate('2026-11-16'), 'November 16, 2026')
  assert.equal(legalDate('2027-01-02'), 'January 2, 2027')
})

test('a contact message is trimmed and checked', () => {
  assert.deepEqual(checkContact({ name: ' Sam ', email: ' sam@example.com ', topic: 'security', message: ' Found one \n' }),
    { ok: { name: 'Sam', email: 'sam@example.com', topic: 'security', message: 'Found one' } })
  assert.ok('problem' in checkContact({ email: 'sam', topic: 'question', message: 'Hi' }))
  assert.ok('problem' in checkContact({ email: 'sam@example.com', topic: 'lunch', message: 'Hi' }))
  assert.ok('problem' in checkContact({ email: 'sam@example.com', topic: 'question', message: '' }))
  assert.ok('problem' in checkContact({ email: 'sam@example.com', topic: 'question', message: 'x'.repeat(MESSAGE_MAX + 1) }))
  assert.ok('problem' in checkContact({ name: 'x'.repeat(101), email: 'sam@example.com', topic: 'question', message: 'Hi' }))
  assert.equal(topicLabel('privacy'), 'Privacy or my data')
})
