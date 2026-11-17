// Alerts by email (shared/alerts.ts, pb_hooks/alerts.pb.js), end to end
// through Nuxt against a real PocketBase with its hooks. Mail isn't set up
// here, so an alert "sent" is one the hooks would have emailed and now
// keep as sent: "Check now" answers them in words.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, asPb, ready, superuser } from './helpers.mjs'

const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const check = async c => {
  const r = await c.call('POST', '/api/alerts/check', {})
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return r.json.sent
}

/** Alerts go only to a confirmed address: confirms `id`'s, as its link would. */
async function confirmed(id) {
  const r = await fetch(`${PB}/api/collections/users/records/${id}`, {
    method: 'PATCH', headers: { authorization: await superuser(), 'content-type': 'application/json' }, body: JSON.stringify({ verified: true }),
  })
  assert.equal(r.status, 200, await r.text())
}

describe('alerts', () => {
  test('settings: off until chosen, amounts as typed, refused when not an amount', async () => {
    const { c } = await ready()
    assert.deepEqual((await c.call('GET', '/api/alerts')).json.settings, {
      charge_over_cents: 0, balance_under_cents: 0, bills: false, budgets: false, banks: false, weekly: false,
    })
    assert.equal((await c.call('POST', '/api/alerts/check', {})).status, 400, 'nothing to check before any is on')
    const put = await c.call('PUT', '/api/alerts', { charge_over: '250', balance_under: '', bills: true, budgets: false, banks: true, weekly: true })
    assert.equal(put.status, 200, JSON.stringify(put.json))
    assert.deepEqual(put.json.settings, { charge_over_cents: 25000, balance_under_cents: 0, bills: true, budgets: false, banks: true, weekly: true })
    assert.deepEqual((await c.call('GET', '/api/alerts')).json.settings, put.json.settings)
    assert.equal((await c.call('PUT', '/api/alerts', { charge_over: 'lots' })).status, 400)
  })

  test('each alert once: a low balance, a bill, a budget passed, a big new charge', async () => {
    const { c, id } = await ready()
    const a = (await c.call('POST', '/api/accounts', { name: 'Everyday', kind: 'checking' })).json.account
    assert.equal((await c.call('PATCH', `/api/accounts/${a.id}`, { balance: '80' })).status, 200)
    const bill = await c.call('POST', '/api/cashflow', { name: 'Rent', account: a.id, direction: 'expense', amount: '1900', cadence: 'monthly', next_date: day(1) })
    assert.equal(bill.status, 201, JSON.stringify(bill.json))
    const meal = await c.call('POST', '/api/transactions', { account: a.id, posted: day(0), amount: '60', direction: 'out', description: 'BISTRO' })
    await c.call('POST', `/api/transactions/${meal.json.transaction.id}/category`, { category: 'dining' })
    assert.equal((await c.call('PUT', '/api/budgets/dining', { amount: '50' })).status, 200)
    await c.call('PUT', '/api/alerts', { charge_over: '500', balance_under: '100', bills: true, budgets: true })
    assert.deepEqual(await check(c), [], 'nothing to an address not confirmed yet')
    await confirmed(id)

    const first = await check(c)
    assert.equal(first.length, 3, first.join('\n'))
    assert.match(first[0], /Everyday is down to \$80\.00/)
    assert.match(first[1], /^Rent: \$1,900\.00/)
    assert.match(first[2], /^Dining and drinks: \$60\.00 spent this month, over its \$50\.00 budget/)
    assert.deepEqual(await check(c), [], 'sent once')

    // A charge from before alerts were first looked at isn't news; one after is.
    await c.call('POST', '/api/transactions', { account: a.id, posted: day(0), amount: '700', direction: 'out', description: 'TV STORE' })
    const charge = await check(c)
    assert.equal(charge.length, 1, charge.join('\n'))
    assert.match(charge[0], /^TV STORE: \$700\.00 from Everyday/)

    // The balance back up and down again is said again.
    await c.call('PATCH', `/api/accounts/${a.id}`, { balance: '500' })
    assert.deepEqual(await check(c), [])
    await c.call('PATCH', `/api/accounts/${a.id}`, { balance: '20' })
    const again = await check(c)
    assert.equal(again.length, 1)
    assert.match(again[0], /down to \$20\.00/)
  })

  test('the record API can\'t set when charges were last looked for, nor read someone else\'s', async () => {
    const { c } = await ready()
    const { c: other } = await ready()
    await c.call('PUT', '/api/alerts', { weekly: true })
    const list = await (await fetch(`${PB}/api/collections/alert_settings/records`, { headers: asPb(c) })).json()
    assert.equal(list.items.length, 1)
    const id = list.items[0].id
    const r = await fetch(`${PB}/api/collections/alert_settings/records/${id}`, {
      method: 'PATCH', headers: { ...asPb(c), 'content-type': 'application/json' }, body: JSON.stringify({ checked: '2000-01-01 00:00:00.000Z' }),
    })
    assert.equal(r.status, 200)
    assert.notEqual((await r.json()).checked, '2000-01-01 00:00:00.000Z')
    assert.equal((await fetch(`${PB}/api/collections/alert_settings/records/${id}`, { headers: asPb(other) })).status, 404)
    assert.equal((await fetch(`${PB}/api/collections/alert_log/records`, { headers: asPb(c) })).status, 403)
  })
})
