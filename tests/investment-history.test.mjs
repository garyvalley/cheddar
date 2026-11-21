// Investments over time (shared/investment-history.ts): months and quarters,
// value and gain per period, holdings worked back from activity, and options
// followed from opening to cash.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isOption, optionContracts, periodsBack, timeline } from '../shared/investment-history.ts'

const act = (date, kind, ticker, quantity, amount_cents, extra = {}) => ({
  id: `${date}-${kind}-${ticker}-${quantity}`, account: 'ira', date, kind, name: '', security: ticker, ticker, quantity, price_cents: null, amount_cents, fees_cents: null, security_type: '', ...extra,
})
const opt = (date, kind, quantity, amount_cents, ticker = 'AAPL  261218C00200000') => act(date, kind, ticker, quantity, amount_cents, { security_type: 'derivative', security: 'AAPL Dec 18 2026 200 Call' })
const pos = (ticker, quantity, value_cents, type = 'equity') => ({ account: 'ira', name: ticker, ticker, type, quantity, value_cents })

describe('periods', () => {
  test('months end on their last day, and the one running now ends today', () => {
    const p = periodsBack('2026-03-10', 'month', 3)
    assert.deepEqual(p.map(x => [x.id, x.label, x.from, x.to]), [
      ['2026-01', 'Jan 2026', '2026-01-01', '2026-01-31'],
      ['2026-02', 'Feb 2026', '2026-02-01', '2026-02-28'],
      ['2026-03', 'Mar 2026', '2026-03-01', '2026-03-10'],
    ])
  })

  test('quarters reach back across a year', () => {
    const p = periodsBack('2026-02-05', 'quarter', 3)
    assert.deepEqual(p.map(x => [x.id, x.short, x.from, x.to]), [
      ['2025-Q3', 'Q3', '2025-07-01', '2025-09-30'],
      ['2025-Q4', 'Q4', '2025-10-01', '2025-12-31'],
      ['2026-Q1', 'Q1', '2026-01-01', '2026-02-05'],
    ])
  })
})

describe('options', () => {
  test('an option is the bank\'s "derivative", or an option symbol', () => {
    assert.equal(isOption({ type: 'derivative' }), true)
    assert.equal(isOption({ ticker: 'AAPL261218C00200000' }), true)
    assert.equal(isOption({ ticker: 'AAPL  261218P00200000' }), true)
    assert.equal(isOption({ ticker: 'AAPL', type: 'equity' }), false)
  })

  test('each contract ends in cash: sold, expired, assigned, or still open and worth something', () => {
    const rows = [
      // Bought a call for $300, sold it for $500: +$200.
      opt('2026-01-05', 'buy', 1, -30000), opt('2026-02-10', 'sell', 1, 50000),
      // Wrote a put for $150 that expired: +$150, whatever sign the bank gave the expiry.
      opt('2026-03-01', 'sell', -1, 15000, 'XYZ   260417P00050000'), opt('2026-04-17', 'expire', 1, 0, 'XYZ   260417P00050000'),
      // Bought a call for $400 that's open, worth $250 now: −$150 so far.
      opt('2026-10-01', 'buy', 2, -40000, 'MSFT  261218C00500000'),
      // Sold one it held before Cheddar's records: no result.
      opt('2026-05-01', 'sell', -1, 9000, 'OLD   260601C00010000'),
    ]
    const now = [pos('MSFT  261218C00500000', 2, 25000, 'derivative'), pos('VTI', 10, 300000, 'etf')]
    const c = optionContracts(rows, now)
    const by = Object.fromEntries(c.map(x => [x.ticker.split(' ')[0], [x.status, x.cash_cents, x.result_cents]]))
    assert.deepEqual(by, {
      AAPL: ['closed', 20000, 20000],
      XYZ: ['expired', 15000, 15000],
      MSFT: ['open', -40000, -15000],
      OLD: ['closed', 9000, null],
    })
    assert.equal(c[0].status, 'open')
  })
})

describe('timeline', () => {
  const periods = periodsBack('2026-03-20', 'month', 3)

  test('each month\'s value, change, money moved in and the market\'s part', () => {
    const t = timeline({
      periods,
      balances: [
        { account: 'ira', date: '2025-12-31', balance_cents: 1000000 },
        { account: 'ira', date: '2026-01-31', balance_cents: 1150000 },
        { account: 'ira', date: '2026-02-28', balance_cents: 1100000 },
      ],
      now: new Map([['ira', 1200000]]),
      covered: new Set(),
      current: [],
      history: [],
      activity: [
        act('2026-01-15', 'deposit', '', 0, 100000),
        act('2026-02-03', 'dividend', 'VTI', 0, 2500),
        act('2026-03-02', 'withdrawal', '', 0, -50000),
      ],
      transfers: [],
    })
    assert.deepEqual(t.map(p => [p.id, p.value_cents, p.change_cents, p.moved_in_cents, p.gain_cents, p.income_cents]), [
      ['2026-01', 1150000, 150000, 100000, 50000, 0],
      ['2026-02', 1100000, -50000, 0, -50000, 2500],
      ['2026-03', 1200000, 100000, -50000, 150000, 0],
    ])
  })

  test('an account first seen this month isn\'t growth', () => {
    const t = timeline({
      periods,
      balances: [{ account: 'ira', date: '2026-01-31', balance_cents: 500000 }, { account: 'new', date: '2026-02-20', balance_cents: 900000 }],
      now: new Map([['ira', 500000], ['new', 900000]]),
      covered: new Set(),
      current: [],
      history: [],
      activity: [],
      transfers: [{ account: 'new', posted: '2026-02-20', amount_cents: 900000 }],
    })
    assert.deepEqual(t.map(p => [p.value_cents, p.change_cents, p.gain_cents]), [[500000, null, null], [1400000, 0, 0], [1400000, 0, 0]])
  })

  test('shares are worked back from what\'s held now; values only where Cheddar kept them', () => {
    const t = timeline({
      periods,
      balances: [],
      now: new Map([['ira', 760000]]),
      covered: new Set(['ira']),
      current: [pos('VTI', 20, 600000, 'etf'), pos('BND', 20, 160000, 'fixed income'), { ...pos('CUR:USD', 0, 0), type: 'cash' }],
      // Kept at February's end only.
      history: [
        { account: 'ira', date: '2026-02-27', security: 'vti', name: 'VTI', ticker: 'VTI', type: 'etf', quantity: 15, value_cents: 430000 },
        { account: 'ira', date: '2026-02-27', security: 'bnd', name: 'BND', ticker: 'BND', type: 'fixed income', quantity: 25, value_cents: 200000 },
      ],
      activity: [
        act('2026-01-10', 'buy', 'VTI', 5, -140000),
        act('2026-02-10', 'buy', 'VTI', 5, -142000),
        // Some banks give a sale's shares as a positive number.
        act('2026-03-05', 'sell', 'BND', 5, 40000),
        act('2026-03-06', 'buy', 'VTI', 5, -145000),
      ],
      transfers: [],
    })
    const shares = p => Object.fromEntries(p.holdings.map(h => [h.ticker, [h.quantity, h.quantity_change, h.value_cents]]))
    // January: worked back (VTI 20 − 5 − 5 = 10, BND 20 + 5 = 25), no values.
    assert.deepEqual(shares(t[0]), { VTI: [10, null, null], BND: [25, null, null] })
    assert.equal(t[0].valued, false)
    // February: kept that day.
    assert.deepEqual(shares(t[1]), { VTI: [15, 5, 430000], BND: [25, 0, 200000] })
    assert.equal(t[1].valued, true)
    // March, running now: today's positions, with their change in value.
    assert.deepEqual(t[2].holdings.map(h => [h.ticker, h.quantity, h.quantity_change, h.value_cents, h.value_change_cents]), [
      ['VTI', 20, 5, 600000, 170000], ['BND', 20, -5, 160000, -40000],
    ])
    assert.deepEqual([t[2].bought_cents, t[2].sold_cents, t[0].bought_cents], [145000, 40000, 140000])
  })

  test('a holding sold out shows once, as gone, then drops off', () => {
    const t = timeline({
      periods,
      balances: [],
      now: new Map(),
      covered: new Set(['ira']),
      current: [pos('VTI', 10, 300000, 'etf')],
      history: [],
      activity: [act('2026-02-10', 'sell', 'ARKK', -30, 120000)],
      transfers: [],
    })
    assert.deepEqual(t.map(p => p.holdings.map(h => [h.ticker, h.quantity, h.quantity_change])), [
      [['ARKK', 30, null], ['VTI', 10, null]],
      [['ARKK', 0, -30], ['VTI', 10, 0]],
      [['VTI', 10, 0]],
    ])
  })

  test('options\' cash and endings count in their period, apart from buys and sales', () => {
    const t = timeline({
      periods,
      balances: [],
      now: new Map(),
      covered: new Set(['ira']),
      current: [pos('VTI', 10, 300000, 'etf')],
      history: [],
      activity: [opt('2026-01-05', 'buy', 1, -30000), opt('2026-02-10', 'sell', -1, 50000), act('2026-02-11', 'buy', 'VTI', 1, -30000)],
      transfers: [],
    })
    assert.deepEqual(t.map(p => [p.options_cents, p.options_ended, p.bought_cents]), [[-30000, 0, 0], [50000, 1, 30000], [0, 0, 0]])
    assert.equal(t[0].holdings.find(h => h.option)?.quantity, 1)
  })
})
