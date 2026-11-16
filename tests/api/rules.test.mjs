// Settings → Rules, end to end through Nuxt against a real PocketBase with
// its hooks: rules a person writes sort, rename and leave out what they
// match, as it arrives and (when asked) what's already there; learned
// merchant rules can be changed and forgotten; and nobody else can see or
// touch anyone's rules.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asPb, PB, ready, signedIn } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const us = ymd => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`

const CSV = 'Date,Description,Amount\n'
  + `${us(today)},NETFLIX.COM 866-579-7172,-15.49\n`
  + `${us(today)},SQ *BLUE-BOTTLE #12,-6.00\n`
  + `${us(today)},SQ *BLUE-BOTTLE #14,-42.00\n`
  + `${us(today)},VENMO PAYMENT 1234,-20.00\n`
  + `${us(today)},PAYROLL ACME,2500.00\n`

async function account(c, name = 'Everyday') {
  const r = await c.call('POST', '/api/accounts', { name, kind: 'checking' })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.account
}

async function imported(c, accountId, text = CSV, filename = 'statement.csv') {
  const r = await c.call('POST', '/api/imports', { account: accountId, filename, text })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return byDescription((await c.call('GET', `/api/transactions?account=${accountId}`)).json.items)
}

const byDescription = items => Object.fromEntries(items.map(t => [t.description, t]))
const rows = async (c, accountId) => byDescription((await c.call('GET', `/api/transactions?account=${accountId}`)).json.items)
const rule = (fields = {}) => ({ text: '', min_cents: null, max_cents: null, account: '', category: '', rename: '', exclude: false, ...fields })

describe('rules', () => {
  test('sort, rename and leave out what they match, applied to past transactions when asked', async () => {
    const { c } = await ready()
    const acct = await account(c)
    await imported(c, acct.id)

    // Small Blue Bottle charges are coffee, renamed; the big one stays as it was.
    const coffee = await c.call('POST', '/api/rules', { ...rule({ text: 'blue bottle', max_cents: 1000, category: 'dining', rename: 'Blue Bottle' }), apply: true })
    assert.equal(coffee.status, 201, JSON.stringify(coffee.json))
    assert.equal(coffee.json.applied, 1)
    // Venmo payments in this account are left out, from now on only.
    const venmo = await c.call('POST', '/api/rules', { ...rule({ text: 'venmo', account: acct.id, exclude: true }), apply: false })
    assert.equal(venmo.status, 201, JSON.stringify(venmo.json))
    assert.equal(venmo.json.applied, 0)

    let now = await rows(c, acct.id)
    assert.deepEqual([now['SQ *BLUE-BOTTLE #12'].payee, now['SQ *BLUE-BOTTLE #12'].category, now['SQ *BLUE-BOTTLE #12'].category_by], ['Blue Bottle', 'dining', 'rule'])
    assert.equal(now['SQ *BLUE-BOTTLE #14'].payee, '')
    assert.equal(now['VENMO PAYMENT 1234'].excluded, false, 'not applied to past ones')

    // A new statement: the rules apply as it arrives.
    const later = await imported(c, acct.id, `Date,Description,Amount\n${us(today)},SQ *BLUE-BOTTLE #3,-4.50\n${us(today)},VENMO PAYMENT 99,-30.00\n`, 'later.csv')
    assert.deepEqual([later['SQ *BLUE-BOTTLE #3'].payee, later['SQ *BLUE-BOTTLE #3'].category], ['Blue Bottle', 'dining'])
    assert.equal(later['VENMO PAYMENT 99'].excluded, true)

    // Listed, oldest first.
    const listed = (await c.call('GET', '/api/rules')).json
    assert.deepEqual(listed.rules.map(r => [r.text, r.max_cents, r.category, r.rename, r.exclude]), [['blue bottle', 1000, 'dining', 'Blue Bottle', false], ['venmo', null, '', '', true]])

    // Changing the rule's category sorts again what it sorted.
    const changed = await c.call('PATCH', `/api/rules/${coffee.json.rule.id}`, rule({ text: 'blue bottle', max_cents: 1000, category: 'groceries' }))
    assert.equal(changed.status, 200, JSON.stringify(changed.json))
    now = await rows(c, acct.id)
    assert.equal(now['SQ *BLUE-BOTTLE #12'].category, 'groceries')
    assert.equal(now['SQ *BLUE-BOTTLE #3'].category, 'groceries')

    // A category picked by hand stays, whatever the rule says.
    await c.call('POST', `/api/transactions/${now['SQ *BLUE-BOTTLE #3'].id}/category`, { category: 'travel' })

    // Deleting it: sorted again without it, names kept. Moving #3 by hand
    // taught Blue Bottle's merchant rule, which now sorts the rest.
    const gone = await c.call('POST', `/api/rules/${coffee.json.rule.id}/remove`)
    assert.equal(gone.status, 200, JSON.stringify(gone.json))
    now = await rows(c, acct.id)
    assert.deepEqual([now['SQ *BLUE-BOTTLE #12'].category, now['SQ *BLUE-BOTTLE #12'].payee], ['travel', 'Blue Bottle'])
    assert.deepEqual([now['SQ *BLUE-BOTTLE #3'].category, now['SQ *BLUE-BOTTLE #3'].category_by], ['travel', 'person'])
    assert.equal((await c.call('GET', '/api/rules')).json.rules.length, 1)
  })

  test('a rule\'s category beats a learned merchant rule', async () => {
    const { c } = await ready()
    const acct = await account(c)
    const tx = await imported(c, acct.id)
    await c.call('POST', `/api/transactions/${tx['NETFLIX.COM 866-579-7172'].id}/category`, { category: 'utilities' })
    await c.call('POST', '/api/rules', { ...rule({ text: 'netflix', category: 'entertainment' }), apply: true })
    await imported(c, acct.id, `Date,Description,Amount\n${us(today)},NETFLIX.COM 866-579-7172,-17.99\n`, 'later.csv')
    const fresh = (await c.call('GET', `/api/transactions?account=${acct.id}`)).json.items.find(t => t.amount_cents === -1799)
    assert.deepEqual([fresh.category, fresh.category_by], ['entertainment', 'rule'])
  })

  test('learned merchant rules can be changed and forgotten', async () => {
    const { c } = await ready()
    const acct = await account(c)
    const tx = await imported(c, acct.id)
    await c.call('POST', `/api/transactions/${tx['SQ *BLUE-BOTTLE #12'].id}/category`, { category: 'groceries' })
    const { merchant } = (await c.call('GET', '/api/rules')).json
    assert.deepEqual(merchant.map(m => [m.merchant, m.category]), [['blue bottle', 'groceries']])

    const moved = await c.call('PATCH', `/api/merchant-rules/${merchant[0].id}`, { category: 'dining' })
    assert.equal(moved.status, 200, JSON.stringify(moved.json))
    assert.equal(moved.json.moved, 1)
    let now = await rows(c, acct.id)
    assert.deepEqual([now['SQ *BLUE-BOTTLE #14'].category, now['SQ *BLUE-BOTTLE #14'].category_by], ['dining', 'rule'])
    assert.equal(now['SQ *BLUE-BOTTLE #12'].category, 'groceries', 'the one moved by hand stays')
    assert.equal((await c.call('PATCH', `/api/merchant-rules/${merchant[0].id}`, { category: 'yachts' })).status, 400)

    const forgot = await c.call('POST', `/api/merchant-rules/${merchant[0].id}/remove`)
    assert.equal(forgot.status, 200, JSON.stringify(forgot.json))
    now = await rows(c, acct.id)
    assert.notEqual(now['SQ *BLUE-BOTTLE #14'].category_by, 'rule')
    assert.equal((await c.call('GET', '/api/rules')).json.merchant.length, 0)
  })

  test('refuses a rule that matches nothing, does nothing, or names what isn\'t yours', async () => {
    const { c } = await ready()
    const other = await ready()
    const theirs = await account(other.c, 'Theirs')
    const custom = (await other.c.call('POST', '/api/categories', { name: 'Hobbies' })).json.category
    for (const [body, why] of [
      [rule({ category: 'dining' }), 'no condition'],
      [rule({ text: 'shop' }), 'no action'],
      [rule({ text: 'shop', category: 'yachts' }), 'not a category'],
      [rule({ text: 'shop', category: custom.id }), 'someone else\'s category'],
      [rule({ account: theirs.id, exclude: true }), 'someone else\'s account'],
      [rule({ text: 'shop', min_cents: 500, max_cents: 100, exclude: true }), 'min over max'],
      [rule({ text: 'shop', min_cents: -1, exclude: true }), 'a negative amount'],
      [rule({ text: '!!!', exclude: true }), 'no letters or digits'],
      [rule({ text: 'x'.repeat(61), exclude: true }), 'too long'],
    ]) {
      const r = await c.call('POST', '/api/rules', body)
      assert.equal(r.status, 400, `${why}: ${JSON.stringify(r.json)}`)
    }
    assert.equal((await c.call('GET', '/api/rules')).json.rules.length, 0)
  })

  test('are each person\'s alone, and only through the hooks', async () => {
    const owner = await ready()
    const acct = await account(owner.c)
    const tx = await imported(owner.c, acct.id)
    const mine = (await owner.c.call('POST', '/api/rules', rule({ text: 'netflix', category: 'entertainment' }))).json.rule
    await owner.c.call('POST', `/api/transactions/${tx['PAYROLL ACME'].id}/category`, { category: 'other' })
    const learned = (await owner.c.call('GET', '/api/rules')).json.merchant[0]

    const other = await ready()
    assert.deepEqual((await other.c.call('GET', '/api/rules')).json, { rules: [], merchant: [] })
    assert.equal((await other.c.call('PATCH', `/api/rules/${mine.id}`, rule({ text: 'x', exclude: true }))).status, 404)
    assert.equal((await other.c.call('POST', `/api/rules/${mine.id}/remove`)).status, 404)
    assert.equal((await other.c.call('PATCH', `/api/merchant-rules/${learned.id}`, { category: 'dining' })).status, 404)
    assert.equal((await other.c.call('POST', `/api/merchant-rules/${learned.id}/remove`)).status, 404)
    // Their rules never touch my transactions.
    await other.c.call('POST', '/api/rules', { ...rule({ text: 'netflix', exclude: true }), apply: true })
    assert.equal((await rows(owner.c, acct.id))['NETFLIX.COM 866-579-7172'].excluded, false)

    for (const name of ['transaction_rules', 'category_rules']) {
      const direct = await fetch(`${PB}/api/collections/${name}/records`, { headers: { ...asPb(owner.c) } })
      assert.equal(direct.status, 403, name)
    }
    const passwordOnly = await signedIn()
    assert.equal((await passwordOnly.c.call('GET', '/api/rules')).status, 403)
    assert.equal((await owner.c.call('GET', '/api/rules')).json.rules.length, 1)
  })
})
