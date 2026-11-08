// Unit tests for pb_hooks/lib/simplefin.js: reading SimpleFIN setup tokens
// and answers, and turning them into Cheddar's accounts and transactions.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { loadHookModule } from './load-hook-module.mjs'

const sf = loadHookModule('pb_hooks/lib/simplefin.js')
const cfg = sf.config(() => '')
const b64 = s => Buffer.from(s).toString('base64')

describe('config', () => {
  test('is off without a 32-character key, and defaults to SimpleFIN Bridge', () => {
    assert.equal(sf.isEnabled(cfg), false)
    assert.deepEqual(cfg.origins, sf.DEFAULT_ORIGINS)
    assert.equal(sf.isEnabled(sf.config(k => (k === 'BANK_LINK_KEY' ? 'x'.repeat(31) : ''))), false)
    assert.equal(sf.isEnabled(sf.config(k => (k === 'BANK_LINK_KEY' ? 'x'.repeat(32) : ''))), true)
  })

  test('reads allowed origins, trimmed and lower-cased', () => {
    const c = sf.config(k => (k === 'SIMPLEFIN_ALLOWED_ORIGINS' ? ' HTTP://Mock:8097/ , https://b.example ' : ''))
    assert.deepEqual(c.origins, ['http://mock:8097', 'https://b.example'])
  })
})

describe('base64', () => {
  test('decodes standard, URL-safe and unpadded input like Node', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'https://bridge.simplefin.org/simplefin/claim/demo', 'ÿþ>?']) {
      const std = Buffer.from(s, 'latin1').toString('base64')
      assert.equal(sf.base64Decode(std), s || null)
      assert.equal(sf.base64Decode(Buffer.from(s, 'latin1').toString('base64url')), s || null)
    }
  })

  test('refuses what isn\'t base64', () => {
    assert.equal(sf.base64Decode('not base64!'), null)
    assert.equal(sf.base64Decode('A'), null)
  })

  test('encodes like Node', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'user:p@ss word']) assert.equal(sf.base64Encode(s), Buffer.from(s, 'latin1').toString('base64'))
  })
})

describe('claimUrl', () => {
  test('takes SimpleFIN\'s demo token', () => {
    const demo = 'aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw==' // gitleaks:allow -- SimpleFIN's published demo token
    assert.deepEqual(sf.claimUrl(demo, cfg), { url: 'https://bridge.simplefin.org/simplefin/claim/demo' })
    assert.deepEqual(sf.claimUrl(`  ${demo}\n`, cfg), { url: 'https://bridge.simplefin.org/simplefin/claim/demo' })
  })

  test('refuses a token that points anywhere else, so it can\'t aim PocketBase at another address', () => {
    for (const url of [
      'https://evil.example/claim/x',
      'http://beta-bridge.simplefin.org/claim/x',
      'https://beta-bridge.simplefin.org.evil.example/claim/x',
      'https://user:pass@beta-bridge.simplefin.org/claim/x',
      'https://beta-bridge.simplefin.org@evil.example/x',
      'https://127.0.0.1/claim',
      'file:///etc/passwd',
    ]) assert.ok(sf.claimUrl(b64(url), cfg).problem, url)
    assert.ok(sf.claimUrl('garbage!!', cfg).problem)
  })
})

describe('accessFromClaim', () => {
  test('takes an access URL on an allowed origin', () => {
    const access = 'https://ab12:cd34@beta-bridge.simplefin.org/simplefin'
    assert.deepEqual(sf.accessFromClaim(200, `${access}\n`, cfg), { access })
  })

  test('says a spent token may be compromised, and refuses other answers', () => {
    assert.match(sf.accessFromClaim(403, '', cfg).problem, /already used/)
    assert.ok(sf.accessFromClaim(500, '', cfg).problem)
    assert.ok(sf.accessFromClaim(200, 'https://ab:cd@evil.example/simplefin', cfg).problem)
    assert.ok(sf.accessFromClaim(200, 'https://beta-bridge.simplefin.org/simplefin', cfg).problem, 'no credentials')
  })
})

describe('accountsRequest', () => {
  test('moves the credentials into a Basic header and asks for pending transactions', () => {
    const r = sf.accountsRequest('https://ab12:cd%2F34@beta-bridge.simplefin.org/simplefin', 1700000000.7)
    assert.equal(r.method, 'GET')
    assert.equal(r.url, 'https://beta-bridge.simplefin.org/simplefin/accounts?version=2&pending=1&start-date=1700000000')
    assert.equal(r.headers.Authorization, `Basic ${b64('ab12:cd/34')}`)
  })
})

describe('windowStart', () => {
  const now = Date.UTC(2026, 10, 8)
  test('reaches 90 days back the first time, then the last sync less 10 days', () => {
    assert.equal(sf.windowStart(0, now), now / 1000 - 90 * 86400)
    assert.equal(sf.windowStart(now - 86400000, now), now / 1000 - 11 * 86400)
    assert.equal(sf.windowStart(now - 200 * 86400000, now), now / 1000 - 90 * 86400)
  })
})

describe('toCents', () => {
  test('reads decimal strings exactly', () => {
    const cases = [['0', 0], ['12', 1200], ['-12.3', -1230], ['1234.56', 123456], ['+0.01', 1], ['.5', 50],
      ['-0.00', 0], ['19.995', 2000], ['-19.994', -1999], ['  7.10 ', 710], [3.5, 350], ['100000000.01', 10000000001]]
    for (const [v, want] of cases) assert.equal(sf.toCents(v), want, String(v))
  })

  test('is null for what isn\'t a number', () => {
    for (const v of ['', '-', '.', 'abc', '1,000.00', '1e3', null, undefined]) assert.equal(sf.toCents(v), null, String(v))
  })
})

describe('guessKind and last4', () => {
  test('guesses from the name', () => {
    assert.equal(sf.guessKind('Chase Sapphire Preferred'), 'credit_card')
    assert.equal(sf.guessKind('TOTAL CHECKING ...1234'), 'checking')
    assert.equal(sf.guessKind('High Yield Savings'), 'savings')
    assert.equal(sf.guessKind('Roth IRA'), 'retirement')
    assert.equal(sf.guessKind('Individual Brokerage'), 'brokerage')
    assert.equal(sf.guessKind('Home Mortgage'), 'loan')
    assert.equal(sf.guessKind('Something'), 'other')
  })

  test('takes the last four digits a name ends with', () => {
    assert.equal(sf.last4('TOTAL CHECKING ...1234'), '1234')
    assert.equal(sf.last4('Card (5678)'), '5678')
    assert.equal(sf.last4('Savings'), '')
  })
})

describe('parseAccountSet', () => {
  const day = s => Date.parse(`${s}T12:00:00Z`) / 1000

  test('reads protocol 2: connections, errlist, balances and transactions', () => {
    const set = sf.parseAccountSet({
      errlist: [{ code: 'con.auth', msg: 'Sign in again\nat the bank', conn_id: 'c1' }],
      connections: [{ conn_id: 'c1', name: 'My Bank', org_id: 'o1', sfin_url: 'https://x' }],
      accounts: [{
        id: 'A1', name: 'Checking 1234', conn_id: 'c1', currency: 'USD', balance: '100.23', 'balance-date': day('2026-11-07'),
        transactions: [
          { id: 'T1', posted: day('2026-11-01'), amount: '-12.50', description: 'COFFEE', payee: 'Cafe' },
          { id: 'T2', posted: 0, transacted_at: day('2026-11-06'), amount: '-3.00', description: 'PENDING', pending: true },
          { id: 'T3', posted: 0, amount: '-1.00', description: 'no date' },
          { id: 'T4', posted: day('2026-11-02'), amount: 'n/a', description: 'no amount' },
        ],
      }, { name: 'no id' }],
    })
    assert.deepEqual(set.errors, ['Sign in again at the bank'])
    assert.equal(set.accounts.length, 1)
    const [a] = set.accounts
    assert.equal(a.external_id, 'sfin:A1')
    assert.equal(a.institution, 'My Bank')
    assert.equal(a.kind, 'checking')
    assert.equal(a.last4, '1234')
    assert.equal(a.balance_cents, 10023)
    assert.equal(a.balance_date, '2026-11-07')
    assert.deepEqual(a.transactions, [
      { external_id: 'sfin:T1', posted: '2026-11-01', amount_cents: -1250, description: 'COFFEE', payee: 'Cafe', pending: false },
      { external_id: 'sfin:T2', posted: '2026-11-06', amount_cents: -300, description: 'PENDING', payee: '', pending: true },
    ])
  })

  test('reads protocol 1: org and errors', () => {
    const set = sf.parseAccountSet({
      errors: ['Connection to Bank B may need attention'],
      accounts: [{ id: 'B', name: 'Visa', org: { name: 'Bank B', domain: 'b.example' }, currency: 'https://x/points', balance: '-40', 'balance-date': 0 }],
    })
    assert.deepEqual(set.errors, ['Connection to Bank B may need attention'])
    assert.equal(set.accounts[0].institution, 'Bank B')
    assert.equal(set.accounts[0].currency, 'USD')
    assert.equal(set.accounts[0].balance_cents, -4000)
    assert.equal(set.accounts[0].balance_date, '')
    assert.deepEqual(set.accounts[0].transactions, [])
  })

  test('takes nothing from a malformed answer', () => {
    for (const v of [null, 'x', 42, { accounts: 'x' }]) assert.deepEqual(sf.parseAccountSet(v), { errors: [], accounts: [] })
  })
})

describe('accountsFailure', () => {
  test('403 means link again; anything else is worth retrying', () => {
    assert.equal(sf.accountsFailure(403).status, 'reconnect')
    assert.equal(sf.accountsFailure(402).status, 'error')
    assert.equal(sf.accountsFailure(0).status, 'error')
  })
})
