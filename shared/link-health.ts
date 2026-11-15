// How current each bank link's data is, for Overview's "Linked banks" card
// (issue #88). A link is judged by its own last successful sync and each of
// its accounts' balance dates, never by the newest transaction: a sync that
// worked and found nothing new is healthy. Pure: no Intl, no clock of its own.
import type { BankLink } from './bank-links.ts'

/** A link whose last successful sync is older than this is out of date (it syncs at least daily). */
export const SYNC_STALE_HOURS = 36
/** A linked account whose balance is dated more than this many days before today is out of date. */
export const BALANCE_STALE_DAYS = 3

export interface LinkedAccountHealth {
  id: string
  name: string
  last4: string
  /** YYYY-MM-DD, or '' with no balance yet. */
  balance_date: string
  stale: boolean
}

export interface LinkHealth {
  id: string
  name: string
  /**
   * ok; stale (no successful sync lately, or a balance that's old);
   * error (the last sync failed, and trying again may work);
   * reconnect (the person has to sign in to the bank again).
   */
  state: 'ok' | 'stale' | 'error' | 'reconnect'
  /** What went wrong, as the person should read it; '' when nothing did. */
  message: string
  /** PocketBase's date format, or '' before the first sync worked. */
  last_synced: string
  /** The open, counted accounts it keeps, each with its balance's date. */
  accounts: LinkedAccountHealth[]
}

const DAY_MS = 86_400_000
const dayMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`)

/**
 * Each link's health at `now` (epoch ms) on the person's `today`
 * (YYYY-MM-DD). Accounts closed by today or left out don't count.
 */
export function linkHealth(links: BankLink[], now: number, today: string): LinkHealth[] {
  return links.map((l) => {
    const accounts = l.accounts
      .filter(a => !a.excluded && !(a.closed_on && a.closed_on <= today))
      .map(a => ({
        id: a.id,
        name: a.name,
        last4: a.last4,
        balance_date: a.balance_date,
        stale: !a.balance_date || (dayMs(today) - dayMs(a.balance_date)) / DAY_MS > BALANCE_STALE_DAYS,
      }))
    const synced = l.last_synced ? Date.parse(l.last_synced.replace(' ', 'T')) : Number.NaN
    const old = Number.isNaN(synced) || now - synced > SYNC_STALE_HOURS * 3_600_000
    const state: LinkHealth['state'] = l.status === 'reconnect'
      ? 'reconnect'
      : l.status === 'error' ? 'error' : old || accounts.some(a => a.stale) ? 'stale' : 'ok'
    return { id: l.id, name: l.institutions.length ? l.institutions.join(', ') : 'Linked bank', state, message: l.message, last_synced: l.last_synced, accounts }
  })
}

/** The links that need a look, worst first: sign in again, then failed, then out of date. */
export function needsAttention(health: LinkHealth[]): LinkHealth[] {
  const rank = { reconnect: 0, error: 1, stale: 2, ok: 3 }
  return health.filter(h => h.state !== 'ok').sort((a, b) => rank[a.state] - rank[b.state])
}
