// Alerts by email (shared/alerts.ts): settings as typed, which alerts each
// kind of data makes, sending each once, and the email.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alertEmail, anyOn, balanceAlerts, bankAlerts, billAlerts, budgetAlerts, chargeAlerts, checkAlertSettings,
  dayWords, due, money, weeklyAlert, NO_ALERTS,
} from '../shared/alerts.ts'
import { withCarry } from '../shared/budgets.ts'

describe('checkAlertSettings', () => {
  test('amounts as typed, blank is off, switches only when true', () => {
    assert.deepEqual(checkAlertSettings({ charge_over: '500', balance_under: '1,000.50', bills: true, budgets: 'yes', banks: true, weekly: false }), {
      ok: { charge_over_cents: 50000, balance_under_cents: 100050, bills: true, budgets: false, banks: true, weekly: false },
    })
    assert.deepEqual(checkAlertSettings({ charge_over: '', balance_under: null }), { ok: NO_ALERTS })
  })
  test('refuses what isn\'t an amount', () => {
    assert.ok('problem' in checkAlertSettings({ charge_over: 'lots' }))
    assert.ok('problem' in checkAlertSettings({ balance_under: '-5' }))
    assert.ok('problem' in checkAlertSettings({ charge_over: '20000000' }))
  })
  test('anyOn', () => {
    assert.equal(anyOn(NO_ALERTS), false)
    assert.equal(anyOn({ ...NO_ALERTS, weekly: true }), true)
  })
})

test('money and dayWords need no Intl', () => {
  assert.equal(money(123456789), '$1,234,567.89')
  assert.equal(money(-500), '-$5.00')
  assert.equal(dayWords('2026-11-20'), 'Fri, Nov 20')
})

test('chargeAlerts: money out of at least the amount', () => {
  const rows = [
    { id: 'a', posted: '2026-11-16', amount_cents: -60000, name: 'Best Buy', account_name: 'Card' },
    { id: 'b', posted: '2026-11-16', amount_cents: -49999, name: 'Grocer', account_name: 'Card' },
    { id: 'c', posted: '2026-11-16', amount_cents: 90000, name: 'Payroll', account_name: 'Checking' },
  ]
  assert.deepEqual(chargeAlerts(rows, 50000).map(a => [a.key, a.text]), [['charge:a', 'Best Buy: $600.00 from Card on Mon, Nov 16.']])
  assert.deepEqual(chargeAlerts(rows, 0), [])
})

test('balanceAlerts: open, counted checking and savings under the amount', () => {
  const a = over => ({ id: 'x', name: 'Everyday', kind: 'checking', balance_cents: 5000, excluded: false, closed_on: '', ...over })
  const found = balanceAlerts([a(), a({ id: 'card', kind: 'credit_card', balance_cents: -90000 }), a({ id: 'out', excluded: true }),
    a({ id: 'shut', closed_on: '2026-01-01' }), a({ id: 'none', balance_cents: null }), a({ id: 'rich', balance_cents: 900000 })], 20000, '2026-11-17')
  assert.deepEqual(found.map(f => f.key), ['balance:x'])
  assert.match(found[0].text, /Everyday is down to \$50\.00/)
})

test('billAlerts: money out in the next 3 days, soonest first', () => {
  const e = over => ({ id: 'i:2026-11-18', account: 'a', date: '2026-11-18', name: 'Rent', amount_cents: -190000, source: 'scheduled', running_cents: null, ...over })
  const found = billAlerts([e({ id: 'p:2026-11-19', date: '2026-11-19', name: 'Pay', amount_cents: 400000 }), e(), e({ id: 'n:2026-11-17', date: '2026-11-17', name: 'Netflix', amount_cents: -1549 }), e({ id: 'late', date: '2026-11-21' })],
    new Map([['a', 'Everyday']]), '2026-11-17')
  assert.deepEqual(found.map(f => f.text), ['Netflix: $15.49 today from Everyday.', 'Rent: $1,900.00 on Wed, Nov 18 from Everyday.'])
})

test('budgetAlerts once a month, bankAlerts by state', () => {
  assert.deepEqual(budgetAlerts([{ id: 'dining', label: 'Dining', spent_cents: 30000, budget_cents: 25000 }], '2026-11').map(a => a.key), ['budget:dining:2026-11'])
  const h = state => ({ id: 'l', name: 'Chase', state, message: '', last_synced: '', accounts: [] })
  assert.deepEqual(bankAlerts([h('ok')]), [])
  assert.match(bankAlerts([h('reconnect')])[0].text, /sign in to it again/)
  assert.equal(bankAlerts([h('stale')])[0].key, 'bank:l:stale')
})

test('weeklyAlert', () => {
  const a = weeklyAlert('2026-11-16', [
    { label: 'Groceries', spending: true, total_cents: 12000 }, { label: 'Dining', spending: true, total_cents: 8000 },
    { label: 'Gifts', spending: true, total_cents: 500 }, { label: 'Fees', spending: true, total_cents: 100 },
    { label: 'Income', spending: false, total_cents: 400000 },
  ], 400000)
  assert.equal(a.text, 'Last week: $206.00 spent (Groceries $120.00, Dining $80.00, Gifts $5.00), $4,000.00 came in.')
})

test('due: each key once, banks first', () => {
  const list = [{ key: 'w', kind: 'weekly', text: 'w' }, { key: 'b', kind: 'bank', text: 'b' }, { key: 'b', kind: 'bank', text: 'b' }, { key: 'c', kind: 'charge', text: 'c' }]
  assert.deepEqual(due(list, new Set(['c'])).map(a => a.key), ['b', 'w'])
})

test('alertEmail escapes and links to the alert settings', () => {
  const one = alertEmail([{ key: 'k', kind: 'charge', text: 'A&B <shop>: $5.00' }], 'https://cheddar.example/')
  assert.equal(one.subject, 'Cheddar: A&B <shop>: $5.00')
  assert.match(one.html, /A&amp;B &lt;shop&gt;/)
  assert.match(one.html, /https:\/\/cheddar\.example\/settings#alerts/)
  assert.equal(alertEmail([{ key: 'w', kind: 'weekly', text: 'x' }], '').subject, 'Your week in Cheddar')
  assert.equal(alertEmail([{ key: 'a', kind: 'bank', text: 'x' }, { key: 'b', kind: 'bill', text: 'y' }], '').subject, 'Cheddar: 2 things to know')
})

test('withCarry: what each rolling budget carries into the month', () => {
  const budgets = [
    { category: 'dining', amount_cents: 10000, rollover: true, rollover_from: '2026-09' },
    { category: 'groceries', amount_cents: 40000, rollover: false, rollover_from: '' },
  ]
  const rows = [
    { posted: '2026-09-10', amount_cents: -4000, category: 'dining' },
    { posted: '2026-10-10', amount_cents: -15000, category: 'dining' },
    { posted: '2026-11-02', amount_cents: -9999, category: 'dining' },
  ]
  const out = withCarry(budgets, rows, undefined, '2026-11')
  assert.deepEqual(out.map(b => b.carry_cents), [10000 - 4000 + 10000 - 15000, 0])
})
