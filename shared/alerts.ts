/**
 * Alerts by email (issue #105). Each person picks what they want to hear
 * about (`alert_settings`, Settings → Alerts):
 *   - a charge over an amount,
 *   - a cash account's balance under an amount,
 *   - a bill or planned payment due in the next 3 days (Cash flow's
 *     forecast, from Recurring and the planned items),
 *   - a budget passed this month,
 *   - a bank that needs signing in to again, or has stopped syncing
 *     (shared/link-health.ts),
 *   - a summary of the week, on Mondays.
 *
 * The hooks (pb_hooks/alerts.pb.js, glue/alerts.js) read the data, ask these
 * which alerts are due, keep a key for each one sent so it's sent once, and
 * email what's new as one message. Pure and built for the hooks
 * (scripts/gen-hooks.mjs): no Intl, DOM or clock of its own.
 */
import type { CashflowEvent } from './cashflow.ts'
import type { LinkHealth } from './link-health.ts'
import type { BudgetStatus } from './budgets.ts'
import { parseAmount } from './transactions.ts'

/** How many days ahead a bill is said to be due. */
export const BILL_DAYS = 3
/** The largest amount an alert can be set at: $10 million. */
export const MAX_ALERT_CENTS = 1_000_000_000

export interface AlertSettings {
  /** A charge of at least this much; 0 is off. */
  charge_over_cents: number
  /** A cash account's balance under this; 0 is off. */
  balance_under_cents: number
  bills: boolean
  budgets: boolean
  banks: boolean
  weekly: boolean
}

export const NO_ALERTS: AlertSettings = {
  charge_over_cents: 0, balance_under_cents: 0, bills: false, budgets: false, banks: false, weekly: false,
}

export const anyOn = (s: AlertSettings) =>
  s.charge_over_cents > 0 || s.balance_under_cents > 0 || s.bills || s.budgets || s.banks || s.weekly

function amountOf(input: unknown, what: string): { cents: number } | { problem: string } {
  if (input === null || input === undefined || input === '' || input === 0 || input === '0') return { cents: 0 }
  const parsed = parseAmount(input)
  if (!parsed || parsed.negative) return { problem: `The ${what} must be an amount of money, like 500.` }
  const cents = parsed.cents
  if (cents > MAX_ALERT_CENTS) return { problem: `The ${what} can be at most $10,000,000.` }
  return { cents }
}

/**
 * Alert settings as Settings sends them: the two amounts as typed ("500",
 * or "" for off) and the switches. Answers { ok } or { problem } in words.
 */
export function checkAlertSettings(input: Record<string, unknown>): { ok: AlertSettings } | { problem: string } {
  const charge = amountOf(input.charge_over, 'charge amount')
  if ('problem' in charge) return charge
  const balance = amountOf(input.balance_under, 'balance amount')
  if ('problem' in balance) return balance
  return {
    ok: {
      charge_over_cents: charge.cents,
      balance_under_cents: balance.cents,
      bills: input.bills === true,
      budgets: input.budgets === true,
      banks: input.banks === true,
      weekly: input.weekly === true,
    },
  }
}

export type AlertKind = 'charge' | 'balance' | 'bill' | 'budget' | 'bank' | 'weekly'

export interface Alert {
  /** Sent once per key (the hooks keep the ones sent). */
  key: string
  kind: AlertKind
  /** One line, plain text. */
  text: string
}

/**
 * Lasting alerts are about a state (a low balance, a bank needing sign-in):
 * the hooks keep their key only while it holds, so it's said again the next
 * time it happens, not every hour while it does.
 */
export const LASTING: ReadonlySet<AlertKind> = new Set(['balance', 'bank'])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "2026-11-20" → "Fri, Nov 20". */
export function dayWords(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** 123456 → "$1,234.56"; -500 → "-$5.00". */
export function money(cents: number): string {
  const size = Math.abs(Math.round(cents))
  const dollars = String(Math.floor(size / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${cents < 0 ? '-' : ''}$${dollars}.${String(size % 100).padStart(2, '0')}`
}

export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** New charges (money out, posted) of at least `over`. */
export function chargeAlerts(
  rows: { id: string, posted: string, amount_cents: number, name: string, account_name: string }[],
  over: number,
): Alert[] {
  if (over <= 0) return []
  return rows
    .filter(r => r.amount_cents < 0 && -r.amount_cents >= over)
    .map(r => ({
      key: `charge:${r.id}`,
      kind: 'charge' as const,
      text: `${r.name}: ${money(-r.amount_cents)} from ${r.account_name} on ${dayWords(r.posted)}.`,
    }))
}

const CASH_KINDS = new Set(['checking', 'savings'])

/** Open, counted checking and savings accounts with a balance under `under`. */
export function balanceAlerts(
  accounts: { id: string, name: string, kind: string, balance_cents: number | null, excluded: boolean, closed_on: string }[],
  under: number,
  today: string,
): Alert[] {
  if (under <= 0) return []
  return accounts
    .filter(a => CASH_KINDS.has(a.kind) && !a.excluded && !(a.closed_on && a.closed_on <= today)
      && a.balance_cents !== null && a.balance_cents < under)
    .map(a => ({
      key: `balance:${a.id}`,
      kind: 'balance' as const,
      text: `${a.name} is down to ${money(a.balance_cents!)}, under the ${money(under)} you set.`,
    }))
}

/** Money going out in the next BILL_DAYS days, from Cash flow's forecast. */
export function billAlerts(events: CashflowEvent[], names: Map<string, string>, today: string): Alert[] {
  const last = addDays(today, BILL_DAYS)
  return events
    .filter(e => e.amount_cents < 0 && e.date >= today && e.date <= last)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(e => ({
      key: `bill:${e.id}`,
      kind: 'bill' as const,
      text: `${e.name}: ${money(-e.amount_cents)} ${e.date === today ? 'today' : `on ${dayWords(e.date)}`}${names.get(e.account) ? ` from ${names.get(e.account)}` : ''}.`,
    }))
}

/** Budgets passed in `month` (YYYY-MM), once each a month. */
export function budgetAlerts(over: BudgetStatus[], month: string): Alert[] {
  return over.map(b => ({
    key: `budget:${b.id}:${month}`,
    kind: 'budget' as const,
    text: `${b.label}: ${money(b.spent_cents)} spent this month, over its ${money(b.budget_cents)} budget.`,
  }))
}

/** Banks that need the person: signing in again, a failed sync, or no news lately. */
export function bankAlerts(health: LinkHealth[]): Alert[] {
  return health.filter(h => h.state !== 'ok').map(h => ({
    key: `bank:${h.id}:${h.state}`,
    kind: 'bank' as const,
    text: h.state === 'reconnect'
      ? `${h.name} needs you to sign in to it again before Cheddar can bring anything new in.`
      : h.state === 'error'
        ? `${h.name} couldn't sync${h.message ? `: ${h.message}` : '.'}`
        : `${h.name} hasn't brought anything up to date lately.`,
  }))
}

/**
 * The week before Monday `today`: money out and in, and where most of it
 * went. `categories` are the week's totals (summarize()'s).
 */
export function weeklyAlert(
  today: string,
  categories: { label: string, spending: boolean, total_cents: number }[],
  income_cents: number,
): Alert {
  const spending = categories.filter(c => c.spending && c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents)
  const spent = spending.reduce((n, c) => n + c.total_cents, 0)
  const top = spending.slice(0, 3).map(c => `${c.label} ${money(c.total_cents)}`).join(', ')
  return {
    key: `weekly:${today}`,
    kind: 'weekly',
    text: `Last week: ${money(spent)} spent${top ? ` (${top})` : ''}, ${money(income_cents)} came in.`,
  }
}

/** The alerts not sent yet (`sent` holds the keys kept), in the email's order. */
export function due(alerts: Alert[], sent: ReadonlySet<string>): Alert[] {
  const order: AlertKind[] = ['bank', 'charge', 'balance', 'bill', 'budget', 'weekly']
  const seen = new Set<string>()
  return alerts
    .filter(a => !sent.has(a.key) && !seen.has(a.key) && seen.add(a.key))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

const HEADINGS: Record<AlertKind, string> = {
  bank: 'Your banks',
  charge: 'Charges',
  balance: 'Low balances',
  bill: 'Coming up',
  budget: 'Budgets',
  weekly: 'Your week',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}

/** One email for `alerts` (due()'s, at least one), linking to Cheddar at `appUrl`. */
export function alertEmail(alerts: Alert[], appUrl: string): { subject: string, html: string } {
  const subject = alerts.length === 1
    ? (alerts[0]!.kind === 'weekly' ? 'Your week in Cheddar' : `Cheddar: ${alerts[0]!.text}`)
    : `Cheddar: ${alerts.length} things to know`
  const sections: string[] = []
  for (const kind of Object.keys(HEADINGS) as AlertKind[]) {
    const mine = alerts.filter(a => a.kind === kind)
    if (!mine.length) continue
    sections.push(`<h2 style="margin:20px 0 8px;font-size:16px;color:#1b1a20">${HEADINGS[kind]}</h2>`
      + mine.map(a => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3d3a33">${escapeHtml(a.text)}</p>`).join(''))
  }
  const base = appUrl.replace(/\/$/, '')
  const link = base
    ? `<p style="margin:24px 0 0;font-size:14px;color:#6b6776"><a href="${escapeHtml(base)}/" style="color:#6d3fc0">Open Cheddar</a> · <a href="${escapeHtml(base)}/settings#alerts" style="color:#6d3fc0">Change your alerts</a></p>`
    : ''
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f9;padding:40px 20px"><tr><td align="center">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px"><tr><td style="padding:32px">'
    + '<h1 style="margin:0;font-size:22px;font-weight:700;color:#1b1a20">From Cheddar</h1>'
    + sections.join('') + link
    + '</td></tr></table></td></tr></table></body></html>'
  return { subject: subject.length > 120 ? `${subject.slice(0, 117)}...` : subject, html }
}

/** How recent a new charge must be to be told about: an imported statement's old rows aren't news. */
export const CHARGE_DAYS = 7

// What the hooks need besides, so they take one build (pb_hooks/lib/gen/alerts.js).
export { recurring, LOOKBACK_YEARS } from './recurring.ts'
export { cashflowForecast } from './cashflow.ts'
export { linkHealth } from './link-health.ts'
export { carryFrom, overBudget, withCarry } from './budgets.ts'
export { summarize } from './categories.ts'
export { expandSplits } from './splits.ts'
