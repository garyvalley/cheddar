// The bell (GET /api/notices, shared/notices.ts): what's due is worked out
// from the caller's own data, the badge counts what they haven't seen, and
// opening it (POST /api/notices/seen) marks those seen. Kinds can be turned
// off (PUT /api/notices/settings). Nobody else's data shows, and nobody
// can mark another person's notices.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, asPb, ready } from './helpers.mjs'

const DAY = 86_400_000
const today = new Date().toISOString().slice(0, 10)
const plus = n => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

describe('the bell', () => {
  test('lists bills, a budget passed and new transactions; opening it marks them seen', async () => {
    const owner = await ready()
    const other = await ready()
    const a = (await owner.c.call('POST', '/api/accounts', { name: 'Checking', kind: 'checking' })).json.account
    const csv = `Date,Description,Amount\n${today},CORNER STORE,-80.00\n${plus(-1)},CORNER STORE,-5.00\n`
    assert.equal((await owner.c.call('POST', '/api/imports', { account: a.id, filename: 's.csv', text: csv })).status, 201)
    const planned = await owner.c.call('POST', '/api/cashflow', { name: 'Rent', account: a.id, direction: 'expense', amount: '1200', cadence: 'monthly', next_date: plus(1) })
    assert.equal(planned.status, 201, JSON.stringify(planned.json))
    const spent = (await owner.c.call('GET', '/api/spending')).json.categories.find(x => x.spending && x.count)
    assert.equal((await owner.c.call('PUT', `/api/budgets/${spent.id}`, { amount: '50' })).status, 200)

    const r = await owner.c.call('GET', '/api/notices')
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.notices.map(n => n.kind), ['budget', 'bill', 'new'])
    const by = Object.fromEntries(r.json.notices.map(n => [n.kind, n]))
    assert.equal(by.bill.title, 'Rent tomorrow')
    assert.equal(by.new.title, '2 new transactions')
    assert.equal(by.budget.href, `/spending?category=${spent.id}`)
    assert.deepEqual(r.json.unseen, r.json.notices.map(n => n.key))
    assert.deepEqual(r.json.off, [])

    // Someone else has none of it, and can't mark the owner's seen.
    assert.deepEqual((await other.c.call('GET', '/api/notices')).json, { notices: [], unseen: [], off: [] })
    const theirs = await fetch(`${PB}/api/collections/users/records/${owner.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...asPb(other.c) }, body: JSON.stringify({ notices_seen: { keys: ['x'], at: '' } }),
    })
    assert.notEqual(theirs.status, 200)

    const seen = await owner.c.call('POST', '/api/notices/seen', { keys: r.json.notices.map(n => n.key) })
    assert.equal(seen.status, 200, JSON.stringify(seen.json))
    const after = (await owner.c.call('GET', '/api/notices')).json
    // New transactions count from the look: none since.
    assert.deepEqual(after.notices.map(n => n.kind), ['budget', 'bill'])
    assert.deepEqual(after.unseen, [])

    // A kind turned off is left out, and says so.
    const off = await owner.c.call('PUT', '/api/notices/settings', { off: ['bill'] })
    assert.deepEqual(off.json, { off: ['bill'] })
    assert.deepEqual((await owner.c.call('GET', '/api/notices/settings')).json, { off: ['bill'] })
    assert.deepEqual((await owner.c.call('GET', '/api/notices')).json.notices.map(n => n.kind), ['budget'])
  })

  test('refuses what isn\'t a list of keys or kinds', async () => {
    const { c } = await ready()
    assert.equal((await c.call('POST', '/api/notices/seen', { keys: 'all' })).status, 400)
    assert.equal((await c.call('POST', '/api/notices/seen', { keys: [{}] })).status, 400)
    assert.equal((await c.call('PUT', '/api/notices/settings', { off: ['email'] })).status, 400)
  })
})
