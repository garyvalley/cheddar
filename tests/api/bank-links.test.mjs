// Linking banks through SimpleFIN, end to end through nginx and Nuxt against
// a real PocketBase and a stand-in SimpleFIN server (simplefin-mock.mjs).
//
// Needs what auth.test.mjs needs, plus PocketBase started with BANK_LINK_KEY
// set and SIMPLEFIN_ALLOWED_ORIGINS including SIMPLEFIN_MOCK_ORIGIN, the
// address PocketBase reaches the stand-in at (tests/README.md). Skipped
// without SIMPLEFIN_MOCK_ORIGIN.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { client, PB, ready, signedIn, superuser } from './helpers.mjs'
import { sampleAccounts, startMock } from './simplefin-mock.mjs'

const MOCK = process.env.SIMPLEFIN_MOCK_ORIGIN
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

/** Lets the next sync through at once: the routes answer the last result for 10 minutes. */
async function allowSync(linkId) {
  const r = await pb('PATCH', `/api/collections/bank_links/records/${linkId}`, await superuser(), { last_attempt: '2000-01-01 00:00:00.000Z' })
  assert.equal(r.status, 200)
}

const transactions = async (c, accountId) =>
  (await pb('GET', `/api/collections/transactions/records?perPage=200&sort=posted&filter=${encodeURIComponent(`account='${accountId}'`)}`, c.token)).json.items

describe('bank links', { skip: !MOCK && 'SIMPLEFIN_MOCK_ORIGIN is not set' }, () => {
  before(async () => { mock = await startMock({ origin: MOCK }) })

  after(() => mock?.close())

  test('need a session with two-step sign-in on', async () => {
    assert.equal((await client().call('GET', '/api/bank-links')).status, 401)
    const c = await person({ passwordOnly: true })
    assert.equal((await c.call('GET', '/api/bank-links')).status, 403)
    assert.equal((await c.call('POST', '/api/bank-links', { setup_token: mock.token().token })).status, 403)
  })

  test('a setup token links its accounts and syncs balances and transactions', async () => {
    const c = await person()
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json, { enabled: true, links: [] })

    const { token, state } = mock.token()
    const r = await c.call('POST', '/api/bank-links', { setup_token: token })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.sync, { ok: true, added: 4, updated: 0, removed: 0 })
    assert.deepEqual(r.json.link.institutions, ['Mock Bank'])
    assert.equal(r.json.link.status, 'ok')
    assert.ok(!JSON.stringify(r.json).includes('@'), 'the access URL stays in PocketBase')
    // The first sync reaches 90 days back, with pending transactions.
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].pending, '1')
    assert.ok(Math.abs(Number(state.requests[0]['start-date']) - (Date.now() / 1000 - 90 * 86400)) < 120)

    const accounts = (await pb('GET', '/api/collections/accounts/records?sort=name', c.token)).json.items
    assert.deepEqual(accounts.map(a => [a.name, a.kind, a.last4, a.institution, a.balance_cents, a.source]), [
      ['Everyday Checking ...4821', 'checking', '4821', 'Mock Bank', 245017, 'sync'],
      ['Rewards Visa', 'credit_card', '', 'Mock Bank', -31055, 'sync'],
    ])
    const rows = await transactions(c, accounts[0].id)
    assert.deepEqual(rows.map(t => [t.amount_cents, t.pending, t.source]), [[320000, false, 'sync'], [-180000, false, 'sync'], [-4210, true, 'sync']])

    // A token works once; a second try says it may have been taken.
    const again = await c.call('POST', '/api/bank-links', { setup_token: token })
    assert.equal(again.status, 400)
    assert.match(again.json.message, /already used/)

    const list = (await c.call('GET', '/api/bank-links')).json
    assert.equal(list.links.length, 1)
    assert.equal(list.links[0].accounts.length, 2)
  })

  test('a later sync adds what\'s new, updates what changed and drops a pending charge that posted under a new id', async () => {
    const c = await person()
    const accounts = sampleAccounts()
    const { token, state } = mock.token(accounts)
    const { json: { link } } = await c.call('POST', '/api/bank-links', { setup_token: token })

    // Right after a sync, another answers the last one without asking SimpleFIN.
    const soon = await c.call('POST', `/api/bank-links/${link.id}/sync`)
    assert.equal(soon.json.sync.recent, true)
    assert.equal(state.requests.length, 1)

    const checking = accounts[0]
    checking.balance = '2407.07'
    checking.transactions = checking.transactions.filter(t => t.id !== 't-pend')
    checking.transactions.push({ id: 't-posted', posted: checking.transactions[0].posted + 19 * 86400, amount: '-43.10', description: 'GROCER' })
    checking.transactions[1].description = 'RENT NOVEMBER'
    await allowSync(link.id)
    const r = await c.call('POST', `/api/bank-links/${link.id}/sync`)
    assert.deepEqual(r.json.sync, { ok: true, added: 1, updated: 1, removed: 1 })
    // The window now starts 10 days before the last sync.
    assert.ok(Math.abs(Number(state.requests[1]['start-date']) - (Date.now() / 1000 - 10 * 86400)) < 120)

    const account = (await pb('GET', `/api/collections/accounts/records?filter=${encodeURIComponent('last4=\'4821\'')}`, c.token)).json.items[0]
    assert.equal(account.balance_cents, 240707)
    const rows = await transactions(c, account.id)
    assert.deepEqual(rows.map(t => [t.description, t.amount_cents, t.pending]),
      [['PAYROLL ACME', 320000, false], ['RENT NOVEMBER', -180000, false], ['GROCER', -4310, false]])
  })

  test('SimpleFIN refusing the access marks the link to be made again', async () => {
    const c = await person()
    const { token, state } = mock.token()
    const { json: { link } } = await c.call('POST', '/api/bank-links', { setup_token: token })
    state.status = 403
    await allowSync(link.id)
    const r = await c.call('POST', `/api/bank-links/${link.id}/sync`)
    assert.equal(r.status, 200)
    assert.equal(r.json.sync.ok, false)
    assert.equal(r.json.link.status, 'reconnect')
    assert.match(r.json.link.message, /Link the bank again/)
  })

  test('a token pointing anywhere but an allowed SimpleFIN server is refused before any request', async () => {
    const c = await person()
    for (const url of ['https://evil.example/claim/x', 'http://127.0.0.1:8090/api/health']) {
      const r = await c.call('POST', '/api/bank-links', { setup_token: Buffer.from(url).toString('base64') })
      assert.equal(r.status, 400)
      assert.match(r.json.message, /doesn't use/)
    }
    assert.equal((await c.call('POST', '/api/bank-links', { setup_token: 'not a token' })).status, 400)
  })

  test('one person\'s link and accounts are hidden from another, and the record API can\'t reach a link', async () => {
    const owner = await person()
    const { json: { link } } = await owner.call('POST', '/api/bank-links', { setup_token: mock.token().token })
    const other = await person()

    assert.deepEqual((await other.call('GET', '/api/bank-links')).json.links, [])
    assert.equal((await other.call('POST', `/api/bank-links/${link.id}/sync`)).status, 404)
    assert.equal((await other.call('POST', `/api/bank-links/${link.id}/remove`)).status, 404)
    assert.equal((await pb('GET', '/api/collections/accounts/records', other.token)).json.items.length, 0)

    // Not even the owner reads a link, or its access, through the record API.
    assert.equal((await pb('GET', `/api/collections/bank_links/records/${link.id}`, owner.token)).status, 403)
    assert.equal((await pb('GET', '/api/collections/bank_links/records', owner.token)).status, 403)
    assert.equal((await pb('PATCH', `/api/collections/bank_links/records/${link.id}`, owner.token, { status: 'ok' })).status, 403)
    const su = await pb('GET', `/api/collections/bank_links/records/${link.id}`, await superuser())
    // A superuser sees the field, but only as ciphertext.
    assert.ok(su.json.access.length > 40)
    assert.ok(!su.json.access.includes(MOCK.split('://')[1]), 'stored encrypted')
  })

  test('the record API can\'t point an account at a link', async () => {
    const owner = await person()
    const { json: { link } } = await owner.call('POST', '/api/bank-links', { setup_token: mock.token().token })
    const other = await person()
    const me = (await other.call('GET', '/api/auth/me')).json.me
    const created = await pb('POST', '/api/collections/accounts/records', other.token, { owner: me.id, name: 'Mine', kind: 'checking', link: link.id })
    assert.equal(created.status, 200, JSON.stringify(created.json))
    assert.equal(created.json.link, '')
    const changed = await pb('PATCH', `/api/collections/accounts/records/${created.json.id}`, other.token, { link: link.id })
    assert.equal(changed.json.link, '')
  })

  test('removing a link keeps its accounts and transactions, no longer syncing', async () => {
    const c = await person()
    const { json: { link } } = await c.call('POST', '/api/bank-links', { setup_token: mock.token().token })
    assert.equal((await c.call('POST', `/api/bank-links/${link.id}/remove`)).status, 204)
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json.links, [])
    const accounts = (await pb('GET', '/api/collections/accounts/records', c.token)).json.items
    assert.equal(accounts.length, 2)
    assert.ok(accounts.every(a => a.link === ''))
    assert.equal((await transactions(c, accounts.find(a => a.last4 === '4821').id)).length, 3)
  })
})
