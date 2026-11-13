// Overview end to end: balances entered on Accounts and their history, net
// worth, the months' income and spending, and investment growth; nobody
// writes a balance's history but the hooks, and nobody sees another's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, ready, superuser } from './helpers.mjs'

async function account(c, body) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const history = async (token, accountId) => (await (await fetch(
  `${PB}/api/collections/balance_history/records?filter=${encodeURIComponent(`account = '${accountId}'`)}`,
  { headers: typeof token === 'string' ? { authorization: token } : token },
)).json()).items

describe('balances', () => {
  test('are entered for an unlinked account, owed as negative, and kept day by day', async () => {
    const { c } = await ready()
    const card = await account(c, { name: 'Visa', kind: 'credit_card' })
    assert.equal(card.balance_cents, null)
    const r = await c.call('PATCH', `/api/accounts/${card.id}`, { balance: '1,200.50' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual([r.json.account.balance_cents, r.json.account.balance_date], [-120050, today()])
    await c.call('PATCH', `/api/accounts/${card.id}`, { balance: '900' })
    const rows = await history(await superuser(), card.id)
    assert.deepEqual(rows.map(h => [h.date, h.balance_cents]), [[today(), -90000]])
  })

  test('refuse what is not an amount, and anyone else\'s account', async () => {
    const owner = await ready()
    const other = await ready()
    const a = await account(owner.c, { name: 'Checking', kind: 'checking' })
    assert.match((await owner.c.call('PATCH', `/api/accounts/${a.id}`, { balance: 'lots' })).json.message, /amount/)
    assert.equal((await other.c.call('PATCH', `/api/accounts/${a.id}`, { balance: '5' })).status, 404)
  })

  test('history is written only by the hooks, and read only by its owner', async () => {
    const owner = await ready()
    const other = await ready()
    const a = await account(owner.c, { name: 'Checking', kind: 'checking' })
    await owner.c.call('PATCH', `/api/accounts/${a.id}`, { balance: '10' })
    const token = c => asPb(c)
    const forged = await fetch(`${PB}/api/collections/balance_history/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...token(owner.c) },
      body: JSON.stringify({ owner: owner.id, account: a.id, date: '2020-01-01', balance_cents: 1 }),
    })
    assert.ok([400, 403].includes(forged.status), `create: ${forged.status}`)
    assert.equal((await history(token(owner.c), a.id)).length, 1)
    assert.equal((await history(token(other.c), a.id)).length, 0)
  })
})

describe('overview', () => {
  test('adds balances into net worth and each month\'s income and spending', async () => {
    const { c } = await ready()
    const chk = await account(c, { name: 'Checking', kind: 'checking' })
    const card = await account(c, { name: 'Card', kind: 'credit_card' })
    await account(c, { name: 'Unset', kind: 'savings' })
    await c.call('PATCH', `/api/accounts/${chk.id}`, { balance: '3000' })
    await c.call('PATCH', `/api/accounts/${card.id}`, { balance: '500' })
    const month = today().slice(0, 7)
    const day = `${month.slice(5)}/01/${month.slice(0, 4)}`
    const csv = `Date,Description,Amount\n${day},PAYROLL ACME DIRECT DEP,2000.00\n${day},WHOLE FOODS,-120.00\n${day},TRANSFER TO SAVINGS,-500.00\n`
    assert.equal((await c.call('POST', '/api/imports', { account: chk.id, filename: 'a.csv', text: csv })).status, 201)

    const r = await c.call('GET', '/api/overview')
    assert.equal(r.status, 200, JSON.stringify(r.json))
    const o = r.json
    assert.equal(o.net_worth.total_cents, 250000)
    assert.deepEqual(o.net_worth.groups.map(g => [g.id, g.total_cents]), [['cash', 300000], ['debts', -50000]])
    assert.deepEqual(o.net_worth.missing.map(m => m.name), ['Unset'])
    assert.equal(o.months.length, 12)
    const now = o.months.at(-1)
    assert.deepEqual([now.month, now.income_cents, now.spent_cents], [month, 200000, 12000])
    assert.equal(o.has_investments, false)
  })

  test('says how investments grew from the balances seen before', async () => {
    const { c, id } = await ready()
    const brk = await account(c, { name: 'Brokerage', kind: 'brokerage' })
    await c.call('PATCH', `/api/accounts/${brk.id}`, { balance: '11000' })
    // A balance from two months ago, as a daily sync would have kept it.
    const su = await superuser()
    const d = new Date()
    d.setMonth(d.getMonth() - 2)
    const then = d.toISOString().slice(0, 10)
    const made = await fetch(`${PB}/api/collections/balance_history/records`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: su },
      body: JSON.stringify({ owner: id, account: brk.id, date: then, balance_cents: 1000000 }),
    })
    assert.equal(made.status, 200)
    const o = (await c.call('GET', '/api/overview')).json
    assert.equal(o.has_investments, true)
    const g = Object.fromEntries(o.growth.map(x => [x.period, x]))
    assert.deepEqual([g['3m'].start_cents, g['3m'].gain_cents, g['3m'].rate], [1000000, 100000, 0.1])
    assert.equal(g.all.since, then)
  })

  test('is each person\'s own', async () => {
    const owner = await ready()
    const other = await ready()
    const a = await account(owner.c, { name: 'Checking', kind: 'checking' })
    await owner.c.call('PATCH', `/api/accounts/${a.id}`, { balance: '100' })
    const o = (await other.c.call('GET', '/api/overview')).json
    assert.deepEqual([o.net_worth.total_cents, o.net_worth.groups], [0, []])
  })
})
