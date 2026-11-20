// Investments' past (issue #144): holding history and activity
// (shared/investing.ts, built for the hooks), and reading Plaid's
// /investments/transactions/get (pb_hooks/lib/plaid.js activityRows).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { activityFrom, dayRows, incomeBetween, positionChanges, securityKey } from '../shared/investing.ts'
import { loadHookModule } from './load-hook-module.mjs'

const plaid = loadHookModule('pb_hooks/lib/plaid.js')
const gen = loadHookModule('pb_hooks/lib/gen/investing.js')

describe('holding history', () => {
  test('a security is known by its ticker, else its name; cash by its type', () => {
    assert.equal(securityKey({ ticker: 'VTI', name: 'Vanguard Total' }), 'vti')
    assert.equal(securityKey({ ticker: '', name: ' Target Date 2050 ' }), 'target date 2050')
    assert.equal(securityKey({ ticker: 'CUR:USD', type: 'cash' }), 'cash')
    assert.equal(gen.securityKey({ ticker: 'VTI' }), 'vti')
  })

  test('two lots of one security make one day\'s row', () => {
    const rows = dayRows([
      { ticker: 'VTI', name: 'VTI', type: 'etf', quantity: 10, value_cents: 300000, price_cents: 30000 },
      { ticker: 'VTI', name: 'VTI', type: 'etf', quantity: 5, value_cents: 150000, price_cents: 30000 },
      { ticker: 'BND', name: 'BND', type: 'fixed income', quantity: 1, value_cents: 8000, price_cents: null },
      { ticker: '', name: '', type: 'other', quantity: 1, value_cents: 1 },
    ])
    assert.deepEqual(rows.map(r => [r.security, r.quantity, r.value_cents, r.price_cents]), [['vti', 15, 450000, 30000], ['bnd', 1, 8000, null]])
  })

  test('a position\'s change runs from its first day kept in the last 30, and needs a day before today', () => {
    const h = (date, security, value_cents) => ({ account: 'a', date, security, value_cents, quantity: 1 })
    const c = positionChanges([
      h('2026-10-01', 'vti', 1), // before the 30 days
      h('2026-10-25', 'vti', 100000), h('2026-11-10', 'vti', 105000), h('2026-11-19', 'vti', 110000),
      h('2026-11-19', 'new', 5000), // only today
    ], '2026-11-19')
    assert.deepEqual(c.get('a|vti'), { since: '2026-10-25', from_cents: 100000 })
    assert.equal(c.has('a|new'), false)
  })
})

describe('investment activity', () => {
  test('the first call reaches two years back, later ones a month before the newest kept', () => {
    assert.equal(activityFrom('', '2026-11-19'), '2024-11-19')
    assert.equal(activityFrom('2026-11-10', '2026-11-19'), '2026-10-11')
    assert.equal(activityFrom('2020-01-01', '2026-11-19'), '2024-11-19')
    assert.equal(activityFrom('2026-12-30', '2026-11-19'), '2026-11-19')
    assert.equal(gen.activityFrom('', '2026-11-19'), '2024-11-19')
  })

  test('Plaid\'s activity reads as cash into the account, by kind, without cancelled ones', () => {
    const rows = plaid.activityRows({
      securities: [{ security_id: 'vti', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI' }],
      investment_transactions: [
        { investment_transaction_id: 'b1', account_id: 'ira', security_id: 'vti', date: '2026-11-01', name: 'BUY VTI', quantity: 2, price: 300, amount: 600.5, fees: 0.5, type: 'buy', subtype: 'buy' },
        { investment_transaction_id: 'd1', account_id: 'ira', security_id: 'vti', date: '2026-11-02', name: 'VTI DIVIDEND', quantity: 0, amount: -12.34, type: 'cash', subtype: 'qualified dividend' },
        { investment_transaction_id: 's1', account_id: 'ira', security_id: 'vti', date: '2026-11-03', name: 'SELL VTI', quantity: -1, price: 310, amount: -310, type: 'sell', subtype: 'sell' },
        { investment_transaction_id: 'i1', account_id: 'ira', date: '2026-11-04', name: 'INTEREST', amount: -1.01, type: 'cash', subtype: 'interest' },
        { investment_transaction_id: 't1', account_id: 'ira', date: '2026-11-05', name: 'ACH IN', amount: -500, type: 'transfer', subtype: 'transfer' },
        { investment_transaction_id: 'f1', account_id: 'ira', date: '2026-11-06', name: 'FEE', amount: 2, type: 'fee', subtype: 'account fee' },
        { investment_transaction_id: 'x1', account_id: 'ira', date: '2026-11-07', name: 'BUY WRONG', amount: 50, type: 'buy', subtype: 'buy' },
        { investment_transaction_id: 'x2', account_id: 'ira', date: '2026-11-07', name: 'CANCEL', amount: -50, type: 'cancel', subtype: 'cancel', cancel_transaction_id: 'x1' },
        { investment_transaction_id: 'bad', account_id: 'ira', date: 'soon', amount: 1, type: 'buy' },
      ],
    })
    assert.deepEqual(rows.map(r => [r.id, r.kind, r.amount_cents]), [['b1', 'buy', -60050], ['d1', 'dividend', 1234], ['s1', 'sell', 31000], ['i1', 'interest', 101], ['t1', 'deposit', 50000], ['f1', 'fee', -200]])
    assert.deepEqual([rows[0].account, rows[0].ticker, rows[0].security, rows[0].quantity, rows[0].price_cents, rows[0].fees_cents], ['plaid:ira', 'VTI', 'Vanguard Total Stock Market ETF', 2, 30000, 50])
  })

  test('dividends and interest add up over a span; buys and sells aren\'t income', () => {
    const a = (date, kind, amount_cents) => ({ id: date + kind, account: 'a', date, kind, name: '', security: '', ticker: '', quantity: 0, price_cents: null, amount_cents, fees_cents: null })
    assert.equal(incomeBetween([a('2025-11-18', 'dividend', 999), a('2025-11-19', 'dividend', 100), a('2026-06-01', 'interest', 5), a('2026-06-01', 'sell', 100000)], '2025-11-19', '2026-11-19'), 105)
  })
})
