// The rules for a transaction added or changed by hand, and for searching by
// amount (shared/transactions.ts): the browser and the server check the same way.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { amountRange, checkEdit, checkManual, isDay, parseAmount, shownName } from '../shared/transactions.ts'

const problem = r => r.problem

describe('an amount as typed', () => {
  test('reads dollars, commas and cents', () => {
    assert.deepEqual(parseAmount('1,234.56'), { cents: 123456, negative: false })
    assert.deepEqual(parseAmount('$80'), { cents: 8000, negative: false })
    assert.deepEqual(parseAmount('.5'), { cents: 50, negative: false })
    assert.deepEqual(parseAmount('-12'), { cents: 1200, negative: true })
    assert.deepEqual(parseAmount('−$3.10'), { cents: 310, negative: true })
    assert.deepEqual(parseAmount(4.5), { cents: 450, negative: false })
  })

  test('refuses what isn\'t one', () => {
    for (const v of ['', 'abc', '1.234', '12,34', '$', '1e5', null, undefined, {}, '99999999999999']) assert.equal(parseAmount(v), null, String(v))
  })
})

describe('a day', () => {
  test('is a real calendar day', () => {
    assert.ok(isDay('2026-02-28'))
    assert.ok(isDay('2028-02-29'))
    assert.ok(!isDay('2026-02-29'))
    assert.ok(!isDay('2026-13-01'))
    assert.ok(!isDay('26-01-01'))
    assert.ok(!isDay('1800-01-01'))
  })
})

describe('a transaction added by hand', () => {
  const good = { posted: '2026-11-03', amount: '12.40', direction: 'out', description: ' Farmers market ', note: 'Cash' }

  test('is money out or in, as asked', () => {
    assert.deepEqual(checkManual(good).ok, { posted: '2026-11-03', amount_cents: -1240, description: 'Farmers market', payee: '', note: 'Cash' })
    assert.equal(checkManual({ ...good, direction: 'in' }).ok.amount_cents, 1240)
  })

  test('takes a sign typed into the amount over the direction', () => {
    assert.equal(checkManual({ ...good, amount: '-5', direction: 'in' }).ok.amount_cents, -500)
    assert.equal(checkManual({ ...good, amount: '-0', direction: undefined }).ok.amount_cents, 0)
  })

  test('needs a day, an amount, which way it went and what it was', () => {
    assert.match(problem(checkManual({ ...good, posted: '2026-02-30' })), /day/)
    assert.match(problem(checkManual({ ...good, amount: 'twelve' })), /amount/)
    assert.match(problem(checkManual({ ...good, direction: 'sideways' })), /out or came in/)
    assert.match(problem(checkManual({ ...good, description: '  ' })), /what it was/)
    assert.match(problem(checkManual({ ...good, note: 'x'.repeat(1001) })), /1,000/)
    assert.match(problem(checkManual({ ...good, payee: 7 })), /text/)
  })
})

describe('changing a transaction', () => {
  test('any one takes a name, a note and being left out', () => {
    assert.deepEqual(checkEdit({ payee: ' Costco ', note: 'Half was for Sam', excluded: true }, false).ok, { payee: 'Costco', note: 'Half was for Sam', excluded: true })
    assert.deepEqual(checkEdit({ payee: '' }, false).ok, { payee: '' })
  })

  test('only one added by hand takes a new date, amount or description', () => {
    for (const change of [{ posted: '2026-11-01' }, { amount: '5', direction: 'out' }, { description: 'x' }, { direction: 'in' }]) {
      assert.match(problem(checkEdit(change, false)), /bank or statement/, JSON.stringify(change))
    }
    assert.deepEqual(checkEdit({ posted: '2026-11-01', amount: '5', direction: 'out', description: 'Lunch' }, true).ok, { posted: '2026-11-01', amount_cents: -500, description: 'Lunch' })
  })

  test('refuses nothing to do, a flag that isn\'t one, a direction with no amount', () => {
    assert.match(problem(checkEdit({}, true)), /Nothing/)
    assert.match(problem(checkEdit({ excluded: 'yes' }, true)), /leave it out/)
    assert.match(problem(checkEdit({ direction: 'in' }, true)), /amount/)
    assert.match(problem(checkEdit({ description: '' }, true)), /what it was/)
  })
})

describe('a search by amount', () => {
  test('is a size, either end optional, in either order', () => {
    assert.deepEqual(amountRange('75', '$85.50').ok, { min: 7500, max: 8550 })
    assert.deepEqual(amountRange('', undefined).ok, { min: null, max: null })
    assert.deepEqual(amountRange('90', '70').ok, { min: 7000, max: 9000 })
    assert.match(problem(amountRange('-5', '')), /smallest/)
    assert.match(problem(amountRange('', 'lots')), /largest/)
  })
})

test('a transaction shows as the name the person gave it, else the bank\'s words', () => {
  assert.equal(shownName({ payee: 'Costco', description: 'COSTCO WHSE #123' }), 'Costco')
  assert.equal(shownName({ payee: '', description: 'COSTCO WHSE #123' }), 'COSTCO WHSE #123')
  assert.equal(shownName({ payee: '', description: '' }), 'No description')
})
