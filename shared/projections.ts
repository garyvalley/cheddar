/**
 * The Projections page's numbers, worked out only from what the accounts
 * hold: the savings rate from the last few whole months' income and spending
 * (the same sums as Overview and Spending), where the investment accounts go
 * by retirement on the assumptions the person picks, and when each card and
 * loan is paid off at the pace it's being paid down. Pure, so the unit tests,
 * the server and the page use the same sums.
 */
import { isLiability } from './accounts.ts'
import { isInvestment, type BalancePoint, type Holding, type Month } from './overview.ts'

/** How many whole months, before this one, the savings rate and debt pace are taken from. */
export const PACE_MONTHS = 6

export interface Savings {
  /** The months with any income or spending, which the averages are over. */
  months_counted: number
  income_cents: number
  spent_cents: number
  /** income − spending, a month on average; negative when spending is more. */
  kept_cents: number
  /** kept ÷ income; null with no income to divide by. */
  rate: number | null
}

/** The average month of those that had any income or spending. */
export function savings(months: Month[]): Savings {
  const counted = months.filter(m => m.income_cents || m.spent_cents)
  const n = counted.length
  if (!n) return { months_counted: 0, income_cents: 0, spent_cents: 0, kept_cents: 0, rate: null }
  const income = Math.round(counted.reduce((s, m) => s + m.income_cents, 0) / n)
  const spent = Math.round(counted.reduce((s, m) => s + m.spent_cents, 0) / n)
  return { months_counted: n, income_cents: income, spent_cents: spent, kept_cents: income - spent, rate: income > 0 ? (income - spent) / income : null }
}

export interface Debt {
  id: string
  name: string
  kind: string
  /** What's owed, as a positive number. */
  owed_cents: number
  /**
   * How much less is owed each month, on average lately: payments less new
   * charges. Negative when it's growing; null when Cheddar can't tell.
   */
  paydown_cents: number | null
  /** Where the pace comes from: the account's transactions, or its balances over time. */
  basis: 'transactions' | 'balances' | null
}

const DAY = 86_400_000
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY
const MONTH_DAYS = 365.25 / 12

/**
 * Each card and loan that owes something, and how fast it's being paid down.
 * The pace is the account's transactions over the whole months given
 * (`months`, "YYYY-MM", oldest first), counted from the first of them it has
 * any in: every payment in and charge out moves what's owed. An account
 * with no transactions then (a loan whose balance is entered by hand) is
 * paced from its balances instead: the change since the oldest one at least
 * four weeks back.
 */
export function debts(
  accounts: Holding[],
  rows: { account: string, posted: string, amount_cents: number }[],
  history: BalancePoint[],
  months: string[],
): Debt[] {
  const out: Debt[] = []
  for (const a of accounts) {
    if (!isLiability(a.kind) || a.balance_cents === null || a.balance_cents >= 0) continue
    const debt: Debt = { id: a.id, name: a.name, kind: a.kind, owed_cents: -a.balance_cents, paydown_cents: null, basis: null }
    const mine = rows.filter(r => r.account === a.id && months.includes(r.posted.slice(0, 7)))
    if (mine.length) {
      const first = mine.reduce((m, r) => (r.posted.slice(0, 7) < m ? r.posted.slice(0, 7) : m), months.at(-1)!)
      const span = months.length - months.indexOf(first)
      debt.paydown_cents = Math.round(mine.reduce((s, r) => s + r.amount_cents, 0) / span)
      debt.basis = 'transactions'
    }
    else {
      const then = history
        .filter(p => p.account === a.id && days(p.date, a.balance_date) >= 28)
        .sort((x, y) => x.date.localeCompare(y.date))[0]
      if (then) {
        debt.paydown_cents = Math.round((a.balance_cents - then.balance_cents) / (days(then.date, a.balance_date) / MONTH_DAYS))
        debt.basis = 'balances'
      }
    }
    out.push(debt)
  }
  return out.sort((x, y) => y.owed_cents - x.owed_cents)
}

/** Longer than this and it's as good as never. */
export const MAX_PAYOFF_MONTHS = 100 * 12

export interface Payoff {
  months: number
  /** The interest paid on the way, at the rate given. */
  interest_cents: number
}

/**
 * How many months until `owed` is paid at `payment` a month, with interest at
 * `apr` (0.2 for 20%) charged monthly on what's left. Null when the payment
 * doesn't outrun the interest, or would take more than a century.
 */
export function payoff(owed_cents: number, payment_cents: number, apr = 0): Payoff | null {
  if (owed_cents <= 0) return { months: 0, interest_cents: 0 }
  if (!(payment_cents > 0)) return null
  const i = Math.max(0, apr) / 12
  let months: number
  if (i === 0) months = Math.ceil(owed_cents / payment_cents)
  else {
    if (payment_cents <= owed_cents * i) return null
    months = Math.ceil(-Math.log(1 - (i * owed_cents) / payment_cents) / Math.log(1 + i) - 1e-9)
  }
  if (months > MAX_PAYOFF_MONTHS) return null
  // The last payment is only what's left, so the interest is worked out month by month.
  let left = owed_cents
  let interest = 0
  for (let m = 0; m < months && left > 0; m++) {
    const charged = left * i
    interest += charged
    left = left + charged - payment_cents
  }
  return { months, interest_cents: Math.round(interest) }
}

/** The month a number of months after `today`'s, as "YYYY-MM". */
export function monthsAfter(today: string, months: number): string {
  const total = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + months
  return `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, '0')}`
}

export interface Assumptions {
  /** Years from now until the money is drawn on. */
  years: number
  /** A year's growth after inflation, as a fraction (0.05 for 5%), so the result is in today's dollars. */
  annual_return: number
  /** What's added to the investments each month. */
  monthly_cents: number
}

export interface ProjectionPoint {
  /** Years from now. */
  year: number
  balance_cents: number
  /** What's in it that was put in: today's balance and every month's addition, before growth. */
  put_in_cents: number
}

/**
 * Today's investments growing for `years`, compounded monthly, with
 * `monthly_cents` added at each month's end. One point a year, from now.
 */
export function project(start_cents: number, a: Assumptions): ProjectionPoint[] {
  const r = (1 + a.annual_return) ** (1 / 12) - 1
  const years = Math.max(0, Math.round(a.years))
  const points: ProjectionPoint[] = [{ year: 0, balance_cents: start_cents, put_in_cents: start_cents }]
  let balance = start_cents
  let put = start_cents
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r) + a.monthly_cents
      put += a.monthly_cents
    }
    points.push({ year: y, balance_cents: Math.round(balance), put_in_cents: put })
  }
  return points
}

/** The share of a balance that's commonly taken as safe to draw each year. */
export const WITHDRAWAL_RATE = 0.04

export interface Projections {
  /** The whole months the pace is taken from, oldest first. */
  months: Month[]
  savings: Savings
  /** What the brokerage and retirement accounts hold now. */
  invested_cents: number
  has_investments: boolean
  debts: Debt[]
}

/** The investment accounts' total, from those with a balance. */
export const invested = (accounts: Holding[]) => accounts.reduce((s, a) => (isInvestment(a.kind) && a.balance_cents !== null ? s + a.balance_cents : s), 0)
