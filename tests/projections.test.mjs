// Unit tests for Projections' sums (shared/projections.ts): the savings rate,
// each debt's pace and payoff, and the investments' growth to retirement.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { debtPlan, debts, invested, monthsAfter, paysInFull, payoff, project, savings } from '../shared/projections.ts'
import { checkAccountChange } from '../shared/accounts.ts'

const acct = (id, kind, balance_cents, balance_date = '2026-11-09') => ({ id, name: id, kind, balance_cents, balance_date })
const month = (m, income_cents, spent_cents) => ({ month: m, label: m, income_cents, spent_cents })

describe('savings', () => {
  test('averages the months that had any money in or out', () => {
    const s = savings([month('2026-05', 0, 0), month('2026-06', 500000, 300000), month('2026-07', 500000, 400000)])
    assert.deepEqual(s, { months_counted: 2, income_cents: 500000, spent_cents: 350000, kept_cents: 150000, rate: 0.3 })
  })

  test('is negative when spending is more, and has no rate without income', () => {
    assert.equal(savings([month('2026-06', 100000, 150000)]).rate, -0.5)
    assert.equal(savings([month('2026-06', 0, 150000)]).rate, null)
    assert.equal(savings([]).months_counted, 0)
  })
})

describe('debts', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

  test('are paced by payments less charges, from the first month the account has any', () => {
    const rows = [
      { account: 'visa', posted: '2026-09-03', amount_cents: 50000 },
      { account: 'visa', posted: '2026-09-10', amount_cents: -20000 },
      { account: 'visa', posted: '2026-10-03', amount_cents: 50000 },
      { account: 'visa', posted: '2026-11-01', amount_cents: 99999 }, // this month: not counted
      { account: 'chk', posted: '2026-10-03', amount_cents: -50000 },
    ]
    const [d] = debts([acct('visa', 'credit_card', -300000), acct('chk', 'checking', 100)], rows, [], months)
    assert.deepEqual(d, { id: 'visa', name: 'visa', kind: 'credit_card', owed_cents: 300000, paydown_cents: 40000, basis: 'transactions', pace_since: '2026-09', paid_in_full: false, paid_in_full_source: 'inferred' })
  })

  test('without transactions, are paced by balances at least four weeks apart', () => {
    const history = [
      { account: 'car', date: '2026-08-11', balance_cents: -1060000 },
      { account: 'car', date: '2026-11-01', balance_cents: -1010000 },
      { account: 'car', date: '2026-11-09', balance_cents: -1000000 },
    ]
    const [d] = debts([acct('car', 'loan', -1000000)], [], history, months)
    assert.equal(d.basis, 'balances')
    assert.equal(d.pace_since, '2026-08-11')
    assert.ok(Math.abs(d.paydown_cents - 20000) < 300, String(d.paydown_cents))
    assert.equal(debts([acct('car', 'loan', -1000000)], [], history.slice(1), months)[0].paydown_cents, null)
  })

  test('a loan is never paid in full; a card is when the person says so, or when its payments show it', () => {
    const rows = ['2026-08', '2026-09', '2026-10'].flatMap(m => [
      { account: 'visa', posted: `${m}-04`, amount_cents: -80000, description: 'GROCERIES' },
      { account: 'visa', posted: `${m}-20`, amount_cents: 80000, description: 'PAYMENT THANK YOU' },
    ])
    const [loan] = debts([acct('car', 'loan', -100000)], rows, [], months)
    assert.deepEqual([loan.paid_in_full, loan.paid_in_full_source], [null, null])
    const [seen] = debts([acct('visa', 'credit_card', -90000)], rows, [], months)
    assert.deepEqual([seen.paid_in_full, seen.paid_in_full_source], [true, 'inferred'])
    const [no] = debts([{ ...acct('visa', 'credit_card', -90000), paid_in_full: 'no' }], rows, [], months)
    assert.deepEqual([no.paid_in_full, no.paid_in_full_source], [false, 'entered'])
    const [yes] = debts([{ ...acct('visa', 'credit_card', -900000), paid_in_full: 'yes' }], [], [], months)
    assert.deepEqual([yes.paid_in_full, yes.paid_in_full_source], [true, 'entered'])
  })

  test('leave out what owes nothing, and come biggest first', () => {
    const list = debts([acct('a', 'credit_card', 0), acct('b', 'loan', -100), acct('c', 'loan', -900), acct('d', 'loan', null, '')], [], [], ['2026-10'])
    assert.deepEqual(list.map(d => d.id), ['c', 'b'])
  })
})

describe('paid in full each month', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  const monthly = (list, charge = -50000, payment = 50000) => list.flatMap(m => [
    { posted: `${m}-03`, amount_cents: charge, description: 'COFFEE' },
    { posted: `${m}-25`, amount_cents: payment, description: 'AUTOPAY' },
  ])

  test('when payments cover the charges and it owes about a statement', () => {
    assert.equal(paysInFull(60000, monthly(months), months), true)
    // Up to two months' charges: a statement waiting to be paid, and this month's.
    assert.equal(paysInFull(100000, monthly(months), months), true)
  })

  test('not when it carries a balance, pays less than it charges, or is charged interest', () => {
    assert.equal(paysInFull(400000, monthly(months), months), false)
    assert.equal(paysInFull(60000, monthly(months, -50000, 30000), months), false)
    const interest = [...monthly(months), { posted: '2026-10-28', amount_cents: -1200, description: 'INTEREST CHARGE ON PURCHASES' }]
    assert.equal(paysInFull(60000, interest, months), false)
  })

  test('needs a few months to tell, and a charge to go by', () => {
    assert.equal(paysInFull(60000, monthly(['2026-09', '2026-10']), months), false)
    assert.equal(paysInFull(60000, monthly(months, 0, 50000).filter(r => r.amount_cents), months), false)
    assert.equal(paysInFull(60000, [], months), false)
  })

  test('is only a card\'s, and leaves a card that stops being one', () => {
    const card = { name: 'Visa', kind: 'credit_card', institution: '', last4: '' }
    assert.deepEqual(checkAccountChange({ paid_in_full: 'yes' }, card, '2026-11-20'), { ok: { paid_in_full: 'yes' } })
    assert.deepEqual(checkAccountChange({ paid_in_full: '' }, card, '2026-11-20'), { ok: { paid_in_full: '' } })
    assert.match(checkAccountChange({ paid_in_full: true }, card, '2026-11-20').problem, /yes, no/)
    assert.match(checkAccountChange({ paid_in_full: 'yes' }, { ...card, kind: 'loan' }, '2026-11-20').problem, /credit card/)
    assert.equal(checkAccountChange({ kind: 'loan' }, card, '2026-11-20').ok.paid_in_full, '')
    assert.equal(checkAccountChange({ kind: 'credit_card' }, { ...card, kind: 'other' }, '2026-11-20').ok.paid_in_full, undefined)
  })
})

describe('a debt\'s plan', () => {
  const debt = (paydown_cents, owed_cents = 120000) => ({ id: 'v', name: 'Visa', kind: 'credit_card', owed_cents, paydown_cents, basis: paydown_cents === null ? null : 'transactions', pace_since: '', paid_in_full: false, paid_in_full_source: 'inferred' })
  const none = { payment_cents: null, apr: null }
  const today = '2026-11-15'

  test('uses the inferred pace and says so, leaving interest out when no APR is entered', () => {
    const p = debtPlan(debt(40000), none, today)
    assert.deepEqual([p.status, p.payment_cents, p.payment_source, p.apr, p.when, p.payoff.interest_cents], ['estimate', 40000, 'inferred', null, '2027-02', 0])
  })

  test('has nothing to pay off for a card paid in full each month, whatever was entered', () => {
    const p = debtPlan({ ...debt(-5000), paid_in_full: true }, { payment_cents: 20000, apr: 0.24 }, today)
    assert.deepEqual([p.status, p.payoff, p.when], ['in_full', null, ''])
  })

  test('an entered payment and APR win, and recalculate the date and the interest', () => {
    const p = debtPlan(debt(40000), { payment_cents: 20000, apr: 0.24 }, today)
    assert.deepEqual([p.status, p.payment_source, p.apr, p.payoff.months], ['estimate', 'entered', 0.24, 7])
    assert.ok(p.payoff.interest_cents > 0)
    assert.equal(p.when, '2027-06')
  })

  test('gives no date when there is no pace, or the balance isn\'t coming down', () => {
    assert.deepEqual([debtPlan(debt(null), none, today).status, debtPlan(debt(null), none, today).when], ['no_pace', ''])
    const growing = debtPlan(debt(-5000), none, today)
    assert.deepEqual([growing.status, growing.payment_source, growing.when, growing.payoff], ['not_shrinking', null, '', null])
    // A typed payment still gives one.
    assert.equal(debtPlan(debt(-5000), { payment_cents: 30000, apr: null }, today).status, 'estimate')
  })

  test('says when the payment doesn\'t outrun the interest', () => {
    const p = debtPlan(debt(1000), { payment_cents: null, apr: 0.3 }, today)
    assert.deepEqual([p.status, p.when, p.apr], ['outpaced', '', 0.3])
  })
})

describe('payoff', () => {
  test('without interest is the owed over the payment, rounded up', () => {
    assert.deepEqual(payoff(100000, 30000), { months: 4, interest_cents: 0 })
    assert.equal(payoff(100000, 0), null)
    assert.deepEqual(payoff(0, 0), { months: 0, interest_cents: 0 })
  })

  test('with interest matches the amortization formula', () => {
    // $10,000 at 6% for 60 months is $193.33 a month.
    const p = payoff(1000000, 19333, 0.06)
    assert.equal(p.months, 60)
    assert.ok(Math.abs(p.interest_cents - (19333 * 60 - 1000000)) < 100, String(p.interest_cents))
  })

  test('never ends when the payment doesn\'t outrun the interest, or takes over a century', () => {
    assert.equal(payoff(1000000, 10000, 0.12), null)
    assert.equal(payoff(1000000, 100), null)
  })

  test('lands in the right month', () => {
    assert.equal(monthsAfter('2026-11-09', 0), '2026-11')
    assert.equal(monthsAfter('2026-11-09', 2), '2027-01')
    assert.equal(monthsAfter('2026-11-09', 26), '2029-01')
  })
})

describe('project', () => {
  test('with no growth, adds up what goes in', () => {
    const p = project(100000, { years: 2, annual_return: 0, monthly_cents: 10000 })
    assert.deepEqual(p.map(x => [x.year, x.balance_cents, x.put_in_cents]), [[0, 100000, 100000], [1, 220000, 220000], [2, 340000, 340000]])
  })

  test('compounds monthly to the yearly rate given', () => {
    const p = project(1000000, { years: 10, annual_return: 0.05, monthly_cents: 0 })
    assert.equal(p.at(-1).balance_cents, Math.round(1000000 * 1.05 ** 10))
  })

  test('starts from the investment accounts only', () => {
    assert.equal(invested([acct('ira', 'retirement', 500), acct('brk', 'brokerage', 250), acct('chk', 'checking', 9999), acct('x', 'brokerage', null, '')]), 750)
  })
})
