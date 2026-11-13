// Taxes end to end: this year's income, tax payments and money moved into
// retirement accounts, from transactions imported on Accounts and sorted by
// the hooks; this year or last whole (#32), and nobody sees another's.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ready } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const year = today.slice(0, 4)
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

async function account(c, name, kind) {
  const r = await c.call('POST', '/api/accounts', { name, kind })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

async function imported(c, accountId, rows) {
  const text = `Date,Description,Amount\n${rows.map(r => r.join(',')).join('\n')}\n`
  const r = await c.call('POST', '/api/imports', { account: accountId, filename: 'statement.csv', text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
}

describe('taxes', () => {
  test('add up this year from the accounts\' transactions', async () => {
    const { c } = await ready()
    const chk = await account(c, 'Checking', 'checking')
    const ira = await account(c, 'IRA', 'retirement')
    await imported(c, chk.id, [
      [`12/31/${Number(year) - 1}`, 'PAYROLL ACME', '900.00'],
      [us(`${year}-01-02`), 'PAYROLL ACME', '2500.00'],
      [us(`${year}-01-03`), 'IRS USATAXPYMT', '-400.00'],
      [us(`${year}-01-04`), 'CVS PHARMACY', '-20.00'],
    ])
    await imported(c, ira.id, [[us(`${year}-01-05`), 'TRANSFER FROM CHECKING', '1000.00']])
    const r = await c.call('GET', `/api/taxes?year=${year}`)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(
      [r.json.year, r.json.from, r.json.income_cents, r.json.tax_paid_cents, r.json.retirement_in_cents, r.json.health_cents, r.json.has_retirement],
      [Number(year), `${year}-01-01`, 250000, 40000, 100000, 2000, true],
    )
    assert.deepEqual(r.json.years, [Number(year), Number(year) - 1])

    // Last year, whole: only its own transactions, to December 31.
    const last = (await c.call('GET', `/api/taxes?year=${Number(year) - 1}`)).json
    assert.deepEqual([last.year, last.to, last.income_cents, last.projected_income_cents], [Number(year) - 1, `${Number(year) - 1}-12-31`, 90000, null])
    // A year not offered is the default one.
    const odd = (await c.call('GET', '/api/taxes?year=1999')).json.year
    assert.ok([Number(year), Number(year) - 1].includes(odd))
  })

  test('start from the first transaction, and show nobody else\'s', async () => {
    const owner = await ready()
    const other = await ready()
    const chk = await account(owner.c, 'Checking', 'checking')
    await imported(owner.c, chk.id, [[us(today), 'PAYROLL ACME', '100.00']])
    assert.equal((await owner.c.call('GET', `/api/taxes?year=${year}`)).json.from, today)
    const theirs = (await other.c.call('GET', `/api/taxes?year=${year}`)).json
    assert.deepEqual([theirs.income_cents, theirs.from], [0, `${year}-01-01`])
  })
})
