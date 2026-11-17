// Reports, end to end through Nuxt against a real PocketBase: the trends
// over the months asked for, and a year in review, counted as Spending
// counts them (split ones in their parts, left-out ones not at all), and
// nobody else's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'

const year = new Date().getUTCFullYear() - 1
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

describe('reports', () => {
  test('trends over the months asked for, and a year in review', async () => {
    const { c } = await ready()
    const a = (await c.call('POST', '/api/accounts', { name: 'Everyday', kind: 'checking' })).json.account
    const rows = [
      [`${year}-01-02`, 'PAYROLL ACME', '3000.00'],
      [`${year}-01-05`, 'WHOLE FOODS MARKET', '-120.00'],
      [`${year}-02-02`, 'PAYROLL ACME', '3000.00'],
      [`${year}-02-09`, 'WHOLE FOODS MARKET', '-80.00'],
      [`${year}-02-10`, 'BLUE BOTTLE COFFEE', '-6.00'],
      [`${year}-03-02`, 'PAYROLL ACME', '3000.00'],
      [`${year}-03-11`, 'COSTCO WHSE', '-200.00'],
    ]
    const r = await c.call('POST', '/api/imports', { account: a.id, filename: 's.csv', text: `Date,Description,Amount\n${rows.map(([d, desc, amt]) => `${us(d)},${desc},${amt}`).join('\n')}\n` })
    assert.equal(r.status, 201, JSON.stringify(r.json))
    const tx = Object.fromEntries((await c.call('GET', `/api/transactions?account=${a.id}`)).json.items.map(t => [t.description, t]))
    // Costco split, half groceries half shopping; the coffee left out.
    assert.equal((await c.call('PATCH', `/api/transactions/${tx['COSTCO WHSE'].id}`, { splits: [{ category: 'groceries', amount: '100' }, { category: 'shopping', amount: '100' }] })).status, 200)
    assert.equal((await c.call('PATCH', `/api/transactions/${tx['BLUE BOTTLE COFFEE'].id}`, { excluded: true })).status, 200)

    const got = await c.call('GET', `/api/reports?from=${year}-01&to=${year}-04`)
    assert.equal(got.status, 200, JSON.stringify(got.json))
    const t = got.json
    assert.deepEqual(t.months.map(m => [m.month, m.income_cents, m.spent_cents]), [
      [`${year}-01`, 300000, 12000], [`${year}-02`, 300000, 8000], [`${year}-03`, 300000, 20000], [`${year}-04`, 0, 0],
    ])
    assert.deepEqual(t.categories.map(c => [c.id, c.months]), [['groceries', [12000, 8000, 10000, 0]], ['shopping', [0, 0, 10000, 0]]])
    assert.deepEqual(t.merchants.map(m => m.total_cents), [20000, 20000])
    assert.equal(t.flow.saved_cents, 900000 - 40000)

    const review = (await c.call('GET', `/api/reports/year?year=${year}`)).json
    assert.deepEqual([review.year, review.partial, review.income_cents, review.spent_cents], [year, false, 900000, 40000])
    assert.deepEqual(review.top_categories.map(c => c.id), ['groceries', 'shopping'])
    assert.equal(review.count, 6, 'six counted, the left-out one not')

    // The default is the last 12 months; a bad range is refused.
    assert.equal((await c.call('GET', '/api/reports')).json.months.length, 12)
    for (const q of ['from=2026-05&to=2026-04', 'from=2026-13&to=2026-14', 'from=2000-01&to=2026-01']) assert.equal((await c.call('GET', `/api/reports?${q}`)).status, 400, q)
    assert.equal((await c.call('GET', `/api/reports/year?year=${year + 5}`)).status, 400)

    // Nobody else's.
    const other = await ready()
    const theirs = (await other.c.call('GET', `/api/reports?from=${year}-01&to=${year}-04`)).json
    assert.equal(theirs.income_cents + theirs.spent_cents, 0)
  })
})
