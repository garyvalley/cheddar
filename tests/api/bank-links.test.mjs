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
import { client, PASSWORD, PB, ready, signedIn, superuser } from './helpers.mjs'
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

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
/** `n` days ago as a US bank's CSV writes it, 11/05/2026. */
const usDay = (n) => {
  const [y, m, d] = daysAgo(n).split('-')
  return `${m}/${d}/${y}`
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

  test('a person\'s links stop at PLAID_LINKS_PER_PERSON (10 by default), said before they open Plaid Link', async () => {
    const c = await person()
    // One real link, to sign in to again below; the other nine only need to be counted.
    const { link: real } = await link(c)
    const me = (await c.call('GET', '/api/auth/me')).json.me
    const su = await superuser()
    for (let i = 0; i < 9; i++) {
      const r = await pb('POST', '/api/collections/bank_links/records', su, { owner: me.id, provider: 'plaid', access: 'not-a-token', item_id: `cap-${i}`, status: 'ok' })
      assert.equal(r.status, 200, JSON.stringify(r.json))
    }
    const list = (await c.call('GET', '/api/bank-links')).json
    assert.equal(list.links.length, 10)
    assert.match(list.full, /as many linked banks as one person can have here \(10\)/)
    const t = await c.call('POST', '/api/bank-links/link-token', {})
    assert.equal(t.status, 400)
    assert.equal(t.json.message, list.full)
    const add = await c.call('POST', '/api/bank-links', { public_token: mock.publicToken().token })
    assert.equal(add.status, 400)
    // Signing in to one of them again is not a new link.
    const again = await c.call('POST', '/api/bank-links/link-token', { link: real.id })
    assert.equal(again.status, 200, JSON.stringify(again.json))
  })

  test('signing in to a bank links its accounts and syncs balances and every page of transactions', async () => {
    const c = await person()
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json, { enabled: true, links: [], full: null })

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

  test('a linked account\'s name, kind and bank are the person\'s, and one left out keeps syncing but counts nowhere', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    const checking = l.accounts.find(a => a.last4 === '0000')
    const r = await c.call('PATCH', `/api/accounts/${checking.id}`, { name: 'Joint', kind: 'savings', institution: 'Our bank', excluded: true })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    // A linked balance is the bank's: neither typed in nor turned round by a new kind.
    assert.equal(r.json.account.balance_cents, 245017)
    assert.equal((await c.call('PATCH', `/api/accounts/${checking.id}`, { balance: '1' })).status, 400)
    const counted = (await c.call('GET', '/api/overview')).json.net_worth.total_cents
    assert.equal(counted, -31055)

    bank.accounts[0].balances.current = 2000
    await allowSync(l.id)
    const synced = await c.call('POST', `/api/bank-links/${l.id}/sync`, {})
    const after = synced.json.link.accounts.find(a => a.id === checking.id)
    assert.deepEqual([after.name, after.kind, after.institution, after.excluded, after.balance_cents], ['Joint', 'savings', 'Our bank', true, 200000])
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, -31055)
    assert.equal((await c.call('GET', '/api/transactions')).json.items.every(t => t.account !== checking.id), true)

    assert.equal((await c.call('PATCH', `/api/accounts/${checking.id}`, { excluded: false })).status, 200)
    assert.equal((await c.call('GET', '/api/overview')).json.net_worth.total_cents, 200000 - 31055)
  })

  test('a person\'s name, note and leaving one out outlast the next sync; nothing is added by hand or deleted in a linked account', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    const account = (await pb('GET', `/api/collections/accounts/records?filter=${encodeURIComponent('last4=\'0000\'')}`, c.token)).json.items[0]
    const rent = (await transactions(c, account.id)).find(t => t.description === 'RENT')
    const r = await c.call('PATCH', `/api/transactions/${rent.id}`, { payee: 'Landlord', note: 'Split with Sam', excluded: true })
    assert.equal(r.status, 200, JSON.stringify(r.json))

    bank.events.push({ kind: 'modified', t: { ...bank.events[1].t, name: 'RENT NOVEMBER' } })
    await allowSync(l.id)
    assert.equal((await c.call('POST', `/api/bank-links/${l.id}/sync`, {})).json.sync.updated, 1)
    const after = (await transactions(c, account.id)).find(t => t.id === rent.id)
    assert.deepEqual([after.description, after.payee, after.note, after.excluded], ['RENT NOVEMBER', 'Landlord', 'Split with Sam', true])

    const add = await c.call('POST', '/api/transactions', { account: account.id, posted: daysAgo(1), amount: '5', direction: 'out', description: 'Cash' })
    assert.equal(add.status, 400)
    assert.match(add.json.message, /bank brings/)
    const del = await c.call('DELETE', `/api/transactions/${rent.id}`)
    assert.equal(del.status, 400)
    assert.match(del.json.message, /come back/)
  })

  test('a split outlasts the next sync, and a pending charge\'s split, name and note carry to it as it posts', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    const account = (await pb('GET', `/api/collections/accounts/records?filter=${encodeURIComponent('last4=\'0000\'')}`, c.token)).json.items[0]
    const rows = await transactions(c, account.id)
    const rent = rows.find(t => t.description === 'RENT')
    const grocer = rows.find(t => t.description === 'GROCER')
    assert.equal(grocer.pending, true)
    const half = [{ category: 'housing', amount: '900' }, { category: 'utilities', amount: '900' }]
    assert.equal((await c.call('PATCH', `/api/transactions/${rent.id}`, { splits: half })).status, 200)
    const r = await c.call('PATCH', `/api/transactions/${grocer.id}`, { note: 'Party', splits: [{ category: 'groceries', amount: '30' }, { category: 'gifts', amount: '12.10' }] })
    assert.equal(r.status, 200, JSON.stringify(r.json))

    // Rent's name changes; the grocer's charge posts with a tip on top.
    const pend = bank.events[2].t
    bank.events.push(
      { kind: 'modified', t: { ...bank.events[1].t, name: 'RENT NOVEMBER' } },
      { kind: 'removed', t: pend },
      { kind: 'added', t: { ...pend, transaction_id: `${pend.transaction_id}-posted`, pending_transaction_id: pend.transaction_id, amount: 45.1, pending: false } },
    )
    await allowSync(l.id)
    assert.deepEqual((await c.call('POST', `/api/bank-links/${l.id}/sync`, {})).json.sync, { ok: true, added: 1, updated: 1, removed: 1 })
    const after = await transactions(c, account.id)
    assert.deepEqual(after.find(t => t.id === rent.id).splits, [{ category: 'housing', amount_cents: -90000 }, { category: 'utilities', amount_cents: -90000 }])
    const posted = after.find(t => t.description === 'GROCER')
    assert.notEqual(posted.id, grocer.id)
    assert.deepEqual([posted.pending, posted.amount_cents, posted.note], [false, -4510, 'Party'])
    assert.deepEqual(posted.splits, [{ category: 'groceries', amount_cents: -3000 }, { category: 'gifts', amount_cents: -1210 }], 'kept, to fix: the tip is left over')
    const listed = (await c.call('GET', `/api/transactions?account=${account.id}`)).json.items.find(t => t.id === posted.id)
    assert.equal(listed.amount_cents - listed.splits.reduce((n, p) => n + p.amount_cents, 0), -300)
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

  test('a statement imported into a linked account adds older history and skips what the link already has', async () => {
    const c = await person()
    await link(c)
    const checking = (await c.call('GET', '/api/accounts')).json.accounts.find(a => a.last4 === '0000')
    assert.equal(checking.linked, true)

    // The bank's file dates the rent two days off Plaid's, and has the payroll on Plaid's day.
    const csv = 'Date,Description,Amount\n'
      + `${usDay(201)},OLD RENT,-1800.00\n`
      + `${usDay(200)},OLD PAYROLL,3200.00\n`
      + `${usDay(45)},RENT OCTOBER,-1800.00\n`
      + `${usDay(20)},ACME PAYROLL DIRECT DEP,3200.00\n`
      + `${usDay(13)},RENT PAYMENT,-1800.00\n`
    const r = await c.call('POST', '/api/imports', { account: checking.id, filename: 'history.csv', text: csv })
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.deepEqual([r.json.import.added, r.json.import.skipped], [3, 2])
    const rows = await transactions(c, checking.id)
    assert.deepEqual(rows.map(t => [t.description, t.source]), [
      ['OLD RENT', 'import'], ['OLD PAYROLL', 'import'], ['RENT OCTOBER', 'import'],
      ['PAYROLL ACME', 'sync'], ['RENT', 'sync'], ['GROCER', 'sync'],
    ])

    // The same file again adds nothing.
    const again = await c.call('POST', '/api/imports', { account: checking.id, filename: 'history.csv', text: csv })
    assert.deepEqual([again.json.import.added, again.json.import.skipped], [0, 5])
  })

  test('a sync takes over a transaction a statement brought in first, and undoing the import keeps it', async () => {
    const c = await person()
    const { link: l, bank } = await link(c)
    const checking = (await c.call('GET', '/api/accounts')).json.accounts.find(a => a.last4 === '0000')
    const csv = 'Date,Description,Amount\n'
      + `${usDay(3)},DINER #12,-25.00\n`
      + `${usDay(3)},DINER #12,-25.00\n`
    const imp = (await c.call('POST', '/api/imports', { account: checking.id, filename: 'recent.csv', text: csv })).json.import
    assert.equal(imp.added, 2)

    // Plaid learns of one of the two diners, a day later than the file says, and of a new charge.
    bank.events.push(
      { kind: 'added', t: { transaction_id: 't-diner', account_id: bank.accounts[0].account_id, amount: 25, date: daysAgo(2), name: 'DINER', merchant_name: 'Diner', pending: false } },
      { kind: 'added', t: { transaction_id: 't-books', account_id: bank.accounts[0].account_id, amount: 25, date: daysAgo(12), name: 'BOOKS', merchant_name: null, pending: false } },
    )
    await allowSync(l.id)
    const r = await c.call('POST', `/api/bank-links/${l.id}/sync`, {})
    assert.deepEqual(r.json.sync, { ok: true, added: 1, updated: 1, removed: 0 })
    const diners = async () => (await transactions(c, checking.id)).filter(t => t.amount_cents === -2500 && t.description !== 'BOOKS')
    assert.deepEqual((await diners()).map(t => [t.source, t.posted, t.import === '']).sort(), [['import', daysAgo(3), false], ['sync', daysAgo(2), true]])

    // Undo takes away the diner only the file had, and keeps the one the bank has too.
    assert.equal((await c.call('DELETE', `/api/imports/${imp.id}`)).status, 204)
    assert.deepEqual((await diners()).map(t => [t.source, t.description]), [['sync', 'DINER']])
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
    assert.equal(mock.removals(bank), 1, 'asked once')
    assert.deepEqual((await c.call('GET', '/api/bank-links')).json.links, [])
    const accounts = (await pb('GET', '/api/collections/accounts/records', c.token)).json.items
    assert.equal(accounts.length, 2)
    assert.ok(accounts.every(a => a.link === ''))
    assert.equal((await transactions(c, accounts.find(a => a.last4 === '0000').id)).length, 3)
  })

  test('deleting the Cheddar account tells Plaid to forget every link, once each', async () => {
    const c = await person()
    const one = await link(c)
    const two = await link(c)
    const other = await person()
    const kept = await link(other)

    assert.equal((await c.call('POST', '/api/auth/delete-account', { password: PASSWORD })).status, 204)
    assert.equal(mock.removals(one.bank), 1)
    assert.equal(mock.removals(two.bank), 1)
    assert.equal(mock.removals(kept.bank), 0, 'someone else\'s link is untouched')
    const su = await superuser()
    for (const l of [one.link, two.link]) {
      assert.equal((await pb('GET', `/api/collections/bank_links/records/${l.id}`, su)).status, 404)
    }
  })

  test('a superuser deleting someone in the admin UI tells Plaid too', async () => {
    const c = await person()
    const { bank } = await link(c)
    const me = (await c.call('GET', '/api/auth/me')).json.me
    assert.equal((await pb('DELETE', `/api/collections/users/records/${me.id}`, await superuser())).status, 204)
    assert.equal(mock.removals(bank), 1)
  })
})
