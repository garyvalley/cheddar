// Home and car values that change at a yearly rate (shared/property.ts,
// pb_hooks/property.pb.js), end to end through Nuxt and the hooks.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, ready, superuser } from './helpers.mjs'

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const today = daysAgo(0)

test('a property\'s value moves on each day by its yearly change, and only a property\'s', async () => {
  const { c } = await ready()
  const home = (await c.call('POST', '/api/accounts', { name: 'Home', kind: 'property' })).json.account
  const car = (await c.call('POST', '/api/accounts', { name: 'Car', kind: 'property' })).json.account
  const checking = (await c.call('POST', '/api/accounts', { name: 'Everyday', kind: 'checking' })).json.account
  assert.equal((await c.call('PATCH', `/api/accounts/${home.id}`, { balance: '500000', yearly_change: '3' })).status, 200)
  const set = await c.call('PATCH', `/api/accounts/${car.id}`, { balance: '20000', yearly_change: '-15' })
  assert.equal(set.json.account.yearly_change_bp, -1500)
  assert.equal((await c.call('PATCH', `/api/accounts/${checking.id}`, { yearly_change: '3' })).status, 400)
  assert.equal((await c.call('PATCH', `/api/accounts/${home.id}`, { yearly_change: '80' })).status, 400)

  // As if the values were typed a year ago.
  const su = await superuser()
  for (const a of [home, car, checking]) {
    const r = await fetch(`${PB}/api/collections/accounts/records/${a.id}`, {
      method: 'PATCH', headers: { 'authorization': su, 'content-type': 'application/json' },
      body: JSON.stringify({ balance_date: daysAgo(365), balance_cents: a === checking ? 100 : undefined }),
    })
    assert.equal(r.status, 200, await r.text())
  }
  const run = await fetch(`${PB}/api/property-values/run`, {
    method: 'POST', headers: { 'authorization': su, 'content-type': 'application/json' }, body: JSON.stringify({ today }),
  })
  const ran = await run.json()
  assert.equal(run.status, 200, JSON.stringify(ran))
  assert.ok(ran.moved >= 2)

  const accounts = Object.fromEntries((await c.call('GET', '/api/accounts')).json.accounts.map(a => [a.name, a]))
  assert.equal(accounts.Home.balance_cents, 51_500_000)
  assert.equal(accounts.Home.balance_date, today)
  assert.equal(accounts.Car.balance_cents, 1_700_000)
  assert.equal(accounts.Everyday.balance_date, daysAgo(365), 'a checking account stays as typed')

  // Only superusers run it by hand.
  assert.equal((await fetch(`${PB}/api/property-values/run`, { method: 'POST' })).status, 401)
})
