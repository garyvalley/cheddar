/**
 * Investments' past (issue #144): each position's value day by day
 * (`holding_history`) and the accounts' buys, sells, dividends and the rest
 * (`investment_activity`), both from Plaid Investments through the sync
 * (pb_hooks/glue/sync_holdings.js). Pure; built for the hooks too
 * (pb_hooks/lib/gen/investing.js), which use securityKey, dayRows and
 * activityFrom. Activity is kept apart from transactions: it's never
 * spending or income.
 */

/** How far back a link's first activity call reaches: Plaid keeps 24 months. */
export const FIRST_DAYS = 730
/** A later call starts this long before the newest activity kept, so late or corrected ones arrive. */
export const OVERLAP_DAYS = 30

export type ActivityKind = 'buy' | 'sell' | 'dividend' | 'interest' | 'deposit' | 'withdrawal' | 'fee' | 'other'

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  buy: 'Bought',
  sell: 'Sold',
  dividend: 'Dividend',
  interest: 'Interest',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  fee: 'Fee',
  other: 'Other',
}

export interface Activity {
  id: string
  account: string
  /** YYYY-MM-DD */
  date: string
  kind: ActivityKind
  /** What the bank calls it. */
  name: string
  security: string
  ticker: string
  quantity: number
  /** The price of one, or null. */
  price_cents: number | null
  /** The cash it moved into the account: a sale or a dividend is more, a buy less. */
  amount_cents: number
  fees_cents: number | null
}

/** One security's value on a day in an account (holding_history). */
export interface HoldingDay {
  account: string
  date: string
  security: string
  value_cents: number
  quantity: number
}

interface PositionLike { name?: string, ticker?: string, type?: string, quantity?: number, value_cents?: number, price_cents?: number | null }

function shift(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

/**
 * Which security a position is, the same from one day to the next: its
 * ticker, or its name when it has none, in lower case. Cash goes by its type,
 * since some banks give it no ticker.
 */
export function securityKey(p: PositionLike): string {
  if (p.type === 'cash') return 'cash'
  return String(p.ticker || p.name || '').trim().toLowerCase().slice(0, 200)
}

/** One day's row per security for an account: two lots of one security are added up. */
export function dayRows(positions: PositionLike[]) {
  const by = new Map<string, { security: string, name: string, ticker: string, type: string, quantity: number, value_cents: number, price_cents: number | null }>()
  for (const p of positions) {
    const key = securityKey(p)
    if (!key) continue
    let d = by.get(key)
    if (!d) {
      d = { security: key, name: p.name ?? '', ticker: p.ticker ?? '', type: p.type || 'other', quantity: 0, value_cents: 0, price_cents: p.price_cents ?? null }
      by.set(key, d)
    }
    d.quantity += p.quantity ?? 0
    d.value_cents += p.value_cents ?? 0
  }
  return [...by.values()]
}

/**
 * The first day of activity to ask for: OVERLAP_DAYS before the newest kept
 * ('' with none), or FIRST_DAYS before `today`; never after today.
 */
export function activityFrom(newest: string, today: string): string {
  const first = shift(today, -FIRST_DAYS)
  if (!/^\d{4}-\d{2}-\d{2}/.test(newest)) return first
  const from = shift(newest.slice(0, 10), -OVERLAP_DAYS)
  if (from < first) return first
  return from > today ? today : from
}

/**
 * How each position's value moved over the last `days` days, by
 * `${account}|${security}`: from its value on the first day kept in that
 * span. Only positions kept on a day before today have a change.
 */
export function positionChanges(history: HoldingDay[], today: string, days = 30): Map<string, { since: string, from_cents: number }> {
  const start = shift(today, -days)
  const out = new Map<string, { since: string, from_cents: number }>()
  for (const h of history) {
    if (h.date < start || h.date >= today) continue
    const key = `${h.account}|${h.security}`
    const had = out.get(key)
    if (!had || h.date < had.since) out.set(key, { since: h.date, from_cents: h.value_cents })
  }
  return out
}

/** What dividends and interest paid between `from` and `to` (inclusive). */
export function incomeBetween(rows: Activity[], from: string, to: string): number {
  return rows
    .filter(r => (r.kind === 'dividend' || r.kind === 'interest') && r.date >= from && r.date <= to)
    .reduce((n, r) => n + r.amount_cents, 0)
}
