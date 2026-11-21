import type { RecordModel } from 'pocketbase'
import { asHeld, growthStart, isInvestment } from '~~/shared/overview'
import { investments } from '~~/shared/investments'
import { portfolio, type Portfolio, type Position } from '~~/shared/holdings'
import { ACTIVITY_KINDS, incomeBetween, positionChanges, securityKey, type Activity, type ActivityKind } from '~~/shared/investing'
import {
  GRAINS,
  optionContracts,
  periodsBack,
  timeline,
  type CurrentPosition,
  type Grain,
  type HistoryDay,
  type InvestmentsReport,
} from '~~/shared/investment-history'
import { listLinks } from '../bank-links'
import { expandSplits } from '~~/shared/splits'
import { counted } from '../accounts'
import { balanceHistory, transactionsBetween } from '../transactions'
import type { Session } from '../session'

/**
 * The Investments page's read model (shared/investments.ts): the counted
 * brokerage and retirement accounts, their history, and the transfers in and
 * out of them, which aren't growth.
 */
export async function investmentsReport(s: Session, today: string): Promise<InvestmentsReport> {
  const all = (await counted(s)).filter(a => isInvestment(a.kind))
  if (!all.length) {
    return {
      ...investments([], [], [], today),
      holdings: { ...portfolio([], [], false), on: false },
      activity: { rows: [], income_12m_cents: 0 },
      timeline: { month: [], quarter: [] },
      options: [],
    }
  }
  const ids = new Set(all.map(a => a.id))
  // Daily balances for the last year (the longest period but "All"), each month's first and last before.
  const history = (
    await balanceHistory(s, { dailyFrom: growthStart('1y', today) })
  ).filter(p => ids.has(p.account))
  const oldest = history.reduce((d, p) => (p.date < d ? p.date : d), today)
  // Totals count a split one as its parts (shared/splits.ts).
  const transfers = expandSplits(
    await transactionsBetween(s, oldest, today, {
      counted: true,
      // Only these accounts' rows: record ids are PocketBase's own, checked before they go in the filter.
      extra: `(${[...ids].filter(id => /^[a-z0-9]{15}$/.test(id)).map(id => `account = '${id}'`).join(' || ') || 'id = \'\''})`,
    }),
  ).filter(r => ids.has(r.account) && r.category === 'transfer')
  const periods = Object.fromEntries(GRAINS.map(g => [g.id, periodsBack(today, g.id, g.count)])) as Record<Grain, ReturnType<typeof periodsBack>>
  const [positions, activityRows, days] = await Promise.all([
    s.collection('holdings').getFullList({ sort: '-value_cents' }),
    activityOf(s, ids, today),
    periodEnds(s, Object.values(periods).flatMap(list => [dayBefore(list[0]!.from), ...list.map(p => p.to)]), today),
  ])
  const holdings = await holdingsOf(s, all, positions, today)
  const current: CurrentPosition[] = positions.map(r => ({
    account: r.account,
    name: r.name ?? '',
    ticker: r.ticker ?? '',
    type: r.type || 'other',
    quantity: r.quantity ?? 0,
    value_cents: r.value_cents ?? 0,
  }))
  // Share counts are worked back only for accounts whose positions Cheddar has.
  const covered = new Set(Object.entries(holdings.accounts).filter(([, h]) => !h.gap && h.positions.length).map(([id]) => id))
  const { open, history: held } = asHeld(all, history)
  const now = new Map(open.filter(a => a.balance_cents !== null).map(a => [a.id, a.balance_cents!]))
  const timelineOf = (g: Grain) => timeline({ periods: periods[g], balances: held, now, covered, current, history: days, activity: activityRows, transfers })
  return {
    ...investments(all, history, transfers, today),
    holdings,
    activity: { rows: activityRows.slice(0, ACTIVITY_SHOWN), income_12m_cents: incomeBetween(activityRows, shiftYears(today, -1), today) },
    timeline: { month: timelineOf('month'), quarter: timelineOf('quarter') },
    options: optionContracts(activityRows, current.filter(p => covered.has(p.account))),
  }
}

/**
 * holding_history near each of `ends` (each period's end, and the day
 * before each grain's first): the week up to it, which holds the
 * last day each account synced in all but a link left a week or more
 * without one. Read as the person, so only their own.
 */
async function periodEnds(s: Session, ends: string[], today: string): Promise<HistoryDay[]> {
  const week = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)
  const days = [...new Set(ends.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today))]
  if (!days.length) return []
  const params: Record<string, string> = {}
  const clauses = days.map((d, i) => {
    params[`f${i}`] = week(d)
    params[`t${i}`] = d
    return `(date >= {:f${i}} && date <= {:t${i}})`
  })
  const rows = await s.collection('holding_history').getFullList({
    fields: 'account,date,security,name,ticker,type,value_cents,quantity',
    filter: s.filter(`(${clauses.join(' || ')})`, params),
  })
  return rows.map(r => ({
    account: r.account,
    date: r.date,
    security: r.security,
    name: r.name ?? '',
    ticker: r.ticker ?? '',
    type: r.type ?? '',
    value_cents: r.value_cents ?? 0,
    quantity: r.quantity ?? 0,
  }))
}

const ACTIVITY_SHOWN = 200
const KINDS = new Set<ActivityKind>(ACTIVITY_KINDS)

/**
 * The investment accounts' buys, sells, dividends and the rest over the
 * last two years (`investment_activity`, the person's own by its rules),
 * newest first.
 */
async function activityOf(s: Session, ids: Set<string>, today: string): Promise<Activity[]> {
  return (
    await s.collection('investment_activity').getFullList({ sort: '-date,-created', filter: s.filter('date >= {:from}', { from: shiftYears(today, -2) }) })
  )
    .filter(r => ids.has(r.account))
    .map((r): Activity => ({
      id: r.id,
      account: r.account,
      date: r.date,
      kind: KINDS.has(r.kind) ? r.kind : 'other',
      name: r.name ?? '',
      security: r.security ?? '',
      ticker: r.ticker ?? '',
      quantity: r.quantity ?? 0,
      price_cents: r.price_cents || null,
      amount_cents: r.amount_cents ?? 0,
      fees_cents: r.fees_cents || null,
      security_type: r.security_type ?? '',
    }))
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)

function shiftYears(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * What the open investment accounts hold, position by position, and the
 * allocation (shared/holdings.ts). Positions are the person's own (the
 * `holdings` collection's rules); which link keeps each account, and why it
 * has none, comes from the bank-link routes.
 */
async function holdingsOf(
  s: Session,
  all: { id: string, balance_cents: number | null, owned?: boolean, closed_on: string }[],
  rows: RecordModel[],
  today: string,
): Promise<Portfolio & { on: boolean }> {
  const open = all.filter(a => !(a.closed_on && a.closed_on <= today))
  const [links, days] = await Promise.all([
    listLinks(s).catch(() => ({ enabled: false, links: [], holdings: false })),
    s.collection('holding_history').getFullList({
      fields: 'account,date,security,value_cents,quantity',
      filter: s.filter('date >= {:from}', { from: new Date(Date.parse(`${today}T00:00:00Z`) - 31 * 86400000).toISOString().slice(0, 10) }),
    }),
  ])
  const changes = positionChanges(days.map(d => ({ account: d.account, date: d.date, security: d.security, value_cents: d.value_cents ?? 0, quantity: d.quantity ?? 0 })), today)
  const linkOf = new Map<string, { id: string, holdings: string }>()
  for (const l of links.links) for (const a of l.accounts) linkOf.set(a.id, { id: l.id, holdings: l.holdings ?? '' })
  const positions: Position[] = rows.map(r => ({
    account: r.account,
    name: r.name ?? '',
    ticker: r.ticker ?? '',
    type: r.type || 'other',
    quantity: r.quantity ?? 0,
    // PocketBase keeps a missing number as 0: no price or cost basis is 0.
    price_cents: r.price_cents || null,
    value_cents: r.value_cents ?? 0,
    cost_basis_cents: r.cost_basis_cents || null,
    price_as_of: r.price_as_of ?? '',
    as_of: r.as_of ?? '',
    change: changes.get(`${r.account}|${securityKey({ name: r.name, ticker: r.ticker, type: r.type })}`) ?? null,
  }))
  const on = !!links.holdings
  return {
    ...portfolio(
      open.map(a => ({ id: a.id, balance_cents: a.balance_cents, owned: a.owned !== false, link: linkOf.get(a.id) ?? null })),
      positions,
      on,
    ),
    on,
  }
}
