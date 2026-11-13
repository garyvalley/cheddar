/**
 * The Overview page's numbers, worked out only from what the accounts hold:
 * net worth from their balances, income and spending by month from their
 * transactions (shared/categories.ts sorts them), and how the investment
 * accounts have grown from the balances Cheddar has seen over time
 * (`balance_history`, migrations/0010_balance_history.mjs). Pure, so the unit
 * tests and the server use the same sums.
 */
import { isLiability } from './accounts.ts'
import { summarize, type Category } from './categories.ts'
import type { BudgetStatus } from './budgets.ts'

/** An account with the balance it last showed; null when it has never had one. */
export interface Holding {
  id: string
  name: string
  kind: string
  balance_cents: number | null
  balance_date: string
}

export const GROUPS = [
  { id: 'cash', label: 'Cash', kinds: ['checking', 'savings'] },
  { id: 'investments', label: 'Investments', kinds: ['brokerage', 'retirement'] },
  { id: 'property', label: 'Property', kinds: ['property'] },
  { id: 'other', label: 'Other', kinds: ['other'] },
  { id: 'debts', label: 'Debts', kinds: ['credit_card', 'loan'] },
] as const

export type GroupId = typeof GROUPS[number]['id']

export const groupOf = (kind: string): GroupId => GROUPS.find(g => (g.kinds as readonly string[]).includes(kind))?.id ?? 'other'

export const isInvestment = (kind: string) => groupOf(kind) === 'investments'

export interface NetWorth {
  total_cents: number
  /** What every account that isn't a debt holds. */
  assets_cents: number
  /** What the cards and loans owe, as a negative number. */
  debts_cents: number
  /** Each kind of account with a balance, in GROUPS' order. */
  groups: { id: GroupId, label: string, total_cents: number, count: number }[]
  /** The newest balance's date. */
  as_of: string
  /** Accounts with no balance yet, which the total leaves out. */
  missing: { id: string, name: string }[]
}

export function netWorth(accounts: Holding[]): NetWorth {
  const by = new Map<GroupId, { total: number, count: number }>()
  let assets = 0
  let debts = 0
  let asOf = ''
  const missing: NetWorth['missing'] = []
  for (const a of accounts) {
    if (a.balance_cents === null) {
      missing.push({ id: a.id, name: a.name })
      continue
    }
    const g = by.get(groupOf(a.kind)) ?? { total: 0, count: 0 }
    g.total += a.balance_cents
    g.count++
    by.set(groupOf(a.kind), g)
    if (isLiability(a.kind)) debts += a.balance_cents
    else assets += a.balance_cents
    if (a.balance_date > asOf) asOf = a.balance_date
  }
  const groups = GROUPS.flatMap(g => (by.has(g.id) ? [{ id: g.id, label: g.label, total_cents: by.get(g.id)!.total, count: by.get(g.id)!.count }] : []))
  return { total_cents: assets + debts, assets_cents: assets, debts_cents: debts, groups, as_of: asOf, missing }
}

/** A day's balance of one account, as `balance_history` keeps it. */
export interface BalancePoint {
  account: string
  date: string
  balance_cents: number
}

/** The balance each account showed on `date`: its latest at or before it. Accounts with none by then are left out. */
export function balancesOn(history: BalancePoint[], date: string): Map<string, number> {
  const best = new Map<string, BalancePoint>()
  for (const p of history) {
    if (p.date > date) continue
    const had = best.get(p.account)
    if (!had || p.date > had.date) best.set(p.account, p)
  }
  return new Map([...best].map(([id, p]) => [id, p.balance_cents]))
}

/**
 * The accounts and their history with each closed account holding nothing
 * from the day it closed: `open` for what's held now (net worth, what's
 * invested), `accounts` and `history` for sums over time, where a closed
 * account still counts before that day. Balances a link synced after it
 * closed are left out.
 */
export function asHeld<T extends Holding & { closed_on?: string }>(accounts: T[], history: BalancePoint[]): { open: T[], accounts: T[], history: BalancePoint[] } {
  const closed = new Map(accounts.filter(a => a.closed_on).map(a => [a.id, a.closed_on!]))
  return {
    open: accounts.filter(a => !closed.has(a.id)),
    accounts: accounts.map(a => (closed.has(a.id) ? { ...a, balance_cents: 0, balance_date: a.closed_on! } : a)),
    history: [
      ...history.filter(p => !closed.has(p.account) || p.date < closed.get(p.account)!),
      ...[...closed].map(([account, date]) => ({ account, date, balance_cents: 0 })),
    ],
  }
}

/**
 * Net worth on an earlier day, for the change since then, from the accounts
 * that had a balance both then and now (an account added since would
 * otherwise read as growth). Null when none did.
 */
export function netWorthChange(accounts: Holding[], history: BalancePoint[], since: string): { since: string, change_cents: number } | null {
  const then = balancesOn(history, since)
  let change = 0
  let any = false
  for (const a of accounts) {
    if (a.balance_cents === null || !then.has(a.id)) continue
    change += a.balance_cents - then.get(a.id)!
    any = true
  }
  return any ? { since, change_cents: change } : null
}

export interface Month {
  /** "2026-11" */
  month: string
  /** "Nov" */
  label: string
  income_cents: number
  spent_cents: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The `count` months up to and including `today`'s, oldest first, as "YYYY-MM". */
export function lastMonths(today: string, count: number): string[] {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${pad(m)}`)
    if (--m === 0) { m = 12; y-- }
  }
  return out
}

const monthLabel = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/**
 * Each month's income and spending, the same sums Spending shows for a
 * month: transfers between the person's own accounts count as neither.
 */
export function monthly(rows: { posted: string, amount_cents: number, category: string }[], months: string[], list?: Category[]): Month[] {
  const by = new Map(months.map(m => [m, [] as typeof rows]))
  for (const r of rows) by.get(r.posted.slice(0, 7))?.push(r)
  return months.map((month) => {
    const s = summarize(by.get(month)!, list)
    return { month, label: monthLabel(month), income_cents: s.income_cents, spent_cents: s.spent_cents }
  })
}

export const GROWTH_PERIODS = [
  { id: '1m', label: '1M', name: 'the last month' },
  { id: '3m', label: '3M', name: 'the last 3 months' },
  { id: 'ytd', label: 'YTD', name: 'this year' },
  { id: '1y', label: '1Y', name: 'the last year' },
  { id: 'all', label: 'All', name: 'all the time Cheddar has seen' },
] as const

export type GrowthPeriodId = typeof GROWTH_PERIODS[number]['id']

/** The day a growth period starts, counted back from `today`. "all" starts at the beginning. */
export function growthStart(period: GrowthPeriodId, today: string): string {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const d = Number(today.slice(8, 10))
  const back = (months: number) => {
    const total = y * 12 + (m - 1) - months
    const yy = Math.floor(total / 12)
    const mm = total % 12 + 1
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    return `${yy}-${pad(mm)}-${pad(Math.min(d, last))}`
  }
  if (period === '1m') return back(1)
  if (period === '3m') return back(3)
  if (period === '1y') return back(12)
  if (period === 'ytd') return `${y - 1}-12-31`
  return '0000-01-01'
}

export interface Growth {
  period: GrowthPeriodId
  /** The day the comparison starts from: the period's start, or the first balance Cheddar saw after it. Empty when there's nothing to compare. */
  since: string
  start_cents: number
  end_cents: number
  /** Money moved in (positive) or out between the person's own accounts: transfers, which aren't growth. */
  added_cents: number
  /** end − start − added. */
  gain_cents: number
  /** gain ÷ start, as a fraction; null when there's no start to divide by. */
  rate: number | null
}

/**
 * How the investment accounts grew over a period: the change in their
 * balances, less what was moved into them. Each account starts from the
 * balance it showed on the period's first day or, if Cheddar first saw it
 * later, from that first balance; the dividends and interest it earned count
 * as growth.
 */
export function growth(
  accounts: Holding[],
  history: BalancePoint[],
  transfers: { account: string, posted: string, amount_cents: number }[],
  period: GrowthPeriodId,
  today: string,
): Growth {
  const from = growthStart(period, today)
  const invested = accounts.filter(a => isInvestment(a.kind) && a.balance_cents !== null)
  let start = 0
  let end = 0
  let added = 0
  let since = ''
  for (const a of invested) {
    const points = history.filter(p => p.account === a.id).sort((x, y) => x.date.localeCompare(y.date))
    const before = points.filter(p => p.date <= from).pop()
    const first = before ?? points[0]
    // Without a balance before today's, there's nothing to compare it with.
    if (!first || first.date >= a.balance_date) continue
    const day = before ? from : first.date
    start += first.balance_cents
    end += a.balance_cents!
    added += transfers.filter(t => t.account === a.id && t.posted > day && t.posted <= a.balance_date).reduce((n, t) => n + t.amount_cents, 0)
    if (!since || day < since) since = day
  }
  const gain = end - start - added
  return {
    period,
    since: since === '0000-01-01' ? '' : since,
    start_cents: start,
    end_cents: end,
    added_cents: added,
    gain_cents: gain,
    rate: start > 0 && since ? gain / start : null,
  }
}

export interface Overview {
  net_worth: NetWorth
  /** Since about a month ago, when Cheddar has balances from then. */
  change: { since: string, change_cents: number } | null
  months: Month[]
  /** Whether any account is an investment account with a balance. */
  has_investments: boolean
  growth: Growth[]
  /** This month's spending categories over their budget (shared/budgets.ts). */
  over_budget: BudgetStatus[]
}
