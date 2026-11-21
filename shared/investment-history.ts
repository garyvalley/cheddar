/**
 * Investments over time (Investments' "Over time" and "Options" cards): for
 * each month or quarter, what the brokerage and retirement accounts were
 * worth at its end, how much of the change was money moved in or out and how
 * much was the market, what dividends and interest paid, and what was held
 * at its end, share by share, against the period before. Options are
 * followed contract by contract, from opening to closing, expiring, being
 * exercised or being assigned, with the cash each one brought in or took.
 *
 * Values come only from what Cheddar kept: account balances
 * (`balance_history`) and each day's positions (`holding_history`). Share
 * counts reach back further: what's held now, less every buy and sale since
 * (`investment_activity`, two years of it). Banks give no past prices, so a
 * period before Cheddar kept positions has share counts but no values. Pure.
 */
import { balancesOn, type BalancePoint } from './overview.ts'
import { securityKey, type Activity, type HoldingDay } from './investing.ts'
import type { Investments } from './investments.ts'
import type { Portfolio } from './holdings.ts'

export type Grain = 'month' | 'quarter'

/** GET /api/investments (server/data/reports/investments.ts). */
export type InvestmentsReport = Investments & {
  holdings: Portfolio & { on: boolean }
  activity: {
    /** The newest first, at most 200. */
    rows: Activity[]
    /** Dividends and interest over the last 12 months. */
    income_12m_cents: number
  }
  /** Month by month and quarter by quarter. */
  timeline: Record<Grain, TimelinePeriod[]>
  options: OptionContract[]
}

export const GRAINS: { id: Grain, label: string, count: number }[] = [
  { id: 'month', label: 'By month', count: 12 },
  { id: 'quarter', label: 'By quarter', count: 8 },
]

export interface Period {
  /** "2026-11" or "2026-Q4" */
  id: string
  /** "Nov 2026" or "Q4 2026" */
  label: string
  /** "Nov" or "Q4" */
  short: string
  /** YYYY-MM-DD, inclusive */
  from: string
  /** YYYY-MM-DD, inclusive: today for the period running now */
  to: string
}

/** A security held at a period's end, across the accounts. */
export interface PeriodHolding {
  security: string
  name: string
  ticker: string
  type: string
  option: boolean
  quantity: number
  /** Against the period before's end; null for the first period shown. */
  quantity_change: number | null
  /** Its value at the period's end, when Cheddar kept the positions then. */
  value_cents: number | null
  /** The market's part of its change in value: buys and sales of it in the period left out. */
  value_change_cents: number | null
}

export interface TimelinePeriod extends Period {
  /** The investment accounts' value at the end, from their balances; null before any had one. */
  value_cents: number | null
  /** Against the period before's end, counting only accounts with a value at both. */
  change_cents: number | null
  /** Deposits less withdrawals over the period (not growth). */
  moved_in_cents: number
  /** The change less what was moved in: what the market and income did. */
  gain_cents: number | null
  /** Dividends and interest paid. */
  income_cents: number
  /** Cash that went into buys and came out of sales (both 0 or more). */
  bought_cents: number
  sold_cents: number
  /** Cash in less out from option trades, exercises and assignments. */
  options_cents: number
  /** How many options closed, expired, were exercised or assigned. */
  options_ended: number
  holdings: PeriodHolding[]
  /** Whether holdings' values are from that time (else share counts only). */
  valued: boolean
  activity: number
}

export interface OptionContract {
  account: string
  security: string
  name: string
  ticker: string
  /** Contracts held now (negative when written); 0 once it's over. */
  quantity: number
  /** "open", or how it ended. */
  status: 'open' | 'closed' | 'expired' | 'exercised' | 'assigned'
  opened: string
  ended: string
  /** Its premiums and trades: cash in less cash out. For an open one, so far. */
  cash_cents: number
  /** What it's worth now, when it's open. */
  value_cents: number | null
  /** Cash plus what it's worth now: its gain or loss. Null when its start is older than Cheddar's records. */
  result_cents: number | null
  events: Activity[]
}

/** What's held now in one account (the holdings collection). */
export interface CurrentPosition {
  account: string
  name: string
  ticker: string
  type: string
  quantity: number
  value_cents: number
}

/** What holding_history keeps, with the security's names. */
export type HistoryDay = HoldingDay & { name?: string, ticker?: string, type?: string }

const pad = (n: number) => String(n).padStart(2, '0')
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The last `count` months or quarters, oldest first; the last one runs to `today`. */
export function periodsBack(today: string, grain: Grain, count: number): Period[] {
  let y = Number(today.slice(0, 4))
  const m0 = Number(today.slice(5, 7))
  const step = grain === 'quarter' ? 3 : 1
  // The period's first month.
  let m = grain === 'quarter' ? Math.floor((m0 - 1) / 3) * 3 + 1 : m0
  const out: Period[] = []
  for (let i = 0; i < count; i++) {
    const lastM = m + step - 1
    const end = monthEnd(y, lastM)
    const q = Math.floor((m - 1) / 3) + 1
    out.unshift({
      id: grain === 'quarter' ? `${y}-Q${q}` : `${y}-${pad(m)}`,
      label: grain === 'quarter' ? `Q${q} ${y}` : `${MONTHS[m - 1]} ${y}`,
      short: grain === 'quarter' ? `Q${q}` : MONTHS[m - 1]!,
      from: `${y}-${pad(m)}-01`,
      to: end < today ? end : today,
    })
    m -= step
    if (m < 1) { m += 12; y-- }
  }
  return out
}

const OCC = /^[A-Z]{1,6}\s*\d{6}[CP]\d{8}$/
/** Whether a security is an option: the bank says "derivative", or its symbol is an option's (OCC). */
export function isOption(p: { type?: string, security_type?: string, ticker?: string }): boolean {
  const t = String(p.type || p.security_type || '').toLowerCase()
  if (t === 'derivative') return true
  return OCC.test(String(p.ticker || '').toUpperCase().replace(/^-/, ''))
}

/** The shares a piece of activity added: a sale takes them away whatever sign the bank gave. */
const shares = (a: Activity) => (a.kind === 'buy' ? Math.abs(a.quantity) : a.kind === 'sell' ? -Math.abs(a.quantity) : a.quantity)
const keyOf = (account: string, security: string) => `${account}|${security}`
const activityKey = (a: Activity) => securityKey({ ticker: a.ticker, name: a.security || '', type: a.security_type === 'cash' ? 'cash' : '' })

interface Names { name: string, ticker: string, type: string, option: boolean }

/**
 * Each account's last day kept in holding_history on or before `to` and no
 * earlier than `from`, with that day's rows.
 */
function daysIn(history: HistoryDay[], from: string, to: string): Map<string, HistoryDay[]> {
  const last = new Map<string, string>()
  for (const h of history) {
    if (h.date < from || h.date > to) continue
    if ((last.get(h.account) ?? '') < h.date) last.set(h.account, h.date)
  }
  const out = new Map<string, HistoryDay[]>()
  for (const h of history) {
    if (last.get(h.account) !== h.date) continue
    const rows = out.get(h.account) ?? []
    rows.push(h)
    out.set(h.account, rows)
  }
  return out
}

/**
 * The timeline. `accounts` are the investment accounts with what they hold
 * (`covered`: the ones whose positions Cheddar has, so share counts can be
 * worked back), `balances` their balance history (closed accounts already
 * holding nothing from their closing, as asHeld() gives it), `activity` their
 * activity, `transfers` money moved in or out of accounts that have no
 * activity (their transactions in Transfers), and `current` what's held now.
 */
export function timeline(input: {
  periods: Period[]
  balances: BalancePoint[]
  /** Accounts' values now, which may be newer than their history. */
  now: Map<string, number>
  covered: Set<string>
  current: CurrentPosition[]
  history: HistoryDay[]
  activity: Activity[]
  transfers: { account: string, posted: string, amount_cents: number }[]
}): TimelinePeriod[] {
  const { periods, balances, now, covered, current, history, activity, transfers } = input
  const today = periods.at(-1)?.to ?? ''
  const contracts = optionContracts(activity, current.filter(p => covered.has(p.account)))
  const withActivity = new Set(activity.map(a => a.account))
  const names = new Map<string, Names>()
  const nameOf = (security: string, n: Partial<Names> & { security_type?: string }) => {
    if (!security || names.has(security)) return
    const type = n.type || n.security_type || ''
    names.set(security, { name: n.name || n.ticker || security, ticker: n.ticker ?? '', type, option: isOption({ type, ticker: n.ticker }) })
  }

  // What each covered account holds now, by security.
  const held = new Map<string, number>()
  for (const p of current) {
    if (!covered.has(p.account)) continue
    const s = securityKey(p)
    if (!s || s === 'cash') continue
    nameOf(s, p)
    held.set(keyOf(p.account, s), (held.get(keyOf(p.account, s)) ?? 0) + p.quantity)
  }
  for (const h of history) nameOf(h.security, h)
  const trades = activity.filter(a => covered.has(a.account) && a.quantity)
  for (const a of activity) nameOf(activityKey(a), { name: a.security || a.name, ticker: a.ticker, security_type: a.security_type })

  /** Each covered account's shares of each security at the end of `date`: now, less what's changed since. */
  function sharesAt(date: string): Map<string, number> {
    const out = new Map(held)
    for (const a of trades) {
      if (a.date <= date) continue
      const s = activityKey(a)
      if (!s || s === 'cash') continue
      out.set(keyOf(a.account, s), (out.get(keyOf(a.account, s)) ?? 0) - shares(a))
    }
    return out
  }

  function holdingsAt(p: Period): { rows: Map<string, { quantity: number, value: number | null }>, valued: boolean } {
    const days = daysIn(history, p.from, p.to)
    const worked = sharesAt(p.to)
    const rows = new Map<string, { quantity: number, value: number | null }>()
    let valued = covered.size > 0
    for (const account of covered) {
      const day = days.get(account)
      if (day) {
        // Kept that day: its own counts and values.
        for (const h of day) {
          if (h.security === 'cash') continue
          const r = rows.get(h.security) ?? { quantity: 0, value: 0 }
          r.quantity += h.quantity
          r.value = r.value === null ? null : r.value + h.value_cents
          rows.set(h.security, r)
        }
        continue
      }
      // Not kept then: shares worked back from today, values unknown.
      if (p.to !== today) valued = false
      for (const [k, q] of worked) {
        if (!k.startsWith(`${account}|`) || Math.abs(q) < 1e-9) continue
        const s = k.slice(account.length + 1)
        const r = rows.get(s) ?? { quantity: 0, value: 0 }
        r.quantity += q
        r.value = null
        rows.set(s, r)
      }
      // The period running now: today's positions are what's held.
      if (p.to === today) {
        for (const c of current) {
          const s = securityKey(c)
          if (c.account !== account || s === 'cash') continue
          const r = rows.get(s)
          if (r) r.value = (r.value ?? 0) + c.value_cents
        }
      }
    }
    return { rows, valued }
  }

  const valueAt = (p: Period) => {
    if (p.to === today) return now
    return balancesOn(balances, p.to)
  }

  const before: Period = (() => {
    const first = periods[0]!
    const d = new Date(Date.parse(`${first.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
    return { id: '', label: '', short: '', from: '0000-01-01', to: d }
  })()
  let prevValues = valueAt(before)
  let prevHoldings = periods.length ? holdingsAt(before) : null

  return periods.map((p) => {
    const values = valueAt(p)
    const value = values.size ? [...values.values()].reduce((n, c) => n + c, 0) : null
    // The change counts accounts with a value at both ends; one added since isn't growth.
    const both = [...values.keys()].filter(id => prevValues.has(id))
    const change = both.length ? both.reduce((n, id) => n + values.get(id)! - prevValues.get(id)!, 0) : null
    const inPeriod = (date: string) => date >= p.from && date <= p.to
    const rows = activity.filter(a => inPeriod(a.date))
    const movedFromActivity = rows.filter(a => (a.kind === 'deposit' || a.kind === 'withdrawal') && both.includes(a.account)).reduce((n, a) => n + a.amount_cents, 0)
    const movedFromTransfers = transfers.filter(t => inPeriod(t.posted) && !withActivity.has(t.account) && both.includes(t.account)).reduce((n, t) => n + t.amount_cents, 0)
    const moved = movedFromActivity + movedFromTransfers
    const optionRows = rows.filter(a => isOption({ type: a.security_type, ticker: a.ticker }))
    const stockRows = rows.filter(a => !optionRows.includes(a))

    const end = holdingsAt(p)
    // Cash each security's trades took or brought in the period: a holding's change in value leaves them out.
    const traded = new Map<string, number>()
    for (const a of rows) {
      if (a.kind === 'dividend' || a.kind === 'interest' || !covered.has(a.account)) continue
      const s = activityKey(a)
      if (s && s !== 'cash') traded.set(s, (traded.get(s) ?? 0) + a.amount_cents)
    }
    const holdings: PeriodHolding[] = [...new Set([...end.rows.keys(), ...(prevHoldings?.rows.keys() ?? [])])]
      .map((s) => {
        const r = end.rows.get(s)
        const was = prevHoldings?.rows.get(s)
        const n = names.get(s) ?? { name: s, ticker: '', type: '', option: false }
        const quantity = r?.quantity ?? 0
        const value = r ? r.value : 0
        const wasValue = was ? was.value : 0
        return {
          security: s,
          name: n.name,
          ticker: n.ticker,
          type: n.type,
          option: n.option,
          quantity,
          quantity_change: p === periods[0] ? null : quantity - (was?.quantity ?? 0),
          value_cents: value,
          value_change_cents: p === periods[0] || value === null || wasValue === null || !end.valued || !prevHoldings?.valued ? null : value - wasValue + (traded.get(s) ?? 0),
        }
      })
      // Gone before this period and not back: nothing to show.
      .filter(h => Math.abs(h.quantity) > 1e-9 || (h.quantity_change !== null && Math.abs(h.quantity_change) > 1e-9))
      .sort((a, b) => (b.value_cents ?? 0) - (a.value_cents ?? 0) || a.name.localeCompare(b.name))

    const out: TimelinePeriod = {
      ...p,
      value_cents: value,
      change_cents: change,
      moved_in_cents: moved,
      gain_cents: change === null ? null : change - moved,
      income_cents: rows.filter(a => a.kind === 'dividend' || a.kind === 'interest').reduce((n, a) => n + a.amount_cents, 0),
      bought_cents: stockRows.filter(a => a.kind === 'buy').reduce((n, a) => n - Math.min(0, a.amount_cents), 0),
      sold_cents: stockRows.filter(a => a.kind === 'sell').reduce((n, a) => n + Math.max(0, a.amount_cents), 0),
      options_cents: optionRows.reduce((n, a) => n + a.amount_cents, 0),
      options_ended: contracts.filter(c => c.status !== 'open' && inPeriod(c.ended)).length,
      holdings,
      valued: end.valued,
      activity: rows.length,
    }
    prevValues = values
    prevHoldings = end
    return out
  })
}

const ENDINGS: Partial<Record<Activity['kind'], OptionContract['status']>> = { expire: 'expired', exercise: 'exercised', assignment: 'assigned' }

/**
 * Every option contract in the activity, by account and contract: open ones
 * (held in `current`, valued now) and those that ended, and how. Its result
 * is the cash it brought in or took, plus what it's worth now while open;
 * none when its trades don't account for it (opened before the activity
 * Cheddar has), since what it cost is unknown.
 */
export function optionContracts(activity: Activity[], current: CurrentPosition[]): OptionContract[] {
  const by = new Map<string, OptionContract & { traded: number }>()
  const blank = (account: string, security: string, name: string, ticker: string) =>
    ({ account, security, name, ticker, quantity: 0, status: 'open' as OptionContract['status'], opened: '', ended: '', cash_cents: 0, value_cents: null, result_cents: null, events: [] as Activity[], traded: 0 })
  const sorted = activity.filter(a => isOption({ type: a.security_type, ticker: a.ticker })).sort((a, b) => a.date.localeCompare(b.date))
  for (const a of sorted) {
    const s = activityKey(a)
    const k = keyOf(a.account, s)
    let c = by.get(k)
    if (!c) {
      c = { ...blank(a.account, s, a.security || a.name, a.ticker), opened: a.date }
      by.set(k, c)
    }
    c.events.push(a)
    c.cash_cents += a.amount_cents
    if (ENDINGS[a.kind]) {
      c.status = ENDINGS[a.kind]!
      c.ended = a.date
    }
    else {
      c.traded += shares(a)
    }
  }
  const now = new Map<string, CurrentPosition>()
  for (const p of current) if (isOption(p) && Math.abs(p.quantity) > 1e-9) now.set(keyOf(p.account, securityKey(p)), p)
  for (const [k, p] of now) if (!by.has(k)) by.set(k, blank(p.account, securityKey(p), p.name, p.ticker))
  const out: OptionContract[] = []
  for (const [k, c] of by) {
    const held = now.get(k)
    let whole: boolean
    if (held) {
      c.status = 'open'
      c.ended = ''
      c.quantity = held.quantity
      c.value_cents = held.value_cents
      whole = Math.abs(c.traded - held.quantity) < 1e-9
    }
    else {
      if (c.status === 'open') {
        c.status = 'closed'
        c.ended = c.events.at(-1)!.date
      }
      // Expired, exercised or assigned ends it whatever the trades; else they come to nothing.
      whole = c.status !== 'closed' || Math.abs(c.traded) < 1e-9
    }
    c.result_cents = whole ? c.cash_cents + (c.value_cents ?? 0) : null
    out.push({ account: c.account, security: c.security, name: c.name, ticker: c.ticker, quantity: c.quantity, status: c.status, opened: c.opened, ended: c.ended, cash_cents: c.cash_cents, value_cents: c.value_cents, result_cents: c.result_cents, events: c.events })
  }
  return out.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.ended || b.opened).localeCompare(a.ended || a.opened))
}
