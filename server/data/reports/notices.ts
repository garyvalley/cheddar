import { isStale } from '~~/shared/accounts'
import { BILL_DAYS } from '~~/shared/alerts'
import { overBudget } from '~~/shared/budgets'
import { summarize } from '~~/shared/categories'
import { linkHealth } from '~~/shared/link-health'
import {
  freshSince,
  notices,
  readOff,
  readState,
  unseen,
  type Notice,
  type NoticeInputs,
  type NoticeKind,
  type NoticeState,
} from '~~/shared/notices'
import { expandSplits } from '~~/shared/splits'
import { todayIn } from '~~/shared/time-zone'
import { upcoming, UPCOMING_DAYS } from '~~/shared/upcoming'
import { getAlertSettings } from '../alerts'
import { listLinks } from '../bank-links'
import { budgetsForMonth } from '../budgets'
import { listCategories } from '../categories'
import { listGoals } from '../goals'
import { callerId, type Session } from '../session'
import { listAccounts } from '../accounts'
import { accountScope, transactionFilter, transactionsBetween } from '../transactions'
import { forecastAhead } from './upcoming'

/**
 * The bell (shared/notices.ts): each kind's inputs, read as the caller, and
 * which notices they haven't seen. Each read is on its own: one that fails
 * leaves its kind out rather than the bell empty.
 */

export interface Notices {
  notices: Notice[]
  /** Keys of the notices not seen when the bell was last opened. */
  unseen: string[]
  off: NoticeKind[]
}

/** The bell's state on the caller's own record (users.notices_seen, users.notices_off). */
export async function noticeState(s: Session): Promise<{ state: NoticeState, off: NoticeKind[], time_zone: string }> {
  const r = await s.collection('users').getOne(callerId(s), { fields: 'time_zone,notices_seen,notices_off' })
  return { state: readState(r.notices_seen), off: readOff(r.notices_off), time_zone: r.time_zone ?? '' }
}

const quietly = <T>(run: () => Promise<T>): Promise<T | undefined> => run().catch(() => undefined)

/** Transactions from banks and statements created since `since` (ISO), a new link's history aside. */
async function fresh(s: Session, since: string): Promise<NoticeInputs['fresh']> {
  const scope = await accountScope(s, {})
  const filter = `${transactionFilter(s, { history: false }, scope)} && source != 'manual' && created > ${s.filter('{:since}', { since: since.replace('T', ' ') })}`
  const page = await s.collection('transactions').getList(1, 1, { filter, sort: '-created', fields: 'id,created' })
  return { count: page.totalItems, newest: page.items[0]?.id ?? '' }
}

/** Categories over this month's budget, with what rolled over, as Overview counts them. */
async function overThisMonth(s: Session, today: string) {
  const month = today.slice(0, 7)
  const [rows, list, budgets] = await Promise.all([
    transactionsBetween(s, `${month}-01`, `${month}-31`),
    listCategories(s),
    budgetsForMonth(s, month),
  ])
  const totals = summarize(expandSplits(rows).filter(r => !r.excluded), list).categories
  return overBudget(totals, budgets.map(b => ({ category: b.category, budget_cents: b.amount_cents + b.carry_cents })))
}

export async function noticesFor(s: Session, now = Date.now()): Promise<Notices> {
  const { state, off, time_zone } = await noticeState(s)
  const today = todayIn(time_zone, new Date(now))
  const wants = (k: NoticeKind) => !off.includes(k)
  const days = Math.max(BILL_DAYS + 1, UPCOMING_DAYS)
  const [accounts, links, settings, ahead, over, household, goals, recent] = await Promise.all([
    quietly(() => listAccounts(s, true)),
    wants('bank') ? quietly(() => listLinks(s)) : undefined,
    wants('balance') ? quietly(() => getAlertSettings(s)) : undefined,
    wants('bill') || wants('rise') ? quietly(() => forecastAhead(s, today, days)) : undefined,
    wants('budget') ? quietly(() => overThisMonth(s, today)) : undefined,
    wants('invite') ? quietly(() => s.send<{ invitations?: NoticeInputs['invitations'] }>('/api/household', { method: 'GET' })) : undefined,
    wants('goal') ? quietly(() => listGoals(s)) : undefined,
    wants('new') ? quietly(() => fresh(s, freshSince(state, now))) : undefined,
  ])
  const owned = accounts ?? []
  const open = owned.filter(a => !a.excluded && !(a.closed_on && a.closed_on <= today))
  const list = notices({
    today,
    health: links ? linkHealth(links.links, now, today) : [],
    balances: settings ? { accounts: open, under_cents: settings.balance_under_cents } : undefined,
    overBudget: over,
    events: ahead?.events,
    names: new Map(owned.map(a => [a.id, a.name])),
    rises: ahead ? upcoming(ahead.events, ahead.detected, today).rises : [],
    invitations: household?.invitations,
    fresh: recent,
    stale: owned.filter(a => isStale(a, today)),
    goals,
  }, new Set(off))
  return { notices: list, unseen: unseen(list, state.keys).map(n => n.key), off }
}

/** The bell was opened: these are the notices the caller has now seen. */
export async function markSeen(s: Session, keys: string[], now = Date.now()): Promise<void> {
  await s.collection('users').update(callerId(s), { notices_seen: { keys, at: new Date(now).toISOString() } })
}

export async function setNoticesOff(s: Session, off: NoticeKind[]): Promise<NoticeKind[]> {
  const r = await s.collection('users').update(callerId(s), { notices_off: off })
  return readOff(r.notices_off)
}
