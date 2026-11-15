/**
 * Holdings on the Investments page (issue #90): what each brokerage and
 * retirement account holds, as its bank last reported it, and the
 * portfolio's allocation by kind of security across the accounts that have
 * positions. Accounts without positions keep counting by their balance and
 * are named, with why, rather than left out. Pure: the server and the tests
 * share it. Not advice: it shows what's held, nothing about what to hold.
 */

export interface Position {
  account: string
  name: string
  ticker: string
  /** equity, etf, mutual fund, fixed income, cash, derivative, cryptocurrency, loan, other */
  type: string
  quantity: number
  /** The bank's price for one, or null. */
  price_cents: number | null
  value_cents: number
  /** What was paid for it, when the bank says; null otherwise. */
  cost_basis_cents: number | null
  /** The day the bank's price is from (YYYY-MM-DD), or ''. */
  price_as_of: string
  /** When Cheddar fetched it (PocketBase's date format). */
  as_of: string
}

/**
 * Why an account has no positions: manual (added by hand, no bank to ask),
 * off (this Cheddar doesn't ask for holdings), consent (the person hasn't
 * shared them with this link: sign in to the bank again), unsupported (the
 * bank doesn't offer them), pending (the next sync brings them), shared
 * (someone else's account: only its balance is shared), empty (the bank says
 * it holds nothing), or '' when it has positions.
 */
export type HoldingsGap = '' | 'manual' | 'off' | 'consent' | 'unsupported' | 'pending' | 'shared' | 'empty'

export interface AccountHoldings {
  positions: Position[]
  /** The positions added up. */
  value_cents: number
  /** When they were fetched, the newest; '' with none. */
  as_of: string
  gap: HoldingsGap
  /** The link to sign in to again, for `consent`. */
  link: string
}

export interface Allocation {
  type: string
  label: string
  value_cents: number
  /** Of the positions' total, 0 to 1. */
  share: number
}

export interface Portfolio {
  /** Each investment account's positions, by account id. */
  accounts: Record<string, AccountHoldings>
  /** By kind of security, biggest first, over the accounts with positions. */
  allocation: Allocation[]
  /** What the positions come to. */
  covered_cents: number
  /** What the accounts without positions hold, by their balances: not in the allocation. */
  uncovered_cents: number
}

export const TYPE_LABELS: Record<string, string> = {
  'equity': 'Stocks',
  'etf': 'ETFs',
  'mutual fund': 'Mutual funds',
  'fixed income': 'Bonds',
  'cash': 'Cash',
  'derivative': 'Options',
  'cryptocurrency': 'Crypto',
  'loan': 'Loans',
  'other': 'Other',
}

/**
 * The portfolio of `accounts` (the open, counted investment accounts, each
 * with whether it's the person's own and the link that keeps it, if any)
 * from `positions` and its links' holdings states.
 */
export function portfolio(
  accounts: { id: string, balance_cents: number | null, owned: boolean, link: { id: string, holdings: string } | null }[],
  positions: Position[],
  holdingsOn: boolean,
): Portfolio {
  const out: Record<string, AccountHoldings> = {}
  const types = new Map<string, number>()
  let covered = 0
  let uncovered = 0
  for (const a of accounts) {
    const mine = positions.filter(p => p.account === a.id).sort((x, y) => y.value_cents - x.value_cents)
    const value = mine.reduce((n, p) => n + p.value_cents, 0)
    const gap: HoldingsGap = mine.length
      ? ''
      : !a.owned ? 'shared'
          : !a.link ? 'manual'
              : !holdingsOn ? 'off'
                  : a.link.holdings === 'consent' ? 'consent'
                    : a.link.holdings === 'unsupported' ? 'unsupported'
                      : a.link.holdings === 'ok' ? 'empty' : 'pending'
    out[a.id] = {
      positions: mine,
      value_cents: value,
      as_of: mine.reduce((d, p) => (p.as_of > d ? p.as_of : d), ''),
      gap,
      link: a.link?.id ?? '',
    }
    if (mine.length) {
      covered += value
      for (const p of mine) types.set(p.type, (types.get(p.type) ?? 0) + p.value_cents)
    }
    else uncovered += a.balance_cents ?? 0
  }
  const allocation = [...types]
    .map(([type, value_cents]) => ({ type, label: TYPE_LABELS[type] ?? 'Other', value_cents, share: covered > 0 ? value_cents / covered : 0 }))
    .sort((x, y) => y.value_cents - x.value_cents)
  return { accounts: out, allocation, covered_cents: covered, uncovered_cents: uncovered }
}
