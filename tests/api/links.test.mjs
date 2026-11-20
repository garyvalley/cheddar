// Matching transfers and refunds (shared/links.ts, pb_hooks/links.pb.js),
// end to end through Nuxt against a real PocketBase with its hooks: money
// moved between two of a person's accounts is a transfer on both sides, a
// refund follows its purchase's category, the person can say a match is
// wrong, deleting one side frees the other, and the record API can't write
// a match.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PB, asPb, ready } from './helpers.mjs'

const today = new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

async function account(c, name, kind = 'checking') {
  const a = await c.call('POST', '/api/accounts', { name, kind })
  assert.equal(a.status, 201, JSON.stringify(a.json))
  return a.json.account
}
async function add(c, acct, posted, amount, description) {
  const direction = amount.startsWith('-') ? 'out' : 'in'
  const r = await c.call('POST', '/api/transactions', { account: acct.id, posted, amount: amount.replace('-', ''), direction, description })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  return r.json.transaction
}
const byId = async (c, id) => (await c.call('GET', '/api/transactions')).json.items.find(t => t.id === id)

describe('links', () => {
  test('a transfer between two of the person\'s accounts', async () => {
    const { c } = await ready()
    const checking = await account(c, 'Everyday')
    const savings = await account(c, 'Rainy day', 'savings')
    const out = await add(c, checking, daysAgo(3), '-500.00', 'ONLINE TRANSFER')
    const into = await add(c, savings, daysAgo(1), '500.00', 'DEPOSIT FROM CHECKING')

    const a = await byId(c, out.id)
    const b = await byId(c, into.id)
    assert.equal(a.category, 'transfer')
    assert.equal(a.category_by, 'link')
    assert.deepEqual(a.link, { kind: 'transfer', other: { posted: daysAgo(1), account: savings.id } })
    assert.equal(b.category, 'transfer')
    assert.deepEqual(b.link, { kind: 'transfer', other: { posted: daysAgo(3), account: checking.id } })

    // Not a match after all: both are on their own, and stay so.
    const off = await c.call('POST', `/api/transactions/${into.id}/unlink`, {})
    assert.equal(off.status, 200, JSON.stringify(off.json))
    assert.equal(off.json.unlinked, true)
    for (const id of [out.id, into.id]) {
      const t = await byId(c, id)
      assert.equal(t.link, null)
      assert.notEqual(t.category_by, 'link')
    }
    // Another of the same amount still finds no partner in the unlinked pair.
    const again = await add(c, checking, today, '-500.00', 'ONLINE TRANSFER')
    assert.equal((await byId(c, again.id)).link, null)
  })

  test('a refund follows its purchase, and deleting one side frees the other', async () => {
    const { c } = await ready()
    const card = await account(c, 'Card', 'credit_card')
    const buy = await add(c, card, daysAgo(20), '-80.00', 'GARDEN SUPPLY CO')
    const back = await add(c, card, daysAgo(2), '30.00', 'GARDEN SUPPLY CO')

    const p = await byId(c, buy.id)
    const r = await byId(c, back.id)
    assert.equal(r.link.kind, 'refund')
    assert.equal(r.category, p.category, 'into the purchase\'s category')
    assert.notEqual(r.category, 'income')
    assert.equal(p.link.kind, 'refund')

    // The purchase moved by hand: its refund follows.
    const moved = await c.call('POST', `/api/transactions/${buy.id}/category`, { category: 'health' })
    assert.equal(moved.status, 200, JSON.stringify(moved.json))
    assert.equal((await byId(c, back.id)).category, 'health')

    assert.equal((await c.call('DELETE', `/api/transactions/${buy.id}`)).status, 204)
    const alone = await byId(c, back.id)
    assert.equal(alone.link, null)
    assert.notEqual(alone.category_by, 'link')
  })

  test('an imported statement\'s rows are matched as they\'re written, within the file too', async () => {
    const { c } = await ready()
    const checking = await account(c, 'Everyday')
    const card = await account(c, 'Card', 'credit_card')
    const out = await add(c, checking, daysAgo(5), '-250.00', 'CARD PAYMENT')
    const csv = 'Date,Description,Amount\n'
      + `${daysAgo(4)},PAYMENT RECEIVED,250.00\n`
      + `${daysAgo(30)},GARDEN SUPPLY CO,-80.00\n`
      + `${daysAgo(10)},GARDEN SUPPLY CO,30.00\n`
    const r = await c.call('POST', '/api/imports', { account: card.id, filename: 'card.csv', text: csv })
    assert.equal(r.status, 201, JSON.stringify(r.json))
    const rows = (await c.call('GET', `/api/transactions?account=${card.id}`)).json.items
    const paid = rows.find(t => t.amount_cents === 25000)
    assert.deepEqual(paid.link, { kind: 'transfer', other: { posted: daysAgo(5), account: checking.id } })
    assert.equal(paid.category, 'transfer')
    assert.equal((await byId(c, out.id)).link.kind, 'transfer', 'linked back')
    const buy = rows.find(t => t.amount_cents === -8000)
    const back = rows.find(t => t.amount_cents === 3000)
    assert.equal(back.link.kind, 'refund')
    assert.equal(back.category, buy.category)
    assert.equal(buy.link.kind, 'refund')
  })

  test('the record API can\'t write a match, and only the owner unlinks', async () => {
    const { c } = await ready()
    const { c: stranger } = await ready()
    const checking = await account(c, 'Everyday')
    const savings = await account(c, 'Rainy day', 'savings')
    const one = await add(c, checking, today, '-12.00', 'COFFEE')
    const two = await add(c, savings, today, '40.00', 'INTEREST')
    const r = await fetch(`${PB}/api/collections/transactions/records/${one.id}`, {
      method: 'PATCH', headers: { ...asPb(c), 'content-type': 'application/json' },
      body: JSON.stringify({ link: two.id, link_kind: 'transfer', link_off: true }),
    })
    assert.equal(r.status, 200, await r.text())
    const t = await byId(c, one.id)
    assert.equal(t.link, null)
    assert.equal((await stranger.call('POST', `/api/transactions/${one.id}/unlink`, {})).status, 404)
  })
})
