import { growthStart, isInvestment } from '~~/shared/overview'
import { investments, type Investments } from '~~/shared/investments'
import { portfolio, type Portfolio, type Position } from '~~/shared/holdings'
import { incomeBetween, positionChanges, securityKey, type Activity, type ActivityKind } from '~~/shared/investing'
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
export async function investmentsReport(
  s: Session,
  today: string,
): Promise<Investments & { holdings: Portfolio & { on: boolean }, activity: InvestmentActivity }> {
  const all = (await counted(s)).filter(a => isInvestment(a.kind))
  if (!all.length) return { ...investments([], [], [], today), holdings: { ...portfolio([], [], false), on: false }, activity: { rows: [], income_12m_cents: 0 } }
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
  const [holdings, activity] = await Promise.all([holdingsOf(s, all, today), activityOf(s, ids, today)])
  return { ...investments(all, history, transfers, today), holdings, activity }
}

export interface InvestmentActivity {
  /** The newest first, at most ACTIVITY_SHOWN. */
  rows: Activity[]
  /** Dividends and interest over the last 12 months. */
  income_12m_cents: number
}

const ACTIVITY_SHOWN = 200
const KINDS = new Set<ActivityKind>(['buy', 'sell', 'dividend', 'interest', 'deposit', 'withdrawal', 'fee', 'other'])

/**
 * The investment accounts' buys, sells, dividends and the rest
 * (`investment_activity`, the person's own by its rules), newest first, and
 * what dividends and interest paid over the last year.
 */
async function activityOf(s: Session, ids: Set<string>, today: string): Promise<InvestmentActivity> {
  const from = shiftYears(today, -1)
  const rows = (
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
    }))
  return { rows: rows.slice(0, ACTIVITY_SHOWN), income_12m_cents: incomeBetween(rows, from, today) }
}

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
  today: string,
): Promise<Portfolio & { on: boolean }> {
  const open = all.filter(a => !(a.closed_on && a.closed_on <= today))
  const [links, rows, days] = await Promise.all([
    listLinks(s).catch(() => ({ enabled: false, links: [], holdings: false })),
    s.collection('holdings').getFullList({ sort: '-value_cents' }),
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
