// Matching transfers and refunds (shared/links.ts): which row is the other
// side of a transfer, which purchase a refund reverses, and what the person
// is told about it.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { linkWords, matchable, refundFor, transferFor, REFUND_DAYS, TRANSFER_DAYS } from '../shared/links.ts'

const row = (over = {}) => ({
  id: 'a', owner: 'me', account: 'checking', posted: '2026-11-02', amount_cents: -50000, merchant_key: '',
  category: 'other', category_by: 'bank', pending: false, excluded: false, link: '', link_off: false, ...over,
})
const spending = c => c !== 'income' && c !== 'transfer'

describe('transferFor', () => {
  test('the opposite amount in another account, the nearest day first', () => {
    const out = row()
    const far = row({ id: 'far', account: 'savings', amount_cents: 50000, posted: '2026-11-05' })
    const near = row({ id: 'near', account: 'savings', amount_cents: 50000, posted: '2026-11-03' })
    assert.equal(transferFor(out, [far, near]), 'near')
  })

  test('not the same account, someone else\'s, a different amount, or too far apart', () => {
    const out = row()
    assert.equal(transferFor(out, [
      row({ id: 'b', amount_cents: 50000 }),
      row({ id: 'c', account: 'savings', owner: 'them', amount_cents: 50000 }),
      row({ id: 'd', account: 'savings', amount_cents: 49999 }),
      row({ id: 'e', account: 'savings', amount_cents: 50000, posted: '2026-11-07' }),
    ]), '')
    assert.equal(TRANSFER_DAYS, 4)
    assert.equal(transferFor(out, [row({ id: 'f', account: 'savings', amount_cents: 50000, posted: '2026-11-06' })]), 'f')
  })

  test('leaves alone what the person sorted by hand, or unlinked, or is pending or left out', () => {
    const other = row({ id: 'b', account: 'savings', amount_cents: 50000 })
    assert.equal(transferFor(row({ category_by: 'person', category: 'housing' }), [other]), '')
    assert.equal(transferFor(row({ category_by: 'person', category: 'transfer' }), [other]), 'b')
    assert.equal(transferFor(row(), [{ ...other, category_by: 'person', category: 'income' }]), '')
    for (const over of [{ link_off: true }, { pending: true }, { excluded: true }, { link: 'x' }])
      assert.equal(transferFor(row(), [{ ...other, ...over }]), '', JSON.stringify(over))
  })
})

describe('refundFor', () => {
  const refund = row({ id: 'r', amount_cents: 2500, merchant_key: 'shop', posted: '2026-11-20' })
  const buy = over => row({ merchant_key: 'shop', category: 'shopping', ...over })

  test('an exact amount first, then the latest', () => {
    assert.equal(refundFor(refund, [buy({ id: 'big', amount_cents: -9000, posted: '2026-11-18' }), buy({ id: 'exact', amount_cents: -2500, posted: '2026-10-01' })], spending), 'exact')
    assert.equal(refundFor(refund, [buy({ id: 'old', amount_cents: -9000, posted: '2026-10-01' }), buy({ id: 'new', amount_cents: -9000, posted: '2026-11-18' })], spending), 'new')
  })

  test('the same merchant and account, a purchase at least its size, before it and not too long ago', () => {
    assert.equal(refundFor(refund, [
      buy({ id: 'other-shop', merchant_key: 'cafe', amount_cents: -2500 }),
      buy({ id: 'other-account', account: 'card', amount_cents: -2500 }),
      buy({ id: 'smaller', amount_cents: -2000 }),
      buy({ id: 'after', amount_cents: -2500, posted: '2026-11-21' }),
      buy({ id: 'long-ago', amount_cents: -2500, posted: '2026-07-01' }),
      buy({ id: 'income', amount_cents: -2500, category: 'income' }),
    ], spending), '')
    assert.equal(REFUND_DAYS, 120)
  })

  test('only money in from a known merchant', () => {
    assert.equal(refundFor({ ...refund, amount_cents: -2500 }, [buy({ id: 'b', amount_cents: -2500 })], spending), '')
    assert.equal(refundFor({ ...refund, merchant_key: '' }, [buy({ id: 'b', amount_cents: -2500, merchant_key: '' })], spending), '')
  })
})

test('matchable', () => {
  assert.ok(matchable(row()))
  assert.ok(!matchable(row({ amount_cents: 0 })))
})

test('linkWords', () => {
  const other = { posted: 'Nov 3', account_name: 'Savings' }
  assert.equal(linkWords('transfer', { amount_cents: -1 }, other), 'Transfer to Savings')
  assert.equal(linkWords('transfer', { amount_cents: 1 }, other), 'Transfer from Savings')
  assert.equal(linkWords('transfer', { amount_cents: 1 }, null), 'Transfer')
  assert.equal(linkWords('refund', { amount_cents: 1 }, other), 'Refund of a purchase on Nov 3')
  assert.equal(linkWords('refund', { amount_cents: -1 }, other), 'Refunded on Nov 3')
  assert.equal(linkWords('', { amount_cents: 1 }, other), '')
})
