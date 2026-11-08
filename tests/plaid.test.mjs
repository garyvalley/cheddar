// Unit tests for pb_hooks/lib/plaid.js: Plaid's requests and answers, and
// turning them into Cheddar's accounts and transactions.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const plaid = loadHookModule('pb_hooks/lib/plaid.js')
const env = vars => k => vars[k] ?? ''
const KEY = 'k'.repeat(32)

describe('config', () => {
  test('is on only with the bank-link key and both Plaid keys', () => {
    assert.equal(plaid.isEnabled(plaid.config(env({}))), false)
    assert.equal(plaid.isEnabled(plaid.config(env({ BANK_LINK_KEY: KEY, PLAID_CLIENT_ID: 'id' }))), false)
    assert.equal(plaid.isEnabled(plaid.config(env({ BANK_LINK_KEY: 'short', PLAID_CLIENT_ID: 'id', PLAID_SECRET: 's' }))), false)
    assert.equal(plaid.isEnabled(plaid.config(env({ BANK_LINK_KEY: KEY, PLAID_CLIENT_ID: 'id', PLAID_SECRET: 's' }))), true)
  })

  test('talks to Sandbox unless told Production, and to a stand-in only when given one', () => {
    assert.equal(plaid.config(env({})).base, 'https://sandbox.plaid.com')
    assert.equal(plaid.config(env({ PLAID_ENV: 'Production' })).base, 'https://production.plaid.com')
    assert.equal(plaid.config(env({ PLAID_ENV: 'nonsense' })).base, 'https://sandbox.plaid.com')
    assert.equal(plaid.config(env({ PLAID_API_URL: 'http://mock:8097/' })).base, 'http://mock:8097')
  })
})

describe('requests', () => {
  test('carry the keys in the JSON body', () => {
    const r = plaid.request(plaid.config(env({ PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'sec' })), '/accounts/get', { access_token: 'access-sandbox-x' })
    assert.equal(r.method, 'POST')
    assert.equal(r.url, 'https://sandbox.plaid.com/accounts/get')
    assert.deepEqual(JSON.parse(r.body), { client_id: 'id', secret: 'sec', access_token: 'access-sandbox-x' })
  })

  test('a new link asks for transactions; signing in again names the link\'s token instead', () => {
    const fresh = plaid.linkTokenBody('u1')
    assert.deepEqual(fresh.products, ['transactions'])
    assert.equal(fresh.user.client_user_id, 'u1')
    assert.equal(fresh.access_token, undefined)
    const again = plaid.linkTokenBody('u1', 'access-sandbox-x')
    assert.equal(again.access_token, 'access-sandbox-x')
    assert.equal(again.products, undefined)
  })
})

describe('failure', () => {
  test('a bank that needs signing in again asks for that', () => {
    assert.equal(plaid.failure(400, { error_code: 'ITEM_LOGIN_REQUIRED', display_message: 'x' }).status, 'reconnect')
    assert.equal(plaid.failure(400, { error_code: 'ITEM_NOT_FOUND' }).status, 'reconnect')
  })

  test('anything else is worth retrying, in words a person can read', () => {
    const f = plaid.failure(500, { error_code: 'INSTITUTION_DOWN', display_message: 'The bank is\nnot answering.' })
    assert.deepEqual([f.status, f.message], ['error', 'The bank is not answering.'])
    assert.equal(plaid.failure(0, null).status, 'error')
    assert.match(plaid.failure(400, { error_code: 'INVALID_API_KEYS' }).message, /PLAID_CLIENT_ID/)
    assert.match(plaid.failure(502, 'not json').message, /status 502/)
  })
})

describe('toCents', () => {
  test('reads numbers and decimal strings exactly', () => {
    const cases = [[0, 0], [12, 1200], [-12.3, -1230], [1234.56, 123456], [1.005, 101], [0.1 + 0.2, 30], ['19.995', 2000], [1e-7, 0], [-0, 0]]
    for (const [v, want] of cases) assert.equal(plaid.toCents(v), want, String(v))
  })

  test('is null for what isn\'t a number', () => {
    for (const v of [null, undefined, '', 'abc', Number.NaN, Infinity]) assert.equal(plaid.toCents(v), null, String(v))
  })
})

describe('kindOf', () => {
  test('maps Plaid\'s types and subtypes', () => {
    assert.equal(plaid.kindOf('depository', 'checking'), 'checking')
    assert.equal(plaid.kindOf('depository', 'savings'), 'savings')
    assert.equal(plaid.kindOf('depository', 'money market'), 'savings')
    assert.equal(plaid.kindOf('credit', 'credit card'), 'credit_card')
    assert.equal(plaid.kindOf('loan', 'mortgage'), 'loan')
    assert.equal(plaid.kindOf('investment', '401k'), 'retirement')
    assert.equal(plaid.kindOf('investment', 'roth'), 'retirement')
    assert.equal(plaid.kindOf('investment', 'brokerage'), 'brokerage')
    assert.equal(plaid.kindOf('other', 'other'), 'other')
  })
})

describe('accountRows', () => {
  test('makes liabilities negative, keeps the mask, and names the bank', () => {
    const rows = plaid.accountRows({
      accounts: [
        { account_id: 'A', name: 'Plaid Checking', mask: '0000', type: 'depository', subtype: 'checking', balances: { current: 110.5, available: 100, iso_currency_code: 'USD' } },
        { account_id: 'B', name: 'Plaid Credit Card', mask: '3333', type: 'credit', subtype: 'credit card', balances: { current: 410, iso_currency_code: 'USD' } },
        { account_id: 'C', name: 'Pending', type: 'depository', subtype: 'savings', balances: { current: null, available: null } },
        { name: 'no id' },
      ],
    }, 'First Platypus Bank', '2026-11-08')
    assert.deepEqual(rows.map(r => [r.external_id, r.kind, r.last4, r.balance_cents, r.institution, r.balance_date]), [
      ['plaid:A', 'checking', '0000', 11050, 'First Platypus Bank', '2026-11-08'],
      ['plaid:B', 'credit_card', '3333', -41000, 'First Platypus Bank', '2026-11-08'],
      ['plaid:C', 'savings', '', null, 'First Platypus Bank', '2026-11-08'],
    ])
  })
})

describe('syncPage', () => {
  test('turns money out negative and removed ids into Cheddar\'s ids', () => {
    const p = plaid.syncPage({
      added: [
        { transaction_id: 't1', account_id: 'A', amount: 6.33, date: '2026-11-01', name: 'Uber 072515 SF**POOL**', merchant_name: 'Uber', pending: false },
        { transaction_id: 't2', account_id: 'A', amount: -500, date: '2026-11-02', name: 'Payroll', pending: false },
        { transaction_id: 't3', account_id: 'A', amount: 'x', date: '2026-11-02' },
        { transaction_id: 't4', account_id: 'A', amount: 1, date: null, authorized_date: '2026-11-03', name: 'Pending', pending: true },
      ],
      modified: [{ transaction_id: 't5', account_id: 'B', amount: 0, date: '2026-11-04', name: 'Fee reversal' }],
      removed: [{ transaction_id: 't0' }, {}],
      next_cursor: 'c2',
      has_more: true,
    })
    assert.deepEqual(p.added.map(t => [t.external_id, t.account, t.amount_cents, t.posted, t.payee, t.pending]), [
      ['plaid:t1', 'plaid:A', -633, '2026-11-01', 'Uber', false],
      ['plaid:t2', 'plaid:A', 50000, '2026-11-02', '', false],
      ['plaid:t4', 'plaid:A', -100, '2026-11-03', '', true],
    ])
    assert.equal(p.modified[0].amount_cents, 0)
    assert.deepEqual(p.removed, ['plaid:t0'])
    assert.deepEqual([p.cursor, p.more], ['c2', true])
  })

  test('takes nothing from a malformed answer', () => {
    assert.deepEqual(plaid.syncPage(null), { added: [], modified: [], removed: [], cursor: '', more: false })
  })
})
