// Overview and Projections with years of daily balance history (issue #35):
// they read only the last year's days and each month's first and last
// balance before that (balance_history_months), answer quickly, and add up
// to exactly what the full history gives.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, ready, superuser } from './helpers.mjs'
import { GROWTH_PERIODS, asHeld, growth, growthStart, netWorthChange } from '../../shared/overview.ts'
import { debts } from '../../shared/projections.ts'

const YEARS = 5
const day = n => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

async function seed(su, owner, accounts) {
  const rows = []
  for (const [i, a] of accounts.entries()) {
    for (let n = YEARS * 365; n >= 1; n--) {
      // A wobbly climb (or paydown, for the loan), so every day differs.
      const sign = a.kind === 'loan' ? -1 : 1
      rows.push({ owner, account: a.id, date: day(n), balance_cents: sign * (5_000_000 - n * 997 * (i + 1) + (n % 13) * 311) })
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${PB}/api/batch`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: su },
      body: JSON.stringify({ requests: rows.slice(i, i + 200).map(body => ({ method: 'POST', url: '/api/collections/balance_history/records', body })) }),
    })
    assert.equal(r.status, 200, await r.text())
  }
}

async function fullHistory(su, owner) {
  const out = []
  for (let page = 1; ; page++) {
    const r = await (await fetch(`${PB}/api/collections/balance_history/records?perPage=500&page=${page}&sort=date&filter=${encodeURIComponent(`owner = '${owner}'`)}`, { headers: { authorization: su } })).json()
    out.push(...r.items.map(p => ({ account: p.account, date: p.date, balance_cents: p.balance_cents })))
    if (page >= r.totalPages) return out
  }
}

describe('overview at scale', () => {
  test(`${YEARS} years of daily balances: quick, and the same sums as the full history`, { timeout: 300_000 }, async () => {
    const { c, id } = await ready()
    const made = []
    for (const [name, kind] of [['Brokerage', 'brokerage'], ['401(k)', 'retirement'], ['IRA', 'retirement'], ['Mortgage', 'loan']]) {
      const a = (await c.call('POST', '/api/accounts', { name, kind })).json.account
      await c.call('PATCH', `/api/accounts/${a.id}`, { balance: kind === 'loan' ? '45000' : '60000' })
      made.push(a)
    }
    const su = await superuser()
    await seed(su, id, made)

    const started = performance.now()
    const r = await c.call('GET', '/api/overview')
    const took = performance.now() - started
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.ok(took < 1500, `Overview took ${Math.round(took)} ms`)

    const accounts = (await c.call('GET', '/api/accounts')).json.accounts
    const { accounts: held, history } = asHeld(accounts, await fullHistory(su, id))
    const today = accounts[0].balance_date
    for (const p of GROWTH_PERIODS) {
      assert.deepEqual(r.json.growth.find(g => g.period === p.id), growth(held, history, [], p.id, today), p.id)
    }
    assert.deepEqual(r.json.change, netWorthChange(held, history, growthStart('1m', today)))

    const proj = (await c.call('GET', '/api/projections')).json
    assert.deepEqual(proj.debts.map(d => [d.id, d.paydown_cents, d.basis]), debts(held, [], history, proj.months.map(m => m.month)).map(d => [d.id, d.paydown_cents, d.basis]))
  })
})
