// A statement imported into a linked account, and the bank link's own
// transactions, can be the same money: a statement's rows carry the bank's
// file ids ("fitid:", "csv:"), the link's carry Plaid's ("plaid:"), so the ids
// never match. Here a row is the same as one from the other side when the
// amount is equal to the cent and the dates are at most MATCH_DAYS apart (a
// statement may give the day of the purchase where Plaid gives the day it
// posted, a weekend and a holiday later). Each row stands for one other row
// at most, so two identical coffees stay two.
//
// pb_hooks/lib/overlap.js does the same for a sync; a unit test keeps the two equal.

export const MATCH_DAYS = 4

export interface Dated { posted: string, amount_cents: number }

const DAY_MS = 86_400_000
const dayOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`)

/** Whole days between two YYYY-MM-DD dates, either way round. */
export function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(dayOf(a) - dayOf(b)) / DAY_MS)
}

/** The dates a row from `first` to `last` could match: MATCH_DAYS either side. */
export function around(first: string, last = first): { from: string, to: string } {
  const at = (ymd: string, days: number) => new Date(dayOf(ymd) + days * DAY_MS).toISOString().slice(0, 10)
  return { from: at(first, -MATCH_DAYS), to: at(last, MATCH_DAYS) }
}

/** The index of the candidate `row` is the same as, the nearest in date (the earlier on a tie), or -1. Skips the indexes in `taken`. */
export function nearest(row: Dated, candidates: Dated[], taken: Set<number> = new Set()): number {
  let best = -1
  let bestDays = MATCH_DAYS + 1
  candidates.forEach((c, i) => {
    if (taken.has(i) || c.amount_cents !== row.amount_cents) return
    const days = daysApart(row.posted, c.posted)
    if (days < bestDays || (days === bestDays && best !== -1 && c.posted < candidates[best]!.posted)) {
      best = i
      bestDays = days
    }
  })
  return best
}

/**
 * Which of a statement's rows the account already has from its bank link:
 * true for each row that's the same as one of `synced`, one for one.
 */
export function alreadySynced(rows: Dated[], synced: Dated[]): boolean[] {
  const taken = new Set<number>()
  return rows.map((row) => {
    const i = nearest(row, synced, taken)
    if (i === -1) return false
    taken.add(i)
    return true
  })
}
