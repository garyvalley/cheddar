// Spending categories, end to end through Nuxt against a real PocketBase
// with its hooks: every transaction is sorted as it arrives, moving one
// teaches its merchant's rule, Spending adds the categories up, and nobody
// sets a category any other way or touches anyone else's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, ready, signedIn } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const month = today.slice(0, 7)
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

const CSV = 'Date,Description,Amount\n'
  + `${us(today)},STARBUCKS STORE #12 SEATTLE,-4.50\n`
  + `${us(today)},STARBUCKS STORE #88 PORTLAND,-5.25\n`
  + `${us(today)},"WHOLE FOODS MKT #10",-82.10\n`
  + `${us(today)},PAYROLL ACME,2500.00\n`
  + `${us(today)},ONLINE TRANSFER TO SAVINGS,-300.00\n`
  + `${us(today)},MYSTERY SHOP,-10.00\n`

async function account(c, name = 'Everyday') {
  const r = await c.call('POST', '/api/accounts', { name, kind: 'checking' })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

async function imported(c, accountId, text = CSV, filename = 'statement.csv') {
  const r = await c.call('POST', '/api/imports', { account: accountId, filename, text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return (await c.call('GET', `/api/transactions?account=${accountId}`)).json.items
}

const byDescription = items => Object.fromEntries(items.map(t => [t.description, t]))
const pbToken = c => asPb(c)

describe('categories', () => {
  test('are chosen for each transaction as it is imported', async () => {
    const { c } = await ready()
    const tx = byDescription(await imported(c, (await account(c)).id))
    assert.deepEqual(
      Object.fromEntries(Object.entries(tx).map(([d, t]) => [d, [t.category, t.category_by]])),
      {
        'STARBUCKS STORE #12 SEATTLE': ['dining', 'match'],
        'STARBUCKS STORE #88 PORTLAND': ['dining', 'match'],
        'WHOLE FOODS MKT #10': ['groceries', 'match'],
        'PAYROLL ACME': ['income', 'match'],
        'ONLINE TRANSFER TO SAVINGS': ['transfer', 'match'],
        'MYSTERY SHOP': ['other', 'default'],
      },
    )
  })

  test('Spending adds them up for the month, leaving income and transfers out', async () => {
    const { c } = await ready()
    await imported(c, (await account(c)).id)
    const r = await c.call('GET', `/api/spending?period=month&at=${month}`)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.spent_cents, 450 + 525 + 8210 + 1000)
    assert.equal(r.json.income_cents, 250000)
    assert.deepEqual(r.json.categories.map(x => [x.id, x.total_cents, x.count]), [
      ['groceries', 8210, 1], ['other', 1000, 1], ['dining', 975, 2], ['income', 250000, 1], ['transfer', -30000, 1],
    ])
    const year = await c.call('GET', `/api/spending?period=year&at=${today.slice(0, 4)}`)
    assert.equal(year.json.spent_cents, r.json.spent_cents)
    const dining = await c.call('GET', `/api/transactions?category=dining&from=${month}-01&to=${month}-31`)
    assert.equal(dining.json.total, 2)
    assert.equal((await c.call('GET', '/api/transactions?category=nonsense')).status, 400)
  })

  test('moving one moves the rest from the same merchant, and its next ones follow', async () => {
    const { c } = await ready()
    const acct = await account(c)
    const tx = byDescription(await imported(c, acct.id))
    const r = await c.call('POST', `/api/transactions/${tx['STARBUCKS STORE #12 SEATTLE'].id}/category`, { category: 'groceries' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.moved, 1)
    let now = byDescription((await c.call('GET', `/api/transactions?account=${acct.id}`)).json.items)
    assert.deepEqual([now['STARBUCKS STORE #12 SEATTLE'].category, now['STARBUCKS STORE #12 SEATTLE'].category_by], ['groceries', 'person'])
    assert.deepEqual([now['STARBUCKS STORE #88 PORTLAND'].category, now['STARBUCKS STORE #88 PORTLAND'].category_by], ['groceries', 'rule'])
    assert.equal(now['WHOLE FOODS MKT #10'].category, 'groceries')

    // A later statement: the rule sorts the merchant's new charge.
    const later = byDescription(await imported(c, acct.id, `Date,Description,Amount\n${us(today)},STARBUCKS STORE #3 BOISE,-6.00\n`, 'later.csv'))
    assert.deepEqual([later['STARBUCKS STORE #3 BOISE'].category, later['STARBUCKS STORE #3 BOISE'].category_by], ['groceries', 'rule'])

    // Moving another of them again: the rule changes, but the one moved by hand stays put.
    const again = await c.call('POST', `/api/transactions/${now['STARBUCKS STORE #88 PORTLAND'].id}/category`, { category: 'entertainment' })
    assert.equal(again.json.moved, 1)
    now = byDescription((await c.call('GET', `/api/transactions?account=${acct.id}`)).json.items)
    assert.equal(now['STARBUCKS STORE #12 SEATTLE'].category, 'groceries')
    assert.equal(now['STARBUCKS STORE #88 PORTLAND'].category, 'entertainment')
    assert.equal(now['STARBUCKS STORE #3 BOISE'].category, 'entertainment')
  })

  test('refuses a category that isn\'t one', async () => {
    const { c } = await ready()
    const tx = await imported(c, (await account(c)).id)
    const r = await c.call('POST', `/api/transactions/${tx[0].id}/category`, { category: 'yachts' })
    assert.equal(r.status, 400)
  })

  test('only the owner, with two-step sign-in on, can move a transaction', async () => {
    const owner = await ready()
    const tx = await imported(owner.c, (await account(owner.c)).id)
    const other = await ready()
    assert.equal((await other.c.call('POST', `/api/transactions/${tx[0].id}/category`, { category: 'travel' })).status, 404)
    // Straight to PocketBase's route with the other person's token: the same answer.
    const direct = await fetch(`${PB}/api/transactions/${tx[0].id}/category`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...pbToken(other.c) }, body: JSON.stringify({ category: 'travel' }),
    })
    assert.equal(direct.status, 404)
    const passwordOnly = await signedIn()
    const r = await fetch(`${PB}/api/transactions/${tx[0].id}/category`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...pbToken(passwordOnly.c) }, body: JSON.stringify({ category: 'travel' }),
    })
    assert.equal(r.status, 403)
    const after = (await owner.c.call('GET', '/api/transactions')).json.items.find(t => t.id === tx[0].id)
    assert.equal(after.category, tx[0].category)
  })

  test('the record API can\'t set a category or mark one as chosen by hand', async () => {
    const { c } = await ready()
    const acct = await account(c)
    const tx = byDescription(await imported(c, acct.id))
    const coffee = tx['STARBUCKS STORE #12 SEATTLE']
    const patch = await fetch(`${PB}/api/collections/transactions/records/${coffee.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...pbToken(c) },
      body: JSON.stringify({ category: 'travel', category_by: 'person', description: 'STARBUCKS STORE #12 SEATTLE' }),
    })
    assert.equal(patch.status, 200)
    const after = (await patch.json())
    assert.deepEqual([after.category, after.category_by], ['dining', 'match'])
    const made = await fetch(`${PB}/api/collections/transactions/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...pbToken(c) },
      body: JSON.stringify({ owner: (await c.call('GET', '/api/auth/me')).json.me.id, account: acct.id, posted: today, amount_cents: -100, source: 'manual', description: 'NETFLIX', category: 'travel', category_by: 'person' }),
    })
    assert.equal(made.status, 200)
    const row = await made.json()
    assert.deepEqual([row.category, row.category_by], ['entertainment', 'match'])
    // The rules themselves are the hooks' alone.
    const rules = await fetch(`${PB}/api/collections/category_rules/records`, { headers: { ...pbToken(c) } })
    assert.equal(rules.status, 403)
  })

  test('a person makes their own, tags with it, and it\'s remembered like a built-in one', async () => {
    const { c } = await ready()
    const acct = await account(c)
    const tx = byDescription(await imported(c, acct.id))
    const made = await c.call('POST', '/api/categories', { name: '  Coffee  habit ' })
    assert.equal(made.status, 201, JSON.stringify(made.json))
    const mine = made.json.category
    assert.match(mine.id, /^c-[a-z0-9]{15}$/)
    assert.deepEqual([mine.label, mine.spending, mine.custom], ['Coffee habit', true, true])
    assert.equal((await c.call('POST', '/api/categories', { name: 'coffee HABIT' })).status, 400, 'names are unique, any case')
    assert.equal((await c.call('POST', '/api/categories', { name: 'Groceries' })).status, 400, 'nor a built-in one\'s')
    assert.equal((await c.call('POST', '/api/categories', { name: 'x'.repeat(41) })).status, 400)
    const listed = (await c.call('GET', '/api/categories')).json.categories
    assert.equal(listed.at(-1).id, mine.id)
    assert.equal(listed.filter(x => !x.custom).length, 19)

    const r = await c.call('POST', `/api/transactions/${tx['STARBUCKS STORE #12 SEATTLE'].id}/category`, { category: mine.id })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.moved, 1)
    const later = byDescription(await imported(c, acct.id, `Date,Description,Amount\n${us(today)},STARBUCKS STORE #3 BOISE,-6.00\n`, 'later.csv'))
    assert.deepEqual([later['STARBUCKS STORE #3 BOISE'].category, later['STARBUCKS STORE #3 BOISE'].category_by], [mine.id, 'rule'])
    const summary = (await c.call('GET', `/api/spending?at=${month}`)).json
    assert.deepEqual(summary.categories.find(x => x.id === mine.id), { id: mine.id, label: 'Coffee habit', spending: true, custom: true, total_cents: 1575, count: 3 })
    assert.equal((await c.call('GET', `/api/transactions?category=${mine.id}`)).json.total, 3)

    const renamed = await c.call('POST', `/api/categories/${mine.id}/rename`, { name: 'Cafés' })
    assert.equal(renamed.json.category.label, 'Cafés')
    assert.equal((await c.call('POST', `/api/categories/${mine.id}/rename`, { name: 'Dining and drinks' })).status, 400)

    // Deleting it: its transactions are sorted again on their own, and its rule goes.
    const gone = await c.call('POST', `/api/categories/${mine.id}/remove`)
    assert.equal(gone.status, 200, JSON.stringify(gone.json))
    assert.equal(gone.json.resorted, 3)
    const after = (await c.call('GET', `/api/transactions?account=${acct.id}`)).json.items.filter(t => t.description.startsWith('STARBUCKS'))
    assert.deepEqual(after.map(t => [t.category, t.category_by]), [['dining', 'match'], ['dining', 'match'], ['dining', 'match']])
    assert.equal((await c.call('GET', '/api/categories')).json.categories.some(x => x.id === mine.id), false)
  })

  test('one person\'s own categories are theirs alone', async () => {
    const owner = await ready()
    const mine = (await owner.c.call('POST', '/api/categories', { name: 'Hobbies' })).json.category
    const other = await ready()
    const theirs = await imported(other.c, (await account(other.c)).id)
    assert.equal((await other.c.call('GET', '/api/categories')).json.categories.some(x => x.id === mine.id), false)
    assert.equal((await other.c.call('POST', `/api/transactions/${theirs[0].id}/category`, { category: mine.id })).status, 400)
    assert.equal((await other.c.call('POST', `/api/categories/${mine.id}/rename`, { name: 'Mine now' })).status, 404)
    assert.equal((await other.c.call('POST', `/api/categories/${mine.id}/remove`)).status, 404)
    const direct = await fetch(`${PB}/api/collections/custom_categories/records`, { headers: { ...pbToken(other.c) } })
    assert.equal(direct.status, 403)
    const passwordOnly = await signedIn()
    assert.equal((await passwordOnly.c.call('POST', '/api/categories', { name: 'Nope' })).status, 403)
    assert.equal((await owner.c.call('GET', '/api/categories')).json.categories.at(-1).label, 'Hobbies')
  })
})
