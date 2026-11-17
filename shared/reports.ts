/**
 * Reports (issue #108): trends over months that Spending, which compares
 * one span with the one before it, can't show. Pure, so the sums are tested
 * and the server only reads the rows (server/data/reports/reports.ts):
 *
 * - each month's income, spending and what was left (`trend`);
 * - each category, and the biggest merchants, month by month;
 * - where the income went (`flow`, drawn as a money-flow chart);
 * - a year in review (`yearReview`).
 *
 * The rows are the ones every report reads (transactionsBetween(), split
 * ones already in their parts, left-out ones gone), so the totals are
 * Spending's: transfers count as neither income nor spending.
 */

import { BUILT_IN, categoryOf, summarize, type Category } from './categories.ts'

/** The most months one report reads. */
export const MAX_MONTHS = 60
/** How many merchants a report names; the rest aren't listed. */
export const TOP_MERCHANTS = 15

export interface ReportRow {
  posted: string
  amount_cents: number
  category: string
  merchant_key?: string
  payee?: string
  description?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const isMonth = (v: unknown): v is string => typeof v === 'string' && MONTH.test(v)

/** The month after "YYYY-MM". */
export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

/** `n` months before "YYYY-MM" (negative goes forward). */
export function monthsBack(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 - n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Every month from `from` to `to`, both included, oldest first; [] when `to` comes first. */
export function monthsFrom(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to && out.length <= MAX_MONTHS; m = nextMonth(m)) out.push(m)
  return out
}

/** The last day of "YYYY-MM". */
export function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/** "Nov 2026", or "Nov" when `short`. */
export function monthName(month: string, short = false): string {
  return new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' })
}

export const RANGES = [
  { id: '6m', label: '6 months' },
  { id: '12m', label: '12 months' },
  { id: '24m', label: '2 years' },
  { id: 'ytd', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
] as const
export type RangeId = typeof RANGES[number]['id']

/** The months a range covers, counted back from `today`'s month (which it includes). */
export function rangeMonths(id: RangeId, today: string): { from: string, to: string } {
  const now = today.slice(0, 7)
  const year = Number(today.slice(0, 4))
  switch (id) {
    case '6m': return { from: monthsBack(now, 5), to: now }
    case '24m': return { from: monthsBack(now, 23), to: now }
    case 'ytd': return { from: `${year}-01`, to: now }
    case 'last-year': return { from: `${year - 1}-01`, to: `${year - 1}-12` }
    default: return { from: monthsBack(now, 11), to: now }
  }
}

/**
 * The months asked for (`from` and `to` as "YYYY-MM"), or the problem in
 * words: both real months, in order, at most MAX_MONTHS apart.
 */
export function checkRange(from: unknown, to: unknown): { from: string, to: string } | { problem: string } {
  if (!isMonth(from) || !isMonth(to)) return { problem: 'Pick months as YYYY-MM.' }
  if (from > to) return { problem: 'Pick a start on or before the end.' }
  if (monthsFrom(from, to).length > MAX_MONTHS) return { problem: `Pick at most ${MAX_MONTHS / 12} years.` }
  return { from, to }
}

export interface MonthTotals {
  month: string
  income_cents: number
  spent_cents: number
  /** Income less spending: what was left (negative when more went out). */
  net_cents: number
}

export interface Series {
  id: string
  label: string
  /** One per month of the report, in its order. Spending as positive amounts. */
  months: number[]
  total_cents: number
  count: number
}

export interface Flow {
  income_cents: number
  /** Where it went: spending categories, most first; small ones become "Everything else". */
  to: { id: string, label: string, cents: number }[]
  /** What was left of the income, when spending was less. */
  saved_cents: number
  /** How much spending went past the income, when it did. */
  short_cents: number
}

export interface Report {
  from: string
  to: string
  months: MonthTotals[]
  income_cents: number
  spent_cents: number
  /** Share of income left, as a whole percent, or null with no income. */
  saved_percent: number | null
  /** Spending categories with anything in them, most first. */
  categories: Series[]
  /** The merchants spent at most, by name. */
  merchants: Series[]
  flow: Flow
}

const byMonth = <T extends { posted: string }>(rows: T[], months: string[]) => {
  const by = new Map(months.map(m => [m, [] as T[]]))
  for (const r of rows) by.get(r.posted.slice(0, 7))?.push(r)
  return by
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

/** The most the flow chart draws; the smaller categories are put together. */
export const FLOW_MAX = 6

/** Where `income_cents` went, from each spending category's total. */
export function flow(income_cents: number, spending: { id: string, label: string, total_cents: number }[]): Flow {
  const kept = spending.filter(c => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents)
  const to = kept.slice(0, FLOW_MAX - 1).map(c => ({ id: c.id, label: c.label, cents: c.total_cents }))
  const rest = kept.slice(FLOW_MAX - 1).reduce((n, c) => n + c.total_cents, 0)
  if (rest) to.push({ id: 'rest', label: 'Everything else', cents: rest })
  const spent = to.reduce((n, c) => n + c.cents, 0)
  const income = Math.max(0, income_cents)
  return { income_cents: income, to, saved_cents: Math.max(0, income - spent), short_cents: Math.max(0, spent - income) }
}

/** The merchant a row is grouped under, and the name it's shown by. */
function merchantOf(r: ReportRow): { key: string, name: string } | null {
  const key = r.merchant_key || (r.payee || r.description || '').toLowerCase().trim()
  if (!key) return null
  return { key, name: r.payee || r.description || key }
}

/** The whole report over `months` (oldest first) from the rows in them. */
export function report(rows: ReportRow[], months: string[], list: Category[] = BUILT_IN): Report {
  const by = byMonth(rows, months)
  const index = new Map(months.map((m, i) => [m, i]))
  const totals: MonthTotals[] = []
  const cats = new Map<string, Series>()
  for (const [i, month] of months.entries()) {
    const s = summarize(by.get(month)!, list)
    totals.push({ month, income_cents: s.income_cents, spent_cents: s.spent_cents, net_cents: s.income_cents - s.spent_cents })
    for (const c of s.categories) {
      if (!c.spending) continue
      let series = cats.get(c.id)
      if (!series) cats.set(c.id, (series = { id: c.id, label: c.label, months: months.map(() => 0), total_cents: 0, count: 0 }))
      series.months[i] = c.total_cents
      series.total_cents += c.total_cents
      series.count += c.count
    }
  }
  // Merchants: spending only, as Spending counts it (a refund takes off).
  const merchants = new Map<string, Series & { latest: string }>()
  for (const r of rows) {
    const i = index.get(r.posted.slice(0, 7))
    if (i === undefined || !categoryOf(r.category, list).spending) continue
    const m = merchantOf(r)
    if (!m) continue
    let series = merchants.get(m.key)
    if (!series) merchants.set(m.key, (series = { id: m.key, label: m.name, months: months.map(() => 0), total_cents: 0, count: 0, latest: '' }))
    series.months[i] = (series.months[i] ?? 0) - r.amount_cents
    series.total_cents -= r.amount_cents
    series.count++
    // Named as its latest charge is.
    if (r.posted >= series.latest) Object.assign(series, { latest: r.posted, label: m.name })
  }
  const income = totals.reduce((n, m) => n + m.income_cents, 0)
  const spent = totals.reduce((n, m) => n + m.spent_cents, 0)
  const categories = [...cats.values()].filter(c => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents)
  return {
    from: months[0] ?? '',
    to: months.at(-1) ?? '',
    months: totals,
    income_cents: income,
    spent_cents: spent,
    saved_percent: percent(income - spent, income),
    categories,
    merchants: [...merchants.values()]
      .filter(m => m.total_cents > 0)
      .sort((a, b) => b.total_cents - a.total_cents || a.label.localeCompare(b.label))
      .slice(0, TOP_MERCHANTS)
      .map(m => ({ id: m.id, label: m.label, months: m.months, total_cents: m.total_cents, count: m.count })),
    flow: flow(income, categories),
  }
}

export interface YearReview {
  year: number
  /** Whether the year is still going (it's this year). */
  partial: boolean
  income_cents: number
  spent_cents: number
  saved_cents: number
  saved_percent: number | null
  /**
   * The same sums for the same months of the year before (all of it for a
   * whole year), only when Cheddar has transactions in most of those months:
   * a comparison with a year it barely saw would mislead.
   */
  before: { income_cents: number, spent_cents: number, months: number } | null
  /** Spent per month on average, over the months gone by. */
  monthly_cents: number
  biggest_month: { month: string, spent_cents: number } | null
  top_categories: { id: string, label: string, total_cents: number }[]
  top_merchant: { name: string, total_cents: number, count: number } | null
  /** Transactions counted, after splits are put back together. */
  count: number
}

/**
 * A year in review from its rows and the year before's. `today` decides
 * whether it's the year still going, whose average is over the months so far.
 */
export function yearReview(year: number, rows: ReportRow[], before: ReportRow[], today: string, list: Category[] = BUILT_IN, count = rows.length): YearReview {
  const months = monthsFrom(`${year}-01`, `${year}-12`)
  const r = report(rows, months, list)
  const partial = today.slice(0, 4) === String(year)
  const gone = partial ? Number(today.slice(5, 7)) : 12
  // The same months of the year before, and only when most of them are there.
  const priorRows = before.filter(b => Number(b.posted.slice(5, 7)) <= gone)
  const seen = new Set(priorRows.map(b => b.posted.slice(0, 7))).size
  const prior = summarize(priorRows, list)
  const biggest = r.months.reduce<MonthTotals | null>((b, m) => (m.spent_cents > (b?.spent_cents ?? 0) ? m : b), null)
  const top = r.merchants[0]
  return {
    year,
    partial,
    income_cents: r.income_cents,
    spent_cents: r.spent_cents,
    saved_cents: r.income_cents - r.spent_cents,
    saved_percent: r.saved_percent,
    before: seen >= Math.ceil(gone * 0.75) ? { income_cents: prior.income_cents, spent_cents: prior.spent_cents, months: gone } : null,
    monthly_cents: Math.round(r.spent_cents / Math.max(1, gone)),
    biggest_month: biggest ? { month: biggest.month, spent_cents: biggest.spent_cents } : null,
    top_categories: r.categories.slice(0, 3).map(c => ({ id: c.id, label: c.label, total_cents: c.total_cents })),
    top_merchant: top ? { name: top.label, total_cents: top.total_cents, count: top.count } : null,
    count,
  }
}
