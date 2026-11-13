// Monthly budgets (issue #29): set per spending category, shown against
// Spending's totals for a week, month, year or range, and on Overview when
// one is over this month. Each person's own, even straight from PocketBase.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, ready } from './helpers.mjs'

const today = () => new Date().toISOString().slice(0, 10)

async function spendToday(c, amount) {
  const a = await c.call('POST', '/api/accounts', { name: 'Wallet', kind: 'checking' })
  assert.equal(a.status, 201, JSON.stringify(a.json))
  const t = await c.call('POST', '/api/transactions', { account: a.json.account.id, posted: today(), amount, direction: 'out', description: 'Corner store' })
  assert.equal(t.status, 201, JSON.stringify(t.json))
  const month = (await c.call('GET', '/api/spending')).json
  return month.categories.find(x => x.spending && x.count)
}

describe('budgets', () => {
  test('show against the month, scale to a year, and list on Overview when over', async () => {
    const { c } = await ready()
    const spent = await spendToday(c, '80')
    assert.equal(spent.budget_cents, undefined)

    const set = await c.call('PUT', `/api/budgets/${spent.id}`, { amount: '50' })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    assert.deepEqual(set.json.budget, { category: spent.id, amount_cents: 5000 })
    assert.deepEqual((await c.call('GET', '/api/budgets')).json.budgets, [{ category: spent.id, amount_cents: 5000 }])

    const month = (await c.call('GET', '/api/spending')).json.categories.find(x => x.id === spent.id)
    assert.equal(month.budget_cents, 5000)
    const year = (await c.call('GET', '/api/spending?period=year')).json.categories.find(x => x.id === spent.id)
    assert.equal(year.budget_cents, 60000)
    const week = (await c.call('GET', '/api/spending?period=week')).json
    assert.equal(week.categories.find(x => x.id === spent.id).budget_cents, Math.round(5000 * 7 * 12 / 365.25))

    const over = (await c.call('GET', '/api/overview')).json.over_budget
    assert.deepEqual(over.map(b => [b.id, b.spent_cents, b.budget_cents]), [[spent.id, 8000, 5000]])

    // Raised above the spending, it's no longer over; emptied, it's gone.
    await c.call('PUT', `/api/budgets/${spent.id}`, { amount: '100' })
    assert.deepEqual((await c.call('GET', '/api/overview')).json.over_budget, [])
    assert.equal((await c.call('PUT', `/api/budgets/${spent.id}`, { amount: '' })).status, 204)
    assert.deepEqual((await c.call('GET', '/api/budgets')).json.budgets, [])
  })

  test('a budgeted category with nothing spent is listed at zero', async () => {
    const { c } = await ready()
    await spendToday(c, '5')
    assert.equal((await c.call('PUT', '/api/budgets/travel', { amount: '300' })).status, 200)
    const travel = (await c.call('GET', '/api/spending')).json.categories.find(x => x.id === 'travel')
    assert.deepEqual([travel.total_cents, travel.count, travel.budget_cents], [0, 0, 30000])
  })

  test('only spending categories, and only real amounts', async () => {
    const { c } = await ready()
    assert.equal((await c.call('PUT', '/api/budgets/income', { amount: '10' })).status, 404)
    assert.equal((await c.call('PUT', '/api/budgets/nonsense', { amount: '10' })).status, 404)
    assert.equal((await c.call('PUT', '/api/budgets/dining', { amount: '-10' })).status, 400)
  })

  test('a range is read from the address', async () => {
    const { c } = await ready()
    const r = (await c.call('GET', '/api/spending?period=custom&at=2026-01-05~2026-02-10')).json
    assert.deepEqual([r.from, r.to], ['2026-01-05', '2026-02-10'])
  })

  test('are each person\'s own, even straight from PocketBase', async () => {
    const owner = await ready()
    const other = await ready()
    await owner.c.call('PUT', '/api/budgets/dining', { amount: '200' })
    assert.deepEqual((await other.c.call('GET', '/api/budgets')).json.budgets, [])
    const token = other.c.cookie.slice('pb_token='.length)
    const list = await fetch(`${PB}/api/collections/budgets/records`, { headers: { authorization: token } })
    assert.equal((await list.json()).items.length, 0)
    const forged = await fetch(`${PB}/api/collections/budgets/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: token },
      body: JSON.stringify({ owner: owner.id, category: 'travel', amount_cents: 100 }),
    })
    assert.ok([400, 403].includes(forged.status), `forged: ${forged.status}`)
    assert.deepEqual((await owner.c.call('GET', '/api/budgets')).json.budgets, [{ category: 'dining', amount_cents: 20000 }])
  })
})
