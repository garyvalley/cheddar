/**
 * The rules for a transaction a person adds or changes by hand (Spending),
 * and for searching them by amount. Pure, so the browser checks a form the
 * same way the server does.
 *
 * - One added by hand (`source: 'manual'`, only in an account no bank link
 *   keeps up to date) is the person's own: every field can change, and it can
 *   be deleted.
 * - One from a bank or a statement keeps the bank's date, amount and words;
 *   only the payee (the name it's shown and grouped by), a note and whether
 *   it's left out can change.
 * - Its category is never set here: pb_hooks/categories.pb.js alone sorts it.
 */

export const NOTE_MAX = 1000
export const DESCRIPTION_MAX = 500
export const PAYEE_MAX = 200

/** Money in or out, for a form that asks which rather than for a sign. */
export type Direction = 'out' | 'in'

const LARGEST = 100_000_000_000_00

/**
 * An amount a person types ("1,234.56", "$80", "12"), as whole cents, or
 * null. A sign typed with it is answered separately: `negative`.
 */
export function parseAmount(input: unknown): { cents: number, negative: boolean } | null {
  const text = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : ''
  const m = /^([-−+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(text)
  if (!text || !m || (m[2] === undefined && m[3] === undefined)) return null
  const cents = Number((m[2] ?? '0').replace(/,/g, '')) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > LARGEST) return null
  return { cents, negative: m[1] === '-' || m[1] === '−' }
}

/** A real calendar day as YYYY-MM-DD, between 1900 and 2100. */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number) as [number, number, number]
  if (y < 1900 || y > 2100) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export interface ManualFields {
  posted: string
  amount_cents: number
  description: string
  payee: string
  note: string
}

export interface EditFields {
  payee?: string
  note?: string
  excluded?: boolean
  posted?: string
  amount_cents?: number
  description?: string
}

type Checked<T> = { ok: T } | { problem: string }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : null)

function textField(v: unknown, max: number, what: string): Checked<string> {
  const t = text(v)
  if (t === null) return { problem: `The ${what} must be text.` }
  if (t.length > max) return { problem: `The ${what} must be at most ${max.toLocaleString('en-US')} characters.` }
  return { ok: t }
}

/**
 * Signed cents from an amount and which way the money went. A sign typed
 * into the amount wins ("-12" is money out whatever `direction` says);
 * without one, `direction` is required.
 */
function signed(amount: unknown, direction: unknown): Checked<number> {
  const a = parseAmount(amount)
  if (!a) return { problem: 'Enter the amount as a number, like 12.34.' }
  if (a.negative) return { ok: a.cents === 0 ? 0 : -a.cents }
  if (direction !== 'out' && direction !== 'in') return { problem: 'Say whether the money went out or came in.' }
  return { ok: direction === 'out' && a.cents ? -a.cents : a.cents }
}

/** A new transaction's fields from a form, or the first problem as a message. */
export function checkManual(input: Record<string, unknown>): Checked<ManualFields> {
  if (!isDay(input.posted)) return { problem: 'Choose the day it happened.' }
  const amount = signed(input.amount, input.direction)
  if ('problem' in amount) return amount
  const description = textField(input.description, DESCRIPTION_MAX, 'description')
  if ('problem' in description) return description
  if (!description.ok) return { problem: 'Say what it was, like "Farmers market".' }
  const payee = textField(input.payee, PAYEE_MAX, 'payee')
  if ('problem' in payee) return payee
  const note = textField(input.note, NOTE_MAX, 'note')
  if ('problem' in note) return note
  return { ok: { posted: input.posted, amount_cents: amount.ok, description: description.ok, payee: payee.ok, note: note.ok } }
}

/** The fields only a transaction added by hand lets a person change. */
export const MANUAL_ONLY = ['posted', 'amount', 'direction', 'description'] as const

/**
 * The changes to a transaction a person asks for, or the first problem.
 * Only what's given changes; `manual` says whether it was added by hand, and
 * so whether its date, amount and description may change too.
 */
export function checkEdit(input: Record<string, unknown>, manual: boolean): Checked<EditFields> {
  const out: EditFields = {}
  if (!manual && MANUAL_ONLY.some(k => input[k] !== undefined)) {
    return { problem: 'Its date, amount and description come from your bank or statement. You can change its name, add a note, or leave it out.' }
  }
  if (input.payee !== undefined) {
    const payee = textField(input.payee, PAYEE_MAX, 'name')
    if ('problem' in payee) return payee
    out.payee = payee.ok
  }
  if (input.note !== undefined) {
    const note = textField(input.note, NOTE_MAX, 'note')
    if ('problem' in note) return note
    out.note = note.ok
  }
  if (input.excluded !== undefined) {
    if (typeof input.excluded !== 'boolean') return { problem: 'Say whether to leave it out.' }
    out.excluded = input.excluded
  }
  if (input.posted !== undefined) {
    if (!isDay(input.posted)) return { problem: 'Choose the day it happened.' }
    out.posted = input.posted
  }
  if (input.amount !== undefined) {
    const amount = signed(input.amount, input.direction)
    if ('problem' in amount) return amount
    out.amount_cents = amount.ok
  }
  else if (input.direction !== undefined) {
    return { problem: 'Give the amount with which way it went.' }
  }
  if (input.description !== undefined) {
    const description = textField(input.description, DESCRIPTION_MAX, 'description')
    if ('problem' in description) return description
    if (!description.ok) return { problem: 'Say what it was, like "Farmers market".' }
    out.description = description.ok
  }
  if (!Object.keys(out).length) return { problem: 'Nothing to change.' }
  return { ok: out }
}

/**
 * A search's amount range ("80", "$75.50"), as whole cents either way; a
 * search finds money in and out alike by its size. Null for a blank end.
 */
export function amountRange(min: unknown, max: unknown): Checked<{ min: number | null, max: number | null }> {
  const end = (v: unknown, what: string): Checked<number | null> => {
    if (v === undefined || v === null || v === '') return { ok: null }
    const a = parseAmount(v)
    return a && !a.negative ? { ok: a.cents } : { problem: `The ${what} amount must be a number, like 80.` }
  }
  const lo = end(min, 'smallest')
  if ('problem' in lo) return lo
  const hi = end(max, 'largest')
  if ('problem' in hi) return hi
  if (lo.ok !== null && hi.ok !== null && lo.ok > hi.ok) return { ok: { min: hi.ok, max: lo.ok } }
  return { ok: { min: lo.ok, max: hi.ok } }
}

/** What a list shows a transaction as: the name the person gave it, the bank's, or what it said. */
export const shownName = (t: { payee: string, description: string }) => t.payee || t.description || 'No description'
