// Overview's "Coming up" (GET /api/upcoming): the next week's usual charges
// and planned items, and a subscription whose price just went up; the
// caller's own only.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'
import { addMonths } from '../../shared/recurring.ts'

const DAY = 86_400_000
const today = new Date().toISOString().slice(0, 10)
const plus = n => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

describe('coming up', () => {
  test('lists the week\'s bills and planned items, and a price rise', async () => {
    const owner = await ready()
    const other = await ready()
    const a = (await owner.c.call('POST', '/api/accounts', { name: 'Checking', kind: 'checking' })).json.account
    // Monthly, the latest a month less three days ago, so the next is in three days; it went up last time.
    const last = addMonths(plus(3), -1)
    let csv = 'Date,Description,Amount\n'
    for (let i = 4; i >= 0; i--) csv += `${addMonths(last, -i)},NETFLIX.COM,${i ? '-15.49' : '-17.99'}\n`
    assert.equal((await owner.c.call('POST', '/api/imports', { account: a.id, filename: 's.csv', text: csv })).status, 201)
    const planned = await owner.c.call('POST', '/api/cashflow', { name: 'Rent', account: a.id, direction: 'expense', amount: '1200', cadence: 'monthly', next_date: plus(1) })
    assert.equal(planned.status, 201, JSON.stringify(planned.json))
    await owner.c.call('POST', '/api/cashflow', { name: 'Car insurance', account: a.id, direction: 'expense', amount: '600', cadence: 'once', next_date: plus(9) })

    const r = await owner.c.call('GET', '/api/upcoming')
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.events.map(e => [e.date, e.name, e.amount_cents, e.source]), [
      [plus(1), 'Rent', -120000, 'scheduled'],
      [plus(3), 'NETFLIX.COM', -1799, 'recurring'],
    ])
    assert.equal(r.json.due_cents, 121799)
    assert.deepEqual(r.json.rises.map(x => [x.name, x.from_cents, x.to_cents, x.on, x.yearly_cents]), [['NETFLIX.COM', 1549, 1799, last, 3000]])

    assert.deepEqual((await other.c.call('GET', '/api/upcoming')).json, { days: 7, events: [], due_cents: 0, rises: [] })
  })
})
