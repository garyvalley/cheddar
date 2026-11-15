/**
 * The Investments page's numbers: the brokerage and retirement accounts,
 * what they hold now, how they grew over each period (shared/overview.ts
 * growth(), for all of them and for each one), and what they held at the end
 * of each of the last 12 months. Pure, so the unit tests and the server use
 * the same sums.
 */
import {
  GROWTH_PERIODS,
  asHeld,
  balancesOn,
  growth,
  isInvestment,
  lastMonths,
  type BalancePoint,
  type Growth,
  type Holding,
} from './overview.ts'

export interface InvestmentAccount {
  id: string
  name: string
  kind: string
  institution: string
  last4: string
  balance_cents: number | null
  balance_date: string
  linked: boolean
  closed_on: string
  /** Each period's growth of this account alone. */
  growth: Growth[]
}

export interface InvestmentMonth {
  /** "2026-11" */
  month: string
  /** "Nov" */
  label: string
  /** What the investment accounts held at the month's end (today, for this month); null when none had a balance yet. */
  value_cents: number | null
}

export interface Investments {
  /** What the open investment accounts hold now. */
  total_cents: number
  /** The newest balance's date. */
  as_of: string
  accounts: InvestmentAccount[]
  growth: Growth[]
  months: InvestmentMonth[]
}

type Account = Holding & { institution: string, last4: string, linked: boolean, closed_on: string }

const monthLabel = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** The last day of "YYYY-MM". */
function monthEnd(month: string): string {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

/**
 * `all` is every counted account (any kind), `history` their balances over
 * time, and `transfers` the money moved in or out of them between the
 * person's own accounts (which isn't growth).
 */
export function investments(
  all: Account[],
  history: BalancePoint[],
  transfers: { account: string, posted: string, amount_cents: number }[],
  today: string,
): Investments {
  const mine = all.filter(a => isInvestment(a.kind))
  const ids = new Set(mine.map(a => a.id))
  const { open, accounts, history: held } = asHeld(mine, history.filter(p => ids.has(p.account)))
  const heldById = new Map(accounts.map(a => [a.id, a]))
  const valued = open.filter(a => a.balance_cents !== null)
  const withBalance = accounts.filter(a => a.balance_cents !== null)

  const months = lastMonths(today, 12).map((month) => {
    const end = monthEnd(month) < today ? monthEnd(month) : today
    // This month's value is what the accounts show now, which may be newer than their history.
    if (end === today) {
      return { month, label: monthLabel(month), value_cents: valued.length ? valued.reduce((n, a) => n + a.balance_cents!, 0) : null }
    }
    const on = balancesOn(held, end)
    return { month, label: monthLabel(month), value_cents: on.size ? [...on.values()].reduce((n, c) => n + c, 0) : null }
  })

  return {
    total_cents: valued.reduce((n, a) => n + a.balance_cents!, 0),
    as_of: valued.reduce((d, a) => (a.balance_date > d ? a.balance_date : d), ''),
    accounts: mine
      .slice()
      .sort((a, b) => (a.closed_on ? 1 : 0) - (b.closed_on ? 1 : 0) || Math.abs(b.balance_cents ?? 0) - Math.abs(a.balance_cents ?? 0))
      .map(a => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        institution: a.institution,
        last4: a.last4,
        balance_cents: a.balance_cents,
        balance_date: a.balance_date,
        linked: a.linked,
        closed_on: a.closed_on,
        growth: a.balance_cents === null
          ? []
          : GROWTH_PERIODS.map(p => growth([heldById.get(a.id)!], held, transfers, p.id, today)),
      })),
    growth: GROWTH_PERIODS.map(p => growth(withBalance, held, transfers, p.id, today)),
    months,
  }
}
