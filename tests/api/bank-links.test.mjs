// Linking banks through Plaid, end to end through nginx and Nuxt against a
// real PocketBase and a stand-in Plaid (plaid-mock.mjs). Plaid Link itself,
// where the person signs in to their bank, runs in Plaid's own frame; here
// the stand-in hands out the public_token Link would.
//
// Needs what auth.test.mjs needs, plus PocketBase started with BANK_LINK_KEY,
// PLAID_CLIENT_ID and PLAID_SECRET set to the stand-in's, and PLAID_API_URL
// pointing at it (tests/README.md). Skipped without PLAID_MOCK_PORT.

import { before, after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { client, PB, ready, signedIn, superuser } from './helpers.mjs'
import { sampleBank, startMock } from './plaid-mock.mjs'

let mock

/** A new account, signed in; with two-step sign-in on unless `passwordOnly`. Its `token` is the session's PocketBase token. */
async function person({ passwordOnly = false } = {}) {
  const { c } = passwordOnly ? await signedIn() : await ready()
  Object.defineProperty(c, 'token', { get: () => decodeURIComponent(c.cookie.slice('pb_token='.length)) })
  return c
}

/** PocketBase's record API as `token`, as anyone holding a session could call it. */
async function pb(method, path, token, body) {
  const r = await fetch(`${PB}${path}`, {
    method, headers: { authorization: token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

/** Links a bank for `c` the way the page does: a link token, then Link's public_token. */
async function link(c, bank = sampleBank()) {
  const t = await c.call('POST', '/api/bank-links/link-token', {})
  assert.equal(t.status, 200, JSON.stringify(t.json))
  assert.match(t.json.link_token, /^link-sandbox-/)
  const { token } = mock.publicToken(bank)
  const r = await c.call('POST', '/api/bank-links', { public_token: token, institution: 'From Link' })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return { ...r.json, bank }
}

/** Lets the next sync through at once: the routes answer the last result for two minutes. */
async function allowSync(linkId) {
  const r = await pb('PATCH', `/api/collections/bank_links/records/${linkId}`, await superuser(), { last_attempt: '2000-01-01 00:00:00.000Z' })
  assert.equal(r.status, 200)
}

const transactions = async (c, accountId) =>
  (await pb('GET', `/api/collections/transactions/records?perPage=200&sort=posted&filter=${encodeURIComponent(`account='${accountId}'`)}`, c.token)).json.items

describe('bank links', { skip: !process.env.PLAID_MOCK_PORT && 'PLAID_MOCK_PORT is not set' }, () => {
  before(async () => { mock = await startMock() })
  after(() => mock?.close())

  test('need a session with two-step sign-in on', async () => {
    assert.equal((await client().call('GET', '/api/bank-links')).status, 401)
    const c = await person({ passwordOnly: true })
    assert.equal((await c.call('GET', '/api/bank-links')).status, 403)
    assert.equal((await c.call('POST', '/api/bank-links/link-token', {})).status, 403)
    assert.equal((await c.call('POST', '/api/bank-links', { public_token: mock.publicToken().token })).status, 403)
  })

  test('signing in to a bank links its accounts and syncs balances and every page of transactions', async () => {
    const c = await person()
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json, { enabled: true, links: [] })

    const r = await link(c)
    assert.deepEqual(r.sync, { ok: true, added: 4, updated: 0, removed: 0 })
    assert.deepEqual(r.link.institutions, ['First Platypus Bank'], 'Plaid\'s name for the bank wins over the page\'s')
    assert.equal(r.link.status, 'ok')
    assert.ok(!JSON.stringify({ link: r.link, sync: r.sync }).includes('access-sandbox'), 'the access token stays in PocketBase')
    // Two pages of two, then the cursor is kept.
    assert.deepEqual(r.bank.calls.filter(x => x.path === '/transactions/sync').map(x => x.cursor), [null, '2'])

    const accounts = (await pb('GET', '/api/collections/accounts/records?sort=name', c.token)).json.items
    assert.deepEqual(accounts.map(a => [a.name, a.kind, a.last4, a.institution, a.balance_cents, a.source]), [
      ['Plaid Checking', 'checking', '0000', 'First Platypus Bank', 245017, 'sync'],
      ['Plaid Credit Card', 'credit_card', '3333', 'First Platypus Bank', -31055, 'sync'],
    ])
    const rows = await transactions(c, accounts[0].id)
    assert.deepEqual(rows.map(t => [t.amount_cents, t.pending, t.source]), [[320000, false, 'sync'], [-180000, false, 'sync'], [-4210, true, 'sync']])

    // A public_token works once.
    const used = await c.call('POST', '/api/bank-links', { public_token: 'public-sandbox-0123456789abcdef' })
    assert.equal(used.status, 400)

    const list = (await c.call('GET', '/api/bank-links')).json
    assert.equal(list.links.length, 1)
    assert.equal(list.links[0].accounts.length, 2)
  })

  test('a later sync carries on from the cursor: a pending charge that posts is replaced, a change is applied', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)

    // Right after a sync, another answers the last one without asking Plaid.
    const soon = await c.call('POST', `/api/bank-links/${l.id}/sync`, {})
    assert.equal(soon.json.sync.recent, true)

    const pend = bank.events[2].t
    const rent = bank.events[1].t
    bank.accounts[0].balances.current = 2407.07
    bank.events.push(
      { kind: 'removed', t: pend },
      { kind: 'added', t: { ...pend, transaction_id: `${pend.transaction_id}-posted`, amount: 43.1, pending: false } },
      { kind: 'modified', t: { ...rent, name: 'RENT NOVEMBER' } },
    )
    const calls = bank.calls.length
    await allowSync(l.id)
    const r = await c.call('POST', `/api/bank-links/${l.id}/sync`, {})
    assert.deepEqual(r.json.sync, { ok: true, added: 1, updated: 1, removed: 1 })
    assert.deepEqual(bank.calls.slice(calls).filter(x => x.path === '/transactions/sync').map(x => x.cursor), ['4', '6'])

    const account = (await pb('GET', `/api/collections/accounts/records?filter=${encodeURIComponent('last4=\'0000\'')}`, c.token)).json.items[0]
    assert.equal(account.balance_cents, 240707)
    // Overview's history keeps the day's last balance, once (pb_hooks/balances.pb.js).
    const days = (await pb('GET', `/api/collections/balance_history/records?filter=${encodeURIComponent(`account='${account.id}'`)}`, c.token)).json.items
    assert.deepEqual(days.map(d => [d.date, d.balance_cents]), [[account.balance_date, 240707]])
    assert.deepEqual((await transactions(c, account.id)).map(t => [t.description, t.amount_cents, t.pending]),
      [['PAYROLL ACME', 320000, false], ['RENT NOVEMBER', -180000, false], ['GROCER', -4310, false]])
  })

  test('synced transactions are sorted by Plaid\'s category, and a person\'s choice outlasts the next sync', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    const all = async () => Object.fromEntries((await pb('GET', '/api/collections/transactions/records?perPage=200&sort=posted', c.token)).json.items
      .map(t => [t.description, [t.category, t.category_by]]))
    assert.deepEqual(await all(), {
      'PAYROLL ACME': ['income', 'match'],
      'RENT': ['housing', 'match'],
      'GROCER': ['shopping', 'bank'], // Plaid's category wins over what the name says
      'CAFE': ['dining', 'bank'],
    })

    const cafe = (await pb('GET', `/api/collections/transactions/records?filter=${encodeURIComponent('description=\'CAFE\'')}`, c.token)).json.items[0]
    const rent = (await pb('GET', `/api/collections/transactions/records?filter=${encodeURIComponent('description=\'RENT\'')}`, c.token)).json.items[0]
    assert.equal((await c.call('POST', `/api/transactions/${cafe.id}/category`, { category: 'entertainment' })).status, 200)
    assert.equal((await c.call('POST', `/api/transactions/${rent.id}/category`, { category: 'utilities' })).status, 200)

    // Plaid changes the rent's amount, and the cafe charges again: Plaid's category for both loses to the person's.
    const card = bank.accounts[1].account_id
    bank.events.push(
      { kind: 'modified', t: { ...bank.events[1].t, amount: 1850 } },
      { kind: 'added', t: { ...bank.events[3].t, transaction_id: 't-cafe-again', account_id: card, name: 'CAFE AGAIN' } },
    )
    await allowSync(l.id)
    assert.equal((await c.call('POST', `/api/bank-links/${l.id}/sync`, {})).json.sync.ok, true)
    const now = await all()
    assert.deepEqual(now.RENT, ['utilities', 'person'])
    assert.deepEqual(now['CAFE AGAIN'], ['entertainment', 'rule'])
  })

  test('a bank that needs signing in again says so, and signing in again brings it back', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    bank.status = 'ITEM_LOGIN_REQUIRED'
    await allowSync(l.id)
    const r = await c.call('POST', `/api/bank-links/${l.id}/sync`, {})
    assert.equal(r.status, 200)
    assert.equal(r.json.sync.ok, false)
    assert.equal(r.json.link.status, 'reconnect')
    assert.match(r.json.link.message, /sign in again/)

    // Update mode: a link token for this link, Link run again, then a sync straight away.
    const t = await c.call('POST', '/api/bank-links/link-token', { link: l.id })
    assert.equal(t.status, 200)
    bank.status = null
    const back = await c.call('POST', `/api/bank-links/${l.id}/sync`, { reconnected: true })
    assert.equal(back.json.sync.ok, true)
    assert.equal(back.json.link.status, 'ok')
    assert.equal(back.json.link.message, '')
  })

  test('refuses what isn\'t a public_token before calling Plaid', async () => {
    const c = await person()
    for (const token of ['', 'access-sandbox-0123456789', 'public-sandbox-x;drop', 'not a token']) {
      assert.equal((await c.call('POST', '/api/bank-links', { public_token: token })).status, 400, token)
    }
  })

  test('one person\'s link and accounts are hidden from another, and the record API can\'t reach a link', async () => {
    const owner = await person()
    const { link: l } = await link(owner)
    const other = await person()

    assert.deepEqual((await other.call('GET', '/api/bank-links')).json.links, [])
    assert.equal((await other.call('POST', `/api/bank-links/${l.id}/sync`, {})).status, 404)
    assert.equal((await other.call('POST', `/api/bank-links/${l.id}/remove`)).status, 404)
    assert.equal((await other.call('POST', '/api/bank-links/link-token', { link: l.id })).status, 404)
    assert.equal((await pb('GET', '/api/collections/accounts/records', other.token)).json.items.length, 0)

    assert.equal((await pb('GET', `/api/collections/bank_links/records/${l.id}`, owner.token)).status, 403)
    assert.equal((await pb('GET', '/api/collections/bank_links/records', owner.token)).status, 403)
    assert.equal((await pb('PATCH', `/api/collections/bank_links/records/${l.id}`, owner.token, { status: 'ok' })).status, 403)
    // A superuser sees the field, but only as ciphertext.
    const su = await pb('GET', `/api/collections/bank_links/records/${l.id}`, await superuser())
    assert.ok(su.json.access.length > 40)
    assert.ok(!su.json.access.includes('access-sandbox'), 'stored encrypted')
  })

  test('the record API can\'t point an account at a link', async () => {
    const owner = await person()
    const { link: l } = await link(owner)
    const other = await person()
    const me = (await other.call('GET', '/api/auth/me')).json.me
    const created = await pb('POST', '/api/collections/accounts/records', other.token, { owner: me.id, name: 'Mine', kind: 'checking', link: l.id })
    assert.equal(created.status, 200, JSON.stringify(created.json))
    assert.equal(created.json.link, '')
    const changed = await pb('PATCH', `/api/collections/accounts/records/${created.json.id}`, other.token, { link: l.id })
    assert.equal(changed.json.link, '')
  })

  test('unlinking tells Plaid to forget the access, and keeps the accounts and transactions', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    assert.equal((await c.call('POST', `/api/bank-links/${l.id}/remove`)).status, 204)
    assert.equal(mock.removed(bank), true)
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json.links, [])
    const accounts = (await pb('GET', '/api/collections/accounts/records', c.token)).json.items
    assert.equal(accounts.length, 2)
    assert.ok(accounts.every(a => a.link === ''))
    assert.equal((await transactions(c, accounts.find(a => a.last4 === '0000').id)).length, 3)
  })
})
