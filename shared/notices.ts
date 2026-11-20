/**
 * The bell in the top bar: what's changed or needs the person, gathered
 * each time it's asked (GET /api/notices) from what Cheddar already knows.
 * Nothing is stored per notice: each one has a key that names the state it
 * is about (a bill and its date, a bank and what's wrong with it), and the
 * person's record keeps only the keys they had seen when they last opened
 * the bell, so a notice is new until then and again whenever its state
 * changes. Email alerts (shared/alerts.ts) are separate and opt-in.
 *
 * Each kind is one small function from its inputs to its notices; a new
 * kind is one more entry in NOTICE_KINDS and one more function in
 * notices(). Pure: no Intl, DOM or clock of its own.
 */
import type { CashflowEvent } from './cashflow.ts'
import type { LinkHealth } from './link-health.ts'
import type { BudgetStatus } from './budgets.ts'
import type { PriceRise } from './upcoming.ts'
import { BILL_DAYS, addDays, dayWords, money } from './alerts.ts'

export type NoticeKind = 'bank' | 'balance' | 'budget' | 'bill' | 'rise' | 'invite' | 'new' | 'stale' | 'goal'

/** Every kind, in the order the bell lists them, with how Settings names it. */
export const NOTICE_KINDS: readonly { id: NoticeKind, label: string }[] = [
  { id: 'bank', label: 'A bank that needs you to sign in again, or has stopped syncing' },
  { id: 'balance', label: 'A checking or savings balance under the amount in your email alerts' },
  { id: 'budget', label: 'A budget passed this month' },
  { id: 'bill', label: `Bills and planned payments due in the next ${BILL_DAYS} days` },
  { id: 'rise', label: 'A subscription or bill whose price went up' },
  { id: 'invite', label: 'An invitation to join a household' },
  { id: 'new', label: 'New transactions from your banks' },
  { id: 'stale', label: 'A balance you typed in that is out of date' },
  { id: 'goal', label: 'A savings goal reached' },
]

export const isNoticeKind = (v: unknown): v is NoticeKind =>
  typeof v === 'string' && NOTICE_KINDS.some(k => k.id === v)

export interface Notice {
  /** Names the state it's about: the same key is the same news. */
  key: string
  kind: NoticeKind
  /** warn: something needs the person; good: news to be glad of; info: the rest. */
  tone: 'warn' | 'info' | 'good'
  title: string
  /** One line, plain text. */
  text: string
  /** Where in Cheddar to deal with it. */
  href: string
  /** YYYY-MM-DD it's about, or ''. */
  on: string
}

/** The most keys a person's record keeps as seen (more notices than this is a lot). */
export const SEEN_MAX = 200
/** A key is short: a kind and an id or two. */
const KEY_MAX = 160

export interface NoticeInputs {
  today: string
  /** Banks the person linked, judged by shared/link-health.ts. */
  health?: LinkHealth[]
  /** Open, counted checking and savings accounts the person owns, and the amount their email alerts name (0 is off). */
  balances?: { accounts: { id: string, name: string, kind: string, balance_cents: number | null }[], under_cents: number }
  /** Categories over this month's budget (shared/budgets.ts overBudget()). */
  overBudget?: BudgetStatus[]
  /** Cash flow's forecast (shared/cashflow.ts), from the person's own accounts, and their names. */
  events?: CashflowEvent[]
  names?: Map<string, string>
  rises?: PriceRise[]
  invitations?: { id: string, name: string, invited_by: string }[]
  /** Transactions from banks and statements since the bell was last opened (or the last week). */
  fresh?: { count: number, newest: string }
  /** Typed-in balances past their age (shared/accounts.ts isStale()). */
  stale?: { id: string, name: string, balance_date: string }[]
  goals?: { id: string, name: string, target_cents: number, saved_cents: number }[]
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export function bankNotices(health: LinkHealth[]): Notice[] {
  return health.filter(h => h.state !== 'ok').map(h => ({
    key: `bank:${h.id}:${h.state}`,
    kind: 'bank',
    tone: 'warn',
    title: h.state === 'reconnect' ? `Sign in to ${h.name} again` : h.state === 'error' ? `${h.name} couldn't sync` : `${h.name} is out of date`,
    text: h.state === 'reconnect'
      ? 'Nothing new comes in from it until you do.'
      : h.state === 'error'
        ? (h.message || 'Try again from Settings.')
        : 'It hasn\'t brought anything up to date lately.',
    href: h.state === 'ok' ? '/settings#linked-banks' : `/settings?reconnect=${h.id}#linked-banks`,
    on: '',
  }))
}

export function balanceNotices(b: NonNullable<NoticeInputs['balances']>): Notice[] {
  if (b.under_cents <= 0) return []
  return b.accounts
    .filter(a => (a.kind === 'checking' || a.kind === 'savings') && a.balance_cents !== null && a.balance_cents < b.under_cents)
    .map(a => ({
      key: `balance:${a.id}`,
      kind: 'balance',
      tone: 'warn',
      title: `${a.name} is low`,
      text: `Down to ${money(a.balance_cents!)}, under the ${money(b.under_cents)} you set.`,
      href: `/spending?account=${a.id}&category=all`,
      on: '',
    }))
}

export function budgetNotices(over: BudgetStatus[], today: string): Notice[] {
  const month = today.slice(0, 7)
  return over.map(b => ({
    key: `budget:${b.id}:${month}`,
    kind: 'budget',
    tone: 'warn',
    title: `Over budget on ${b.label}`,
    text: `${money(b.spent_cents)} spent this month, against ${money(b.budget_cents)}.`,
    href: `/spending?category=${b.id}`,
    on: '',
  }))
}

export function billNotices(events: CashflowEvent[], names: Map<string, string>, today: string): Notice[] {
  const last = addDays(today, BILL_DAYS)
  return events
    .filter(e => e.amount_cents < 0 && e.date >= today && e.date <= last)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(e => ({
      key: `bill:${e.id}`,
      kind: 'bill',
      tone: 'info',
      title: `${e.name} ${e.date === today ? 'today' : e.date === addDays(today, 1) ? 'tomorrow' : `on ${dayWords(e.date)}`}`,
      text: `${money(-e.amount_cents)}${names.get(e.account) ? ` from ${names.get(e.account)}` : ''}${e.source === 'recurring' ? ', its usual charge' : ', as planned'}.`,
      href: '/spending#upcoming',
      on: e.date,
    }))
}

export function riseNotices(rises: PriceRise[]): Notice[] {
  return rises.map(r => ({
    key: `rise:${r.key}:${r.on}`,
    kind: 'rise',
    tone: 'warn',
    title: `${r.name} went up`,
    text: `From ${money(r.from_cents)} to ${money(r.to_cents)}: ${money(r.yearly_cents)} more a year.`,
    href: '/spending#upcoming',
    on: r.on,
  }))
}

export function inviteNotices(invitations: NonNullable<NoticeInputs['invitations']>): Notice[] {
  return invitations.map(i => ({
    key: `invite:${i.id}`,
    kind: 'invite',
    tone: 'info',
    title: `Join ${i.name}?`,
    text: `${i.invited_by || 'Someone'} invited you to share accounts in a household.`,
    href: '/settings#household',
    on: '',
  }))
}

export function freshNotices(fresh: NonNullable<NoticeInputs['fresh']>): Notice[] {
  if (fresh.count <= 0) return []
  return [{
    key: `new:${fresh.newest}`,
    kind: 'new',
    tone: 'info',
    title: `${plural(fresh.count, 'new transaction')}`,
    text: 'Brought in since you last looked. See what needs review.',
    href: '/spending?review=true',
    on: '',
  }]
}

export function staleNotices(stale: NonNullable<NoticeInputs['stale']>): Notice[] {
  return stale.map(a => ({
    key: `stale:${a.id}:${a.balance_date}`,
    kind: 'stale',
    tone: 'info',
    title: `${a.name}'s balance is out of date`,
    text: `Last entered ${dayWords(a.balance_date)}. Net worth and Projections use it.`,
    href: '/settings#accounts',
    on: a.balance_date,
  }))
}

export function goalNotices(goals: NonNullable<NoticeInputs['goals']>): Notice[] {
  return goals.filter(g => g.target_cents > 0 && g.saved_cents >= g.target_cents).map(g => ({
    key: `goal:${g.id}:${g.target_cents}`,
    kind: 'goal',
    tone: 'good',
    title: `You reached ${g.name}`,
    text: `${money(g.saved_cents)} saved of ${money(g.target_cents)}.`,
    href: '/goals',
    on: '',
  }))
}

/** Every notice due, in NOTICE_KINDS' order, leaving out the kinds the person turned off. */
export function notices(i: NoticeInputs, off: ReadonlySet<NoticeKind> = new Set()): Notice[] {
  const all: Notice[] = [
    ...bankNotices(i.health ?? []),
    ...(i.balances ? balanceNotices(i.balances) : []),
    ...budgetNotices(i.overBudget ?? [], i.today),
    ...billNotices(i.events ?? [], i.names ?? new Map(), i.today),
    ...riseNotices(i.rises ?? []),
    ...inviteNotices(i.invitations ?? []),
    ...(i.fresh ? freshNotices(i.fresh) : []),
    ...staleNotices(i.stale ?? []),
    ...goalNotices(i.goals ?? []),
  ]
  return all.filter(n => !off.has(n.kind))
}

/** The notices whose key wasn't among those seen. */
export const unseen = (list: Notice[], seen: readonly string[]): Notice[] => {
  const had = new Set(seen)
  return list.filter(n => !had.has(n.key))
}

export interface NoticeState {
  /** The keys shown when the bell was last opened. */
  keys: string[]
  /** When it was last opened (ISO), or ''. */
  at: string
}

/** The stored state as read from the person's record, whatever it holds. */
export function readState(v: unknown): NoticeState {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
  const keys = Array.isArray(o.keys) ? o.keys.filter((k): k is string => typeof k === 'string' && k.length <= KEY_MAX).slice(0, SEEN_MAX) : []
  const at = typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? o.at : ''
  return { keys, at }
}

/** The keys a person says they've seen, as sent: a list of short strings. */
export function checkSeen(input: unknown): { ok: string[] } | { problem: string } {
  if (!Array.isArray(input) || input.some(k => typeof k !== 'string' || !k || k.length > KEY_MAX))
    return { problem: 'Send the notices seen as a list of their keys.' }
  return { ok: [...new Set(input as string[])].slice(0, SEEN_MAX) }
}

/** The kinds a person turns off, as sent: a list of NOTICE_KINDS' ids. */
export function checkOff(input: unknown): { ok: NoticeKind[] } | { problem: string } {
  if (!Array.isArray(input) || !input.every(isNoticeKind))
    return { problem: 'Choose from the kinds of notice listed.' }
  return { ok: NOTICE_KINDS.map(k => k.id).filter(id => input.includes(id)) }
}

/** The kinds turned off, as read from the person's record. */
export const readOff = (v: unknown): NoticeKind[] =>
  Array.isArray(v) ? NOTICE_KINDS.map(k => k.id).filter(id => v.includes(id)) : []

/** Where to count new transactions from: the last look, or a week back when there's been none. */
export function freshSince(state: NoticeState, now: number): string {
  const week = new Date(now - 7 * 86_400_000).toISOString()
  return state.at && state.at > week ? state.at : week
}
