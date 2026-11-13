// Recurring charges end to end: monthly charges imported from a statement
// show up on GET /api/recurring, in their account only, and for nobody else.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'
import { addMonths } from '../../shared/recurring.ts'

async function account(c, body) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A CSV of `n` monthly charges, the last one a week ago. */
function statement(n, rows) {
  const last = new Date(Date.parse(`${today()}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
  let csv = 'Date,Description,Amount\n'
  for (let i = n - 1; i >= 0; i--) {
    const day = addMonths(last, -i)
    for (const [description, amount] of rows(n - 1 - i)) csv += `${day},${description},${amount}\n`
  }
  return { csv, last }
}

describe('recurring charges', () => {
  test('are found from imported charges, by account, and only for their owner', async () => {
    const owner = await ready()
    const other = await ready()
    const card = await account(owner.c, { name: 'Visa', kind: 'credit_card' })
    const checking = await account(owner.c, { name: 'Checking', kind: 'checking' })
    const { csv, last } = statement(5, i => [['NETFLIX.COM', i < 4 ? '-15.49' : '-17.99'], [`CORNER CAFE ${i}`, `-${4 + i}.25`]])
    const r = await owner.c.call('POST', '/api/imports', { account: card.id, filename: 'visa.csv', text: csv })
    assert.equal(r.status, 201, JSON.stringify(r.json))

    const all = await owner.c.call('GET', '/api/recurring')
    assert.equal(all.status, 200, JSON.stringify(all.json))
    assert.deepEqual(all.json.items.map(i => [i.cadence, i.amount_cents, i.count, i.last, i.next, i.account]), [
      ['monthly', 1799, 5, last, addMonths(last, 1), card.id],
    ])
    assert.deepEqual(all.json.items[0].change, { from_cents: 1549, to_cents: 1799, on: last })
    assert.equal(all.json.yearly_cents, 1799 * 12)

    assert.equal((await owner.c.call('GET', `/api/recurring?account=${card.id}`)).json.items.length, 1)
    assert.equal((await owner.c.call('GET', `/api/recurring?account=${checking.id}`)).json.items.length, 0)
    assert.equal((await owner.c.call('GET', '/api/recurring?account=nope')).status, 404)
    const theirs = await other.c.call('GET', '/api/recurring')
    assert.deepEqual([theirs.status, theirs.json.items.length, theirs.json.stopped.length], [200, 0, 0])
    assert.equal((await other.c.call('GET', `/api/recurring?account=${card.id}`)).json.items.length, 0)
  })
})
