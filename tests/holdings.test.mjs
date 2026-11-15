// Holdings and allocation on Investments (shared/holdings.ts), and reading
// Plaid's /investments/holdings/get (pb_hooks/lib/plaid.js holdingRows).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { portfolio } from '../shared/holdings.ts'
import { loadHookModule } from './load-hook-module.mjs'

const plaid = loadHookModule('pb_hooks/lib/plaid.js')
const pos = (account, type, value_cents, over = {}) => ({ account, name: type, ticker: '', type, quantity: 1, price_cents: value_cents, value_cents, cost_basis_cents: null, price_as_of: '', as_of: '2026-11-15 10:00:00.000Z', ...over })

describe('portfolio', () => {
  test('allocates the positions by kind and names the accounts without any, with why', () => {
    const p = portfolio([
      { id: 'ira', balance_cents: 100000, owned: true, link: { id: 'l1', holdings: 'ok' } },
      { id: 'brk', balance_cents: 50000, owned: true, link: { id: 'l2', holdings: 'consent' } },
      { id: 'hand', balance_cents: 20000, owned: true, link: null },
      { id: 'theirs', balance_cents: 7000, owned: false, link: null },
      { id: 'new', balance_cents: 3000, owned: true, link: { id: 'l3', holdings: '' } },
      { id: 'nope', balance_cents: 1000, owned: true, link: { id: 'l4', holdings: 'unsupported' } },
    ], [pos('ira', 'etf', 60000), pos('ira', 'fixed income', 30000), pos('ira', 'cash', 10000, { as_of: '2026-11-15 11:00:00.000Z' })], true)
    assert.deepEqual(p.allocation.map(a => [a.label, a.value_cents, a.share]), [['ETFs', 60000, 0.6], ['Bonds', 30000, 0.3], ['Cash', 10000, 0.1]])
    assert.deepEqual([p.covered_cents, p.uncovered_cents], [100000, 81000])
    assert.deepEqual(Object.entries(p.accounts).map(([id, a]) => [id, a.gap]), [['ira', ''], ['brk', 'consent'], ['hand', 'manual'], ['theirs', 'shared'], ['new', 'pending'], ['nope', 'unsupported']])
    assert.equal(p.accounts.ira.as_of, '2026-11-15 11:00:00.000Z')
    assert.deepEqual(p.accounts.ira.positions.map(x => x.type), ['etf', 'fixed income', 'cash'])
    assert.equal(p.accounts.brk.link, 'l2')
  })

  test('says holdings are off on this Cheddar rather than missing, and a bank that reported none is empty', () => {
    const p = portfolio([{ id: 'a', balance_cents: 5, owned: true, link: { id: 'l', holdings: 'ok' } }], [], false)
    assert.equal(p.accounts.a.gap, 'off')
    assert.equal(portfolio([{ id: 'a', balance_cents: 5, owned: true, link: { id: 'l', holdings: 'ok' } }], [], true).accounts.a.gap, 'empty')
    assert.deepEqual(p.allocation, [])
  })
})

describe('Plaid holdings', () => {
  test('are read as positions with their security, in cents, cash marked as cash', () => {
    const rows = plaid.holdingRows({
      holdings: [
        { account_id: 'inv1', security_id: 's1', quantity: 10.5, institution_price: 412.33, institution_value: 4329.47, cost_basis: 3900, iso_currency_code: 'USD', institution_price_as_of: '2026-11-14' },
        { account_id: 'inv1', security_id: 's2', quantity: 120.03, institution_price: 1, institution_value: 120.03, cost_basis: null, iso_currency_code: 'USD' },
        { account_id: 'inv1', security_id: 's3', quantity: 1, institution_price: null, institution_value: null },
      ],
      securities: [
        { security_id: 's1', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI', type: 'etf' },
        { security_id: 's2', name: 'U S Dollar', ticker_symbol: 'CUR:USD', type: 'cash', is_cash_equivalent: true },
        { security_id: 's3', name: 'Mystery', type: 'weird' },
      ],
    })
    assert.deepEqual(rows, [
      { account: 'plaid:inv1', name: 'Vanguard Total Stock Market ETF', ticker: 'VTI', type: 'etf', quantity: 10.5, price_cents: 41233, value_cents: 432947, cost_basis_cents: 390000, currency: 'USD', price_as_of: '2026-11-14' },
      { account: 'plaid:inv1', name: 'U S Dollar', ticker: 'CUR:USD', type: 'cash', quantity: 120.03, price_cents: 100, value_cents: 12003, cost_basis_cents: null, currency: 'USD', price_as_of: '' },
    ])
  })

  test('a bank without them, or a link without consent, is a gap, not a failure', () => {
    assert.equal(plaid.holdingsGap('PRODUCTS_NOT_SUPPORTED'), 'unsupported')
    assert.equal(plaid.holdingsGap('ADDITIONAL_CONSENT_REQUIRED'), 'consent')
    assert.equal(plaid.holdingsGap('INTERNAL_SERVER_ERROR'), '')
  })

  test('link tokens ask for holdings only when they\'re on', () => {
    assert.equal(plaid.linkTokenBody('u', null, '', false).optional_products, undefined)
    assert.deepEqual(plaid.linkTokenBody('u', null, '', true).optional_products, ['investments'])
    assert.deepEqual(plaid.linkTokenBody('u', 'access-x', '', true).additional_consented_products, ['investments'])
    assert.equal(plaid.config(k => ({ PLAID_INVESTMENTS: 'TRUE' })[k]).investments, true)
    assert.equal(plaid.config(() => '').investments, false)
  })
})
