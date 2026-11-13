// Changing an account after it's made (issue #25): its name, kind, bank and
// last four; closing it, which takes it out of net worth but keeps its
// history in past reports; and leaving it out of every page's numbers.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { APP, PASSWORD, PB, ready, superuser } from './helpers.mjs'
import { unzip } from '../unzip.mjs'

async function account(c, body) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

const patch = (c, id, body) => c.call('PATCH', `/api/accounts/${id}`, body)
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
// Two weeks back is in a past month or this one either way, and inside "this year" except in early January.
const PAST = day(-14)

async function withSpending(c, name, kind = 'checking') {
  const a = await account(c, { name, kind })
  const csv = `Date,Description,Amount\n${PAST},GROCERY STORE,-50.00\n`
  const r = await c.call('POST', '/api/imports', { account: a.id, filename: 's.csv', text: csv })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return a
}

const monthSpent = async (c, extra = '') => (await c.call('GET', `/api/spending?at=${PAST.slice(0, 7)}${extra}`)).json.spent_cents

describe('changing an account', () => {
  test('renames it and fixes its kind, bank and last four, and checks them as a new one\'s', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Card', kind: 'other' })
    const r = await patch(c, a.id, { name: ' Visa ', kind: 'credit_card', institution: 'Big Bank', last4: '4242' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual([r.json.account.name, r.json.account.kind, r.json.account.institution, r.json.account.last4], ['Visa', 'credit_card', 'Big Bank', '4242'])
    assert.match((await patch(c, a.id, { name: '' })).json.message, /name/)
    assert.match((await patch(c, a.id, { kind: 'crypto' })).json.message, /kind/)
    assert.match((await patch(c, a.id, { last4: '12' })).json.message, /four digits/)
    assert.equal((await patch(c, a.id, { last4: '' })).json.account.last4, '')
  })

  test('a card made as "other" keeps what was typed for it, now as owed, history and all', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Card', kind: 'other' })
    await patch(c, a.id, { balance: '500' })
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, 50000)
    const r = await patch(c, a.id, { kind: 'credit_card' })
    assert.equal(r.json.account.balance_cents, -50000)
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, -50000)
    const rows = await (await fetch(`${PB}/api/collections/balance_history/records?filter=${encodeURIComponent(`account = '${a.id}'`)}`, { headers: { authorization: await superuser() } })).json()
    assert.deepEqual(rows.items.map(h => h.balance_cents), [-50000])
    // Back again, and with a new balance in the same change, that balance as typed.
    assert.equal((await patch(c, a.id, { kind: 'savings', balance: '20' })).json.account.balance_cents, 2000)
  })

  test('nobody else can change it', async () => {
    const owner = await ready()
    const other = await ready()
    const a = await account(owner.c, { name: 'Mine', kind: 'checking' })
    assert.equal((await patch(other.c, a.id, { name: 'Theirs' })).status, 404)
    assert.equal((await patch(other.c, a.id, { excluded: true })).status, 404)
    assert.equal((await owner.c.call('GET', '/api/accounts')).json.accounts[0].name, 'Mine')
  })

  test('refuses a request from another site', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Mine', kind: 'checking' })
    assert.equal((await c.call('PATCH', `/api/accounts/${a.id}`, { name: 'X' }, { origin: 'https://evil.example' })).status, 403)
  })
})

describe('closing an account', () => {
  test('takes it out of net worth and keeps its transactions in past reports', async () => {
    const { c } = await ready()
    const loan = await withSpending(c, 'Loan', 'loan')
    await patch(c, loan.id, { balance: '1000' })
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, -100000)
    const r = await patch(c, loan.id, { closed_on: day() })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.account.closed_on, day())

    const overview = (await c.call('GET', '/api/overview')).json
    assert.equal(overview.net_worth.total_cents, 0)
    assert.equal((await c.call('GET', '/api/projections')).json.debts.length, 0)
    assert.equal(await monthSpent(c), 5000)
    assert.equal((await c.call('GET', '/api/transactions')).json.total, 1)
    // Still listed, and opened again with no day.
    assert.equal((await c.call('GET', '/api/accounts')).json.accounts.length, 1)
    assert.equal((await patch(c, loan.id, { closed_on: '' })).json.account.closed_on, '')
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, -100000)
  })

  test('refuses a day in the future or one that isn\'t a date', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'Card', kind: 'credit_card' })
    assert.match((await patch(c, a.id, { closed_on: day(3) })).json.message, /future/)
    assert.match((await patch(c, a.id, { closed_on: 'last week' })).json.message, /date/)
  })
})

describe('an account left out', () => {
  test('counts on no page, but shows when picked, stays in the export, and counts again at once', async () => {
    const { c } = await ready()
    const joint = await withSpending(c, 'Joint', 'checking')
    await withSpending(c, 'Mine', 'checking')
    await patch(c, joint.id, { balance: '300' })
    assert.equal(await monthSpent(c), 10000)

    assert.equal((await patch(c, joint.id, { excluded: true })).json.account.excluded, true)
    assert.equal(await monthSpent(c), 5000)
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, 0)
    assert.equal((await c.call('GET', '/api/transactions')).json.total, 1)
    // The export is everything the person has.
    const zip = await fetch(`${APP}/api/export`, {
      method: 'POST',
      headers: { 'origin': APP, 'content-type': 'application/json', 'cookie': c.cookie, 'x-forwarded-for': c.from },
      body: JSON.stringify({ password: PASSWORD }),
    })
    const data = JSON.parse(unzip(Buffer.from(await zip.arrayBuffer()))['cheddar.json'])
    assert.equal(data.transactions.length, 2)
    assert.equal(data.accounts.find(a => a.id === joint.id).excluded, true)
    // Picked by name, it's all there.
    assert.equal(await monthSpent(c, `&account=${joint.id}`), 5000)
    assert.equal((await c.call('GET', `/api/transactions?account=${joint.id}`)).json.total, 1)

    assert.equal((await patch(c, joint.id, { excluded: false })).json.account.excluded, false)
    assert.equal(await monthSpent(c), 10000)
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, 30000)
  })

  test('must be said with true or false', async () => {
    const { c } = await ready()
    const a = await account(c, { name: 'A', kind: 'checking' })
    assert.match((await patch(c, a.id, { excluded: 'yes' })).json.message, /count/)
  })
})
