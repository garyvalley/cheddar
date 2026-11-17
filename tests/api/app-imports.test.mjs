// Importing a file exported from Mint, Monarch or YNAB (shared/app-exports.ts),
// end to end through Nuxt against a real PocketBase with its hooks: one of
// the file's accounts comes in with its categories (mapped to Cheddar's,
// still behind the person's own rules), merchant names, notes and tags; and
// a client can't use the same way in to choose a category through the
// record API.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, ready } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const us = ymd => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}/${ymd.slice(0, 4)}`

const MINT = '"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name","Labels","Notes"\n'
  + `"${us(today)}","Corner Cafe","SQ *CORNER CAFE 1","12.50","debit","Groceries","Visa Card","Work lunch","With Sam"\n`
  + `"${us(today)}","Acme","ACME PAYROLL","2500.00","credit","Paycheck","Checking","",""\n`
  + `"${us(today)}","Odd Shop","ODD SHOP 22","30.00","debit","Uncategorized","Visa Card","",""\n`
  + `"${us(today)}","Netflix","NETFLIX.COM","15.49","debit","Shopping","Visa Card","",""\n`

const byDescription = items => Object.fromEntries(items.map(t => [t.description, t]))

describe('imports from other apps', () => {
  test('one account of a Mint file, with its categories, names, notes and tags', async () => {
    const { c } = await ready()
    const card = (await c.call('POST', '/api/accounts', { name: 'Card', kind: 'credit_card' })).json.account
    // The person's own rule comes before the other app's category.
    const ruled = await c.call('POST', '/api/rules', { text: 'netflix', min_cents: null, max_cents: null, account: '', category: 'entertainment', rename: '', exclude: false, apply: false })
    assert.equal(ruled.status, 201, JSON.stringify(ruled.json))

    const missing = await c.call('POST', '/api/imports', { account: card.id, filename: 'transactions.csv', text: MINT, source_account: 'Savings' })
    assert.equal(missing.status, 400)
    const r = await c.call('POST', '/api/imports', { account: card.id, filename: 'transactions.csv', text: MINT, source_account: 'Visa Card' })
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.equal(r.json.import.added, 3, 'only the Visa Card rows')

    const tx = byDescription((await c.call('GET', `/api/transactions?account=${card.id}`)).json.items)
    const cafe = tx['SQ *CORNER CAFE 1']
    assert.deepEqual([cafe.amount_cents, cafe.payee, cafe.category, cafe.category_by, cafe.note, cafe.tags], [-1250, 'Corner Cafe', 'groceries', 'bank', 'With Sam', ['Work lunch']])
    assert.equal(tx['ODD SHOP 22'].category_by === 'bank', false, 'Uncategorized is sorted by Cheddar')
    assert.deepEqual([tx['NETFLIX.COM'].category, tx['NETFLIX.COM'].category_by], ['entertainment', 'rule'])

    // Moving one by hand still works as ever.
    const moved = await c.call('POST', `/api/transactions/${cafe.id}/category`, { category: 'dining' })
    assert.equal(moved.status, 200, JSON.stringify(moved.json))
    assert.equal(moved.json.transaction.category, 'dining')
  })

  test('the record API keeps bank_category only as an import\'s built-in category', async () => {
    const { c, id: owner } = await ready()
    const a = (await c.call('POST', '/api/accounts', { name: 'Cash', kind: 'checking' })).json.account
    const make = body => fetch(`${PB}/api/collections/transactions/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...asPb(c) },
      body: JSON.stringify({ owner, account: a.id, posted: today, amount_cents: -500, description: 'COFFEE PLACE', external_id: `x-${Math.random()}`, ...body }),
    }).then(r => r.json())
    const manual = await make({ source: 'manual', bank_category: 'cheddar:taxes' })
    assert.equal(manual.bank_category, '', JSON.stringify(manual))
    assert.notEqual(manual.category, 'taxes')
    const odd = await make({ source: 'import', bank_category: 'cheddar:not a category' })
    assert.equal(odd.bank_category, '')
    const plaid = await make({ source: 'import', bank_category: 'TAX_PAYMENT' })
    assert.equal(plaid.bank_category, '', 'a Plaid code is the sync\'s alone')
  })
})
