/**
 * Recurring charges: subscriptions and bills, found in the accounts'
 * spending. Transactions are grouped by merchant (`merchant_key`, which
 * pb_hooks/lib/categories.js sets on every one), split by amount so two
 * subscriptions from one merchant stay apart, and a group counts once three
 * or more of its charges come at a steady pace (weekly, every two weeks,
 * monthly, quarterly or yearly). Pure, so the unit tests and the server
 * agree: GET /api/recurring answers with recurring().
 */
import { categoryOf, type Category } from './categories.ts'

/** A transaction as recurring() reads it. */
export interface Charge {
  account: string
  posted: string
  amount_cents: number
  merchant_key: string
  payee: string
  description: string
  category: string
  pending?: boolean
}

export const CADENCES = [
  // `slack` is how many days early or late a charge can come; `grace`, how
  // long past its date a charge can be missing before it counts as stopped.
  { id: 'weekly', label: 'Weekly', every: 'a week', days: 7, months: 0, slack: 2, grace: 5, per_year: 52 },
  { id: 'biweekly', label: 'Every two weeks', every: 'every two weeks', days: 14, months: 0, slack: 3, grace: 7, per_year: 26 },
  { id: 'monthly', label: 'Monthly', every: 'a month', days: 30.44, months: 1, slack: 5, grace: 12, per_year: 12 },
  { id: 'quarterly', label: 'Every three months', every: 'every three months', days: 91.31, months: 3, slack: 10, grace: 30, per_year: 4 },
  { id: 'yearly', label: 'Yearly', every: 'a year', days: 365.25, months: 12, slack: 20, grace: 45, per_year: 1 },
] as const

export type CadenceId = typeof CADENCES[number]['id']
type Cadence = typeof CADENCES[number]

export const cadenceOf = (id: string) => CADENCES.find(c => c.id === id) ?? CADENCES[2]

/** How far back GET /api/recurring reads: enough for three yearly charges. */
export const LOOKBACK_YEARS = 3

/** A charge that stopped is still listed this long after it was expected. */
export const STOPPED_DAYS = 90

/**
 * Bills whose amount changes every time (power, water, a card's interest):
 * in these categories any amount counts as the same bill.
 */
export const VARYING = new Set(['utilities', 'housing', 'insurance', 'loans', 'fees'])

/** Charges this far apart (next over last) still count as the same price, so a price rise doesn't split a subscription in two. */
const SAME_AMOUNT = 1.35

export interface Recurring {
  /** The merchant, with the amount's group when one merchant has more than one. */
  key: string
  /** What the latest charge was called. */
  name: string
  category: string
  /** The account the latest charge was on. */
  account: string
  cadence: CadenceId
  /** What it costs each time (positive is spent): the latest charge, or for a bill that varies, the average of the last three. */
  amount_cents: number
  varies: boolean
  /** What a year of it costs at that amount. */
  yearly_cents: number
  count: number
  first: string
  last: string
  /** When the next charge is due. */
  next: string
  /** Expected and not seen for longer than the cadence's grace. */
  stopped: boolean
  /** The price went up or down with the latest charge, after staying the same. */
  change: { from_cents: number, to_cents: number, on: string } | null
}

export interface RecurringSummary {
  /** Still charging, most costly a year first. */
  items: Recurring[]
  /** Stopped in the last STOPPED_DAYS, most recent first. */
  stopped: Recurring[]
  /** What the ones still charging cost a year, and a month. */
  yearly_cents: number
  monthly_cents: number
}

const DAY = 86_400_000
const toDays = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / DAY
const fromDays = (d: number) => new Date(Math.round(d) * DAY).toISOString().slice(0, 10)

/** `ymd` moved by whole months, on the same day or the month's last if it has fewer. */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10)
}

const after = (ymd: string, c: Cadence) => (c.months ? addMonths(ymd, c.months) : fromDays(toDays(ymd) + c.days))

/** A gap between two charges that fits the cadence: one period, or two when one charge is missing. */
const fits = (gap: number, c: Cadence) => [1, 2].find(k => Math.abs(gap - k * c.days) <= c.slack * k)

/**
 * The longest run of charges, ending with the latest, that comes at the
 * cadence's pace: every gap one period (or two, with one missed), and at
 * least two gaps of exactly one. Its length, or 0.
 */
function run(dates: number[], c: Cadence): number {
  let len = 1
  let single = 0
  for (let i = dates.length - 1; i > 0; i--) {
    const k = fits(dates[i]! - dates[i - 1]!, c)
    if (!k) break
    len++
    if (k === 1) single++
  }
  return len >= 3 && single >= 2 ? len : 0
}

/** Splits a merchant's charges where the amount jumps by more than SAME_AMOUNT. */
function byAmount(charges: Charge[]): Charge[][] {
  const sorted = [...charges].sort((a, b) => b.amount_cents - a.amount_cents) // smallest charge first
  const groups: Charge[][] = []
  for (const ch of sorted) {
    const g = groups.at(-1)
    if (g && Math.abs(ch.amount_cents) <= Math.abs(g.at(-1)!.amount_cents) * SAME_AMOUNT) g.push(ch)
    else groups.push([ch])
  }
  return groups.map(g => g.sort((a, b) => a.posted.localeCompare(b.posted)))
}

/** One group of a merchant's charges, oldest first, as a recurring charge, or null when they don't come at a steady pace. */
function detect(key: string, charges: Charge[], varying: boolean, today: string): Recurring | null {
  // Two charges on one day (a retried payment) count once.
  const days: Charge[] = []
  for (const ch of charges) {
    if (days.at(-1)?.posted === ch.posted) days[days.length - 1] = ch
    else days.push(ch)
  }
  const dates = days.map(ch => toDays(ch.posted))
  let best: { c: Cadence, len: number } | null = null
  for (const c of CADENCES) {
    const len = run(dates, c)
    if (len > (best?.len ?? 0)) best = { c, len }
  }
  if (!best) return null
  const { c, len } = best
  const kept = days.slice(-len)
  const spent = kept.map(ch => -ch.amount_cents)
  const latest = kept.at(-1)!
  const [a, b, z] = [spent.at(-3)!, spent.at(-2)!, spent.at(-1)!]
  // Anything but a bill keeps to one price: two of the last three charges
  // within a couple of percent (a foreign currency's rate moves it a little).
  // A shop visited every Saturday, for different amounts each time, isn't a
  // subscription.
  const near = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * 0.02
  if (!varying && !(near(a, b) || near(b, z) || near(a, z))) return null
  const change = b === a && z !== b ? { from_cents: b, to_cents: z, on: latest.posted } : null
  const varies = !change && !(z === b && b === a)
  const amount = varies ? Math.round((a + b + z) / 3) : z
  const next = after(latest.posted, c)
  return {
    key,
    name: latest.payee || latest.description || key,
    category: latest.category,
    account: latest.account,
    cadence: c.id,
    amount_cents: amount,
    varies,
    yearly_cents: amount * c.per_year,
    count: kept.length,
    first: kept[0]!.posted,
    last: latest.posted,
    next,
    stopped: toDays(today) > toDays(next) + c.grace,
    change,
  }
}

/**
 * The recurring charges in `rows`: money out, not pending, in a spending
 * category of the person's `list` (so card payments and transfers never
 * count), and from a merchant Cheddar could name.
 */
export function recurring(rows: Charge[], list: Category[], today: string): RecurringSummary {
  const merchants = new Map<string, Charge[]>()
  for (const r of rows) {
    if (r.amount_cents >= 0 || r.pending || !r.merchant_key || r.posted > today) continue
    if (!categoryOf(r.category, list).spending) continue
    const g = merchants.get(r.merchant_key) ?? []
    g.push(r)
    merchants.set(r.merchant_key, g)
  }
  const found: Recurring[] = []
  for (const [merchant, charges] of merchants) {
    if (charges.length < 3) continue
    const varying = charges.some(ch => VARYING.has(categoryOf(ch.category, list).id))
    const groups = varying ? [[...charges].sort((a, b) => a.posted.localeCompare(b.posted))] : byAmount(charges)
    for (const g of groups) {
      const r = g.length >= 3 ? detect(merchant, g, varying, today) : null
      if (r) found.push(r)
    }
  }
  // A merchant with two subscriptions gets a key for each.
  const seen = new Map<string, number>()
  for (const r of found) {
    const n = (seen.get(r.key) ?? 0) + 1
    seen.set(r.key, n)
    if (n > 1) r.key = `${r.key} ${n}`
  }
  const cutoff = fromDays(toDays(today) - STOPPED_DAYS)
  const items = found.filter(r => !r.stopped).sort((x, y) => y.yearly_cents - x.yearly_cents || x.name.localeCompare(y.name))
  const stopped = found.filter(r => r.stopped && r.next >= cutoff).sort((x, y) => y.last.localeCompare(x.last))
  const yearly = items.reduce((n, r) => n + r.yearly_cents, 0)
  return { items, stopped, yearly_cents: yearly, monthly_cents: Math.round(yearly / 12) }
}
