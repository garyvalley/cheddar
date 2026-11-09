// Projections end to end: the savings rate from last month's income and
// spending (not this month's), what's invested, and a card's pace and payoff;
// nobody sees another's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'

async function account(c, body) {
  const r = await c.call('POST', '/api/accounts', body)
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

const pad = n => String(n).padStart(2, '0')
/** The 5th of the month `back` months before this one, as a CSV date (MM/DD/YYYY). */
function csvDay(back) {
  const d = new Date()
  d.setDate(5)
  d.setMonth(d.getMonth() - back)
  return `${pad(d.getMonth() + 1)}/05/${d.getFullYear()}`
}

async function load(c, accountId, lines) {
  const text = `Date,Description,Amount\n${lines.join('\n')}\n`
  const r = await c.call('POST', '/api/imports', { account: accountId, filename: 'p.csv', text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
}

describe('projections', () => {
  test('take the savings rate from whole months, and pace each debt', async () => {
    const { c } = await ready()
    const chk = await account(c, { name: 'Checking', kind: 'checking' })
    const card = await account(c, { name: 'Visa', kind: 'credit_card' })
    const ira = await account(c, { name: 'IRA', kind: 'retirement' })
    await c.call('PATCH', `/api/accounts/${card.id}`, { balance: '1200' })
    await c.call('PATCH', `/api/accounts/${ira.id}`, { balance: '50000' })
    await load(c, chk.id, [
      `${csvDay(1)},PAYROLL ACME DIRECT DEP,4000.00`,
      `${csvDay(1)},WHOLE FOODS,-1000.00`,
      `${csvDay(0)},PAYROLL ACME DIRECT DEP,4000.00`, // this month: not counted yet
    ])
    await load(c, card.id, [`${csvDay(1)},PAYMENT THANK YOU,500.00`, `${csvDay(1)},SHELL OIL,-100.00`])

    const r = await c.call('GET', '/api/projections')
    assert.equal(r.status, 200, JSON.stringify(r.json))
    const p = r.json
    assert.equal(p.months.length, 6)
    assert.equal(p.savings.months_counted, 1)
    assert.equal(p.savings.income_cents, 400000)
    assert.equal(p.savings.rate, (400000 - p.savings.spent_cents) / 400000)
    assert.ok(p.savings.spent_cents >= 100000, JSON.stringify(p.savings))
    assert.deepEqual([p.invested_cents, p.has_investments], [5000000, true])
    assert.deepEqual(p.debts.map(d => [d.name, d.owed_cents, d.paydown_cents, d.basis]), [['Visa', 120000, 40000, 'transactions']])
  })

  test('are each person\'s own', async () => {
    const owner = await ready()
    const other = await ready()
    const ira = await account(owner.c, { name: 'IRA', kind: 'retirement' })
    await owner.c.call('PATCH', `/api/accounts/${ira.id}`, { balance: '100' })
    const p = (await other.c.call('GET', '/api/projections')).json
    assert.deepEqual([p.invested_cents, p.debts, p.savings.months_counted], [0, [], 0])
  })
})
