// Splitting a transaction across categories, end to end against a real
// PocketBase: the parts count in their categories on Spending, Overview and
// Taxes instead of the whole, a category's list finds the transaction by
// its parts, the parts must add up in the person's own categories however
// they're written, an amount that changes afterwards leaves the split to
// fix without losing a cent of the total, and a category that's deleted
// takes its parts to Other.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, ready } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const month = today.slice(0, 7)
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

async function account(c, body = { name: 'Everyday', kind: 'checking' }) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

async function imported(c, accountId, rows) {
  const text = `Date,Description,Amount\n${rows.map(r => r.join(',')).join('\n')}\n`
  const r = await c.call('POST', '/api/imports', { account: accountId, filename: 'statement.csv', text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
}

const list = async (c, query = '') => (await c.call('GET', `/api/transactions?${query}`)).json
const byDescription = async (c, description) => (await list(c, `q=${encodeURIComponent(description)}`)).items.find(t => t.description === description)
const spending = async c => (await c.call('GET', `/api/spending?at=${month}`)).json
const totalOf = (summary, id) => summary.categories.find(x => x.id === id)?.total_cents ?? 0
const split = (c, t, parts) => c.call('PATCH', `/api/transactions/${t.id}`, { splits: parts })
const tokenOf = c => decodeURIComponent(c.cookie.slice('pb_token='.length))

describe('splitting a transaction', () => {
  test('counts its parts in their categories everywhere, and undoing it puts it back', async () => {
    const { c } = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'WHOLE FOODS MARKET', '-120.00'], [us(today), 'PAYROLL ACME', '1000.00']])
    const shop = await byDescription(c, 'WHOLE FOODS MARKET')
    assert.equal(shop.category, 'groceries')
    const before = await spending(c)
    const overviewBefore = (await c.call('GET', '/api/overview')).json.months.at(-1)

    const r = await split(c, shop, [{ category: 'groceries', amount: '80' }, { category: 'shopping', amount: '40.00' }])
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.transaction.splits, [{ category: 'groceries', amount_cents: -8000 }, { category: 'shopping', amount_cents: -4000 }])

    const after = await spending(c)
    assert.equal(after.spent_cents, before.spent_cents, 'the same money, in other places')
    assert.equal(totalOf(before, 'groceries') - totalOf(after, 'groceries'), 4000)
    assert.equal(totalOf(after, 'shopping') - totalOf(before, 'shopping'), 4000)
    const overviewAfter = (await c.call('GET', '/api/overview')).json.months.at(-1)
    assert.deepEqual([overviewAfter.spent_cents, overviewAfter.income_cents], [overviewBefore.spent_cents, overviewBefore.income_cents])

    // Each category's list finds it by its parts.
    assert.deepEqual((await list(c, 'category=shopping')).items.map(t => t.description), ['WHOLE FOODS MARKET'])
    assert.deepEqual((await list(c, 'category=groceries')).items.map(t => t.description), ['WHOLE FOODS MARKET'])

    // The download says how it's split.
    const csv = (await c.call('GET', '/api/transactions/csv')).json
    assert.match(csv, /WHOLE FOODS MARKET,,Groceries,no,,no,Groceries -80\.00; Shopping -40\.00/)

    assert.deepEqual((await split(c, shop, [])).json.transaction.splits, [])
    assert.equal(totalOf(await spending(c), 'groceries'), totalOf(before, 'groceries'))
    assert.equal((await list(c, 'category=shopping')).total, 0)
  })

  test('a category\'s list leaves out one split entirely elsewhere', async () => {
    const { c } = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'WHOLE FOODS MARKET', '-50.00']])
    const shop = await byDescription(c, 'WHOLE FOODS MARKET')
    assert.equal((await split(c, shop, [{ category: 'shopping', amount: '30' }, { category: 'gifts', amount: '20' }])).status, 200)
    assert.equal((await list(c, 'category=groceries')).total, 0)
    assert.equal(totalOf(await spending(c), 'groceries'), 0)
    assert.equal(totalOf(await spending(c), 'gifts'), 2000)
  })

  test('moves part of a deposit out of income on Taxes', async () => {
    const { c } = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'PAYROLL ACME', '1000.00']])
    const pay = await byDescription(c, 'PAYROLL ACME')
    const before = (await c.call('GET', '/api/taxes')).json
    assert.equal((await split(c, pay, [{ category: 'income', amount: '750' }, { category: 'transfer', amount: '250' }])).status, 200)
    const after = (await c.call('GET', '/api/taxes')).json
    assert.equal(before.income_cents - after.income_cents, 25000)
  })

  test('the parts must add up, in the person\'s own categories', async () => {
    const { c } = await ready()
    const other = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'COSTCO WHSE', '-100.00']])
    const t = await byDescription(c, 'COSTCO WHSE')
    const theirs = (await other.c.call('POST', '/api/categories', { name: 'Garage' })).json.category

    for (const [parts, message] of [
      [[{ category: 'groceries', amount: '60' }, { category: 'shopping', amount: '30' }], /\$10\.00 less/],
      [[{ category: 'groceries', amount: '100' }], /two different/],
      [[{ category: 'groceries', amount: '60' }, { category: theirs.id, amount: '40' }], /category for each/],
      [[{ category: 'groceries', amount: '60' }, { category: 'nope', amount: '40' }], /category for each/],
      ['groceries', /parts/],
    ]) {
      const r = await split(c, t, parts)
      assert.equal(r.status, 400, JSON.stringify(parts))
      assert.match(r.json.message, message)
    }
    // Someone else can't split it.
    assert.equal((await split(other.c, t, [{ category: 'groceries', amount: '60' }, { category: 'shopping', amount: '40' }])).status, 404)
    assert.deepEqual((await byDescription(c, 'COSTCO WHSE')).splits, [])
  })

  test('straight to PocketBase, the hooks check the parts just the same', async () => {
    const { c } = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'COSTCO WHSE', '-100.00']])
    const t = await byDescription(c, 'COSTCO WHSE')
    const token = tokenOf(c)
    const patch = body => fetch(`${PB}/api/collections/transactions/records/${t.id}`, {
      method: 'PATCH', headers: { 'authorization': token, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    for (const splits of [
      [{ category: 'groceries', amount_cents: -6000 }, { category: 'shopping', amount_cents: -3000 }],
      [{ category: 'groceries', amount_cents: -14000 }, { category: 'shopping', amount_cents: 4000 }],
      [{ category: 'groceries', amount_cents: -5000 }, { category: 'groceries', amount_cents: -5000 }],
      [{ category: 'c-aaaaaaaaaaaaaaa', amount_cents: -5000 }, { category: 'groceries', amount_cents: -5000 }],
      { category: 'groceries' },
    ]) {
      assert.equal((await patch({ splits })).status, 400, JSON.stringify(splits))
    }
    const ok = await patch({ splits: [{ category: 'groceries', amount_cents: -6000 }, { category: 'shopping', amount_cents: -4000 }] })
    assert.equal(ok.status, 200)
    assert.equal(totalOf(await spending(c), 'shopping'), 4000)

    // A new one starts unsplit, whatever it's sent with.
    const { owner } = await (await fetch(`${PB}/api/collections/transactions/records/${t.id}`, { headers: { authorization: token } })).json()
    const created = await fetch(`${PB}/api/collections/transactions/records`, {
      method: 'POST', headers: { 'authorization': token, 'content-type': 'application/json' },
      body: JSON.stringify({
        owner, account: a.id, source: 'manual', posted: today, amount_cents: -1000, description: 'X',
        splits: [{ category: 'shopping', amount_cents: -999999 }, { category: 'groceries', amount_cents: 989999 }],
      }),
    })
    assert.equal(created.status, 200)
    assert.equal((await created.json()).splits, null)
  })

  test('an amount that changes afterwards leaves the split to fix, and the rest counts in its own category', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Cash', kind: 'checking' })
    const added = await c.call('POST', '/api/transactions', { account: a.id, posted: today, amount: '100', direction: 'out', description: 'Farmers market', note: '' })
    assert.equal(added.status, 201, JSON.stringify(added.json))
    const t = added.json.transaction
    assert.equal((await split(c, t, [{ category: 'groceries', amount: '70' }, { category: 'gifts', amount: '30' }])).status, 200)
    const changed = await c.call('PATCH', `/api/transactions/${t.id}`, { amount: '110', direction: 'out' })
    assert.equal(changed.status, 200, JSON.stringify(changed.json))
    assert.equal(changed.json.transaction.splits.length, 2, 'kept, to fix')
    const s = await spending(c)
    assert.equal(s.spent_cents, 11000, 'every cent still counted')
    assert.equal(totalOf(s, 'gifts'), 3000)
    assert.equal(totalOf(s, t.category) - (t.category === 'groceries' ? 7000 : 0), 1000)
  })

  test('a category that\'s deleted takes its parts to Other', async () => {
    const { c } = await ready()
    const a = await account(c)
    await imported(c, a.id, [[us(today), 'COSTCO WHSE', '-100.00']])
    const t = await byDescription(c, 'COSTCO WHSE')
    const garage = (await c.call('POST', '/api/categories', { name: 'Garage' })).json.category
    assert.equal((await split(c, t, [{ category: 'groceries', amount: '60' }, { category: garage.id, amount: '40' }])).status, 200)
    assert.equal(totalOf(await spending(c), garage.id), 4000)
    assert.equal((await c.call('POST', `/api/categories/${garage.id}/remove`, {})).status, 200)
    assert.deepEqual((await byDescription(c, 'COSTCO WHSE')).splits, [{ category: 'groceries', amount_cents: -6000 }, { category: 'other', amount_cents: -4000 }])
    assert.equal((await list(c, 'category=other')).total, 1)
  })
})
