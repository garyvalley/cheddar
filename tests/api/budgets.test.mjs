// Monthly budgets (issue #29): set per spending category, shown against
// Spending's totals for a week, month, year or range, and on Overview when
// one is over this month. Each person's own, even straight from PocketBase.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, ready } from './helpers.mjs'

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
    assert.deepEqual(set.json.budget, { category: spent.id, amount_cents: 5000, rollover: false, rollover_from: '' })
    assert.deepEqual((await c.call('GET', '/api/budgets')).json.budgets, [{ category: spent.id, amount_cents: 5000, rollover: false, rollover_from: '' }])

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

  test('the monthly plan sets every budget beside the month, with totals and suggestions from the months before', async () => {
    const { c } = await ready()
    const a = (await c.call('POST', '/api/accounts', { name: 'Wallet', kind: 'checking' })).json.account
    const add = async (posted, amount, direction = 'out', description = 'Corner store') =>
      assert.equal((await c.call('POST', '/api/transactions', { account: a.id, posted, amount, direction, description })).status, 201)
    const monthOf = (back) => {
      const d = new Date()
      d.setUTCDate(15)
      d.setUTCMonth(d.getUTCMonth() - back)
      return d.toISOString().slice(0, 10)
    }
    await add(today(), '80')
    await add(monthOf(1), '60')
    await add(monthOf(2), '30')
    await add(monthOf(4), '999') // four months back: not in the suggestion
    const spent = (await c.call('GET', '/api/spending')).json.categories.find(x => x.spending && x.count)
    assert.equal((await c.call('PUT', '/api/budgets/travel', { amount: '300' })).status, 200)

    const plan = (await c.call('GET', '/api/budgets/plan')).json
    assert.equal(plan.month, today().slice(0, 7))
    assert.match(plan.label, /\d{4}/)
    const line = id => plan.lines.find(l => l.id === id)
    assert.deepEqual(line('travel'), { id: 'travel', label: line('travel').label, custom: false, budget_cents: 30000, rollover: false, carry_cents: 0, spent_cents: 0, suggested_cents: null })
    assert.deepEqual([line(spent.id).budget_cents, line(spent.id).spent_cents, line(spent.id).suggested_cents], [null, 8000, 3000])
    assert.equal(plan.lines[0].id, 'travel', 'budgeted first')
    assert.ok(!plan.lines.some(l => l.id === 'income'), 'only spending categories')
    assert.deepEqual([plan.planned_cents, plan.spent_budgeted_cents, plan.remaining_cents, plan.unbudgeted_cents, plan.income_cents, plan.unplanned_income_cents],
      [30000, 0, 30000, 8000, 0, -30000])

    // Another month, and its own spending; budgets repeat.
    const before = (await c.call('GET', `/api/budgets/plan?month=${plan.prev}`)).json
    assert.equal(before.month, plan.prev)
    assert.deepEqual([before.planned_cents, before.unbudgeted_cents], [30000, 6000])

    // Nobody else's plan has these.
    const other = (await ready()).c
    assert.equal((await other.call('GET', '/api/budgets/plan')).json.planned_cents, 0)
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
    const token = asPb(other.c)
    const list = await fetch(`${PB}/api/collections/budgets/records`, { headers: { ...token } })
    assert.equal((await list.json()).items.length, 0)
    const forged = await fetch(`${PB}/api/collections/budgets/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...token },
      body: JSON.stringify({ owner: owner.id, category: 'travel', amount_cents: 100 }),
    })
    assert.ok([400, 403].includes(forged.status), `forged: ${forged.status}`)
    assert.deepEqual((await owner.c.call('GET', '/api/budgets')).json.budgets, [{ category: 'dining', amount_cents: 20000, rollover: false, rollover_from: '' }])
  })

  test('roll over: what earlier months left, or overspent, carries into the next', async () => {
    const { c } = await ready()
    const a = (await c.call('POST', '/api/accounts', { name: 'Wallet', kind: 'checking' })).json.account
    const month = d => d.toISOString().slice(0, 7)
    const now = new Date()
    const ago = n => month(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15)))
    // Gifts: $30 two months ago, $250 last month, $50 this month.
    for (const [m, amount] of [[ago(2), '30'], [ago(1), '250'], [ago(0), '50']]) {
      const t = await c.call('POST', '/api/transactions', { account: a.id, posted: `${m}-15`, amount, direction: 'out', description: 'Gift shop' })
      assert.equal(t.status, 201, JSON.stringify(t.json))
      const tx = t.json.transaction
      if (tx.category !== 'gifts') await c.call('POST', `/api/transactions/${tx.id}/category`, { category: 'gifts' })
    }

    const set = await c.call('PUT', '/api/budgets/gifts', { amount: '100', rollover: true })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    assert.deepEqual([set.json.budget.rollover, set.json.budget.rollover_from], [true, ago(0)], 'starts with this month')
    assert.equal((await c.call('PUT', '/api/budgets/gifts', { amount: '100', rollover: 'yes' })).status, 400)
    // Nothing has carried yet: this is its first month.
    let gifts = (await c.call('GET', `/api/spending?period=month&at=${ago(0)}`)).json.categories.find(x => x.id === 'gifts')
    assert.deepEqual([gifts.budget_cents, gifts.carry_cents], [10000, 0])

    // As if it had been on since two months ago: +$70 left, then $150 over.
    const row = await (await fetch(`${PB}/api/collections/budgets/records?filter=${encodeURIComponent("category='gifts'")}`, { headers: asPb(c) })).json()
    const patched = await fetch(`${PB}/api/collections/budgets/records/${row.items[0].id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...asPb(c) }, body: JSON.stringify({ rollover_from: ago(2) }),
    })
    assert.equal(patched.status, 200)
    gifts = (await c.call('GET', `/api/spending?period=month&at=${ago(0)}`)).json.categories.find(x => x.id === 'gifts')
    assert.deepEqual([gifts.budget_cents, gifts.carry_cents], [10000 + 7000 - 15000, 7000 - 15000])
    const last = (await c.call('GET', `/api/spending?period=month&at=${ago(1)}`)).json.categories.find(x => x.id === 'gifts')
    assert.deepEqual([last.budget_cents, last.carry_cents], [17000, 7000])
    // A week or a year isn't a month: no carry.
    const year = (await c.call('GET', '/api/spending?period=year')).json.categories.find(x => x.id === 'gifts')
    assert.equal(year.carry_cents, undefined)

    const plan = (await c.call('GET', `/api/budgets/plan?month=${ago(0)}`)).json
    const line = plan.lines.find(l => l.id === 'gifts')
    assert.deepEqual([line.rollover, line.carry_cents], [true, -8000])
    assert.equal(plan.remaining_cents, 10000 - 8000 - 5000)
    // Overview counts it over: $50 spent against $100 less the $80 overspent before.
    const over = (await c.call('GET', '/api/overview')).json.over_budget
    assert.deepEqual(over.map(b => [b.id, b.spent_cents, b.budget_cents]), [['gifts', 5000, 2000]])

    // Changing the amount keeps it rolling; turning it off stops the carry.
    assert.equal((await c.call('PUT', '/api/budgets/gifts', { amount: '120' })).json.budget.rollover, true)
    const off = await c.call('PUT', '/api/budgets/gifts', { amount: '120', rollover: false })
    assert.deepEqual([off.json.budget.rollover, off.json.budget.rollover_from], [false, ''])
    gifts = (await c.call('GET', `/api/spending?period=month&at=${ago(0)}`)).json.categories.find(x => x.id === 'gifts')
    assert.deepEqual([gifts.budget_cents, gifts.carry_cents], [12000, undefined])
  })
})
