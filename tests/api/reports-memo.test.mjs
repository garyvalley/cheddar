// Reports at scale (issue #115): three years of transactions, read once and
// then kept (server/data/memo.ts) until something in them changes. Each kind
// of change shows on the next load: a new row, an edited one, one left out,
// an account left out, and a deleted import.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'

const day = n => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const YEARS = 3

/** Three years of a busy card: a few buys a day, and a monthly subscription. */
function history() {
  let csv = 'Date,Description,Amount\n'
  for (let n = YEARS * 365 - 5; n >= 1; n--) {
    csv += `${day(n)},CORNER CAFE ${n % 17},-${(3 + (n % 7)).toFixed(2)}\n`
    csv += `${day(n)},GROCER ${n % 11},-${(20 + (n % 30)).toFixed(2)}\n`
    if (n % 30 === 3) csv += `${day(n)},STREAMFLIX.COM,-15.49\n`
  }
  return csv
}

const timed = async (c, path) => {
  const started = performance.now()
  const r = await c.call('GET', path)
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return { json: r.json, ms: performance.now() - started }
}
const keys = r => r.items.map(i => i.key).sort()
const spent = async (c, q = '') => (await c.call('GET', `/api/spending?period=month${q}`)).json.spent_cents

describe('reports kept between loads', () => {
  test(`${YEARS} years of transactions: the same answer, quicker, and every change shows`, { timeout: 300_000 }, async () => {
    const { c } = await ready()
    const card = (await c.call('POST', '/api/accounts', { name: 'Card', kind: 'credit_card' })).json.account
    const imported = await c.call('POST', '/api/imports', { account: card.id, filename: 'card.csv', text: history() })
    assert.equal(imported.status, 201, JSON.stringify(imported.json))

    const first = await timed(c, '/api/recurring')
    assert.ok(keys(first.json).some(k => k.includes('streamflix')), JSON.stringify(keys(first.json)))
    const again = await timed(c, '/api/recurring')
    assert.deepEqual(again.json, first.json)
    assert.ok(again.ms < 1000, `Recurring took ${Math.round(again.ms)} ms the second time (${Math.round(first.ms)} ms the first)`)

    // A new subscription: new rows.
    let csv = 'Date,Description,Amount\n'
    for (const n of [97, 67, 37, 7]) csv += `${day(n)},CLOUDBOX STORAGE,-2.99\n`
    const box = await c.call('POST', '/api/imports', { account: card.id, filename: 'box.csv', text: csv })
    assert.equal(box.status, 201, JSON.stringify(box.json))
    assert.ok(keys((await timed(c, '/api/recurring')).json).some(k => k.includes('cloudbox')), 'a new row shows')

    // A row added by hand, then its amount changed: the same count, a newer edit.
    const before = await spent(c)
    const meal = await c.call('POST', '/api/transactions', { account: (await c.call('POST', '/api/accounts', { name: 'Cash', kind: 'checking' })).json.account.id, posted: day(0), amount: '10', direction: 'out', description: 'BISTRO' })
    assert.equal(meal.status, 201, JSON.stringify(meal.json))
    assert.equal(await spent(c), before + 1000, 'a new row counts')
    const edit = await c.call('PATCH', `/api/transactions/${meal.json.transaction.id}`, { amount: '25', direction: 'out' })
    assert.equal(edit.status, 200, JSON.stringify(edit.json))
    assert.equal(await spent(c), before + 2500, 'an edited amount counts')
    assert.equal((await c.call('PATCH', `/api/transactions/${meal.json.transaction.id}`, { excluded: true })).status, 200)
    assert.equal(await spent(c), before, 'a row left out stops counting')

    // The import undone: its rows go.
    assert.equal((await c.call('DELETE', `/api/imports/${box.json.import.id}`)).status, 204)
    assert.ok(!keys((await timed(c, '/api/recurring')).json).some(k => k.includes('cloudbox')), 'a deleted row goes')

    // The card left out of the numbers: nothing of it counts.
    assert.equal((await c.call('PATCH', `/api/accounts/${card.id}`, { excluded: true })).status, 200)
    assert.deepEqual(keys((await timed(c, '/api/recurring')).json), [], 'an account left out goes')
    assert.equal(await spent(c), 0)
  })

  test('are each person\'s own', async () => {
    const one = await ready()
    const other = await ready()
    const a = (await one.c.call('POST', '/api/accounts', { name: 'Card', kind: 'credit_card' })).json.account
    await one.c.call('POST', '/api/transactions', { account: a.id, posted: day(0), amount: '12', direction: 'out', description: 'BISTRO' })
    assert.equal(await spent(one.c), 1200)
    assert.equal(await spent(other.c), 0)
    // Asking for someone else's account by name finds nothing of it.
    assert.equal((await other.c.call('GET', `/api/spending?period=month&account=${a.id}`)).json.spent_cents ?? 0, 0)
  })
})
