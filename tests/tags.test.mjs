// Tags on transactions (shared/tags.ts): what a person may type, how it's
// tidied, and each tag's totals.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkTags, cleanTag, sameTag, tagNeedle, tagTotals, tagsOf, TAGS_MAX } from '../shared/tags.ts'
import { checkEdit } from '../shared/transactions.ts'

describe('checkTags', () => {
  test('tidies, keeps the first spelling of each, and takes a list or a line', () => {
    assert.deepEqual(checkTags(['  Vacation   2026 ', 'vacation 2026', 'Tax-deductible']), { tags: ['Vacation 2026', 'Tax-deductible'] })
    assert.deepEqual(checkTags('Business, , Reimbursable,'), { tags: ['Business', 'Reimbursable'] })
    assert.deepEqual(checkTags('Café & co.'), { tags: ['Café & co.'] })
  })

  test('none is null', () => {
    for (const none of [null, undefined, '', [], ' , ']) assert.deepEqual(checkTags(none), { tags: null }, JSON.stringify(none))
  })

  test('refuses what can\'t be a tag', () => {
    for (const [v, why] of [
      [['x'.repeat(31)], 'too long'],
      [['say "hi"'], 'a quote'],
      [['back\\slash'], 'a backslash'],
      [['-dash first'], 'starts with punctuation'],
      [['50%'], 'a percent sign'],
      [[''], 'an empty one in a list'],
      [[1], 'not text'],
      [{ tag: 'x' }, 'not a list'],
      [Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`), 'too many'],
    ]) assert.ok('problem' in checkTags(v), why)
    assert.deepEqual(checkTags(Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`)).tags.length, TAGS_MAX)
  })
})

test('tagsOf reads what is stored, and nothing odd', () => {
  assert.deepEqual(tagsOf(['A', 2, '', 'B']), ['A', 'B'])
  assert.deepEqual(tagsOf(null), [])
  assert.deepEqual(tagsOf('A'), [])
})

test('cleanTag, sameTag and the search needle', () => {
  assert.equal(cleanTag('  a   b '), 'a b')
  assert.equal(cleanTag(3), '')
  assert.ok(sameTag('Business', 'BUSINESS'))
  assert.equal(tagNeedle(' Vacation  2026'), '"Vacation 2026"')
})

test('tagTotals: money out and in per tag, case folded, most spent first', () => {
  assert.deepEqual(tagTotals([
    { amount_cents: -1000, tags: ['Trip', 'Business'] },
    { amount_cents: -500, tags: ['trip'] },
    { amount_cents: 300, tags: ['Business'] },
    { amount_cents: -200, tags: [] },
    { amount_cents: -100, tags: ['Alpha'] },
    { amount_cents: -100, tags: ['Beta'] },
  ]), [
    { tag: 'Trip', count: 2, out_cents: 1500, in_cents: 0 },
    { tag: 'Business', count: 2, out_cents: 1000, in_cents: 300 },
    { tag: 'Alpha', count: 1, out_cents: 100, in_cents: 0 },
    { tag: 'Beta', count: 1, out_cents: 100, in_cents: 0 },
  ])
})

test('checkEdit takes tags on any transaction, null to take them off', () => {
  assert.deepEqual(checkEdit({ tags: ['Business'] }, false), { ok: { tags: ['Business'] } })
  assert.deepEqual(checkEdit({ tags: [] }, false), { ok: { tags: null } })
  assert.ok('problem' in checkEdit({ tags: ['"'] }, false))
})
