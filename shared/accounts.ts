/** Accounts and transactions as the browser sees them, and the rules for a new account. */

export const ACCOUNT_KINDS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'loan', label: 'Loan' },
  { value: 'property', label: 'Property' },
  { value: 'other', label: 'Other' },
] as const

export type AccountKind = typeof ACCOUNT_KINDS[number]['value']

export const kindLabel = (kind: string) => ACCOUNT_KINDS.find(k => k.value === kind)?.label ?? 'Other'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  institution: string
  last4: string
  currency: string
  source: 'manual' | 'import' | 'sync' | ''
  /** Signed: what a card or loan owes is negative. Null until it has a balance. */
  balance_cents: number | null
  /** The day the balance is from. */
  balance_date: string
  /** A bank link keeps it up to date, balance and all. */
  linked: boolean
}

export interface NewAccount {
  name: string
  kind: AccountKind
  institution: string
  last4: string
}

export interface Transaction {
  id: string
  account: string
  posted: string
  amount_cents: number
  description: string
  payee: string
  /** A category id (shared/categories.ts); empty until the store has sorted it. */
  category: string
  /** How the category was chosen: by hand ("person"), by the person's rule, or automatically. */
  category_by: 'bank' | 'match' | 'default' | 'rule' | 'person' | ''
  pending: boolean
  source: 'manual' | 'import' | 'sync'
}

export interface Import {
  id: string
  account: string
  filename: string
  format: 'csv' | 'ofx'
  added: number
  skipped: number
  first_date: string
  last_date: string
  created: string
}

/** A new account's fields, trimmed, or the first problem as a message. */
export function checkAccount(input: Record<string, unknown>): { ok: NewAccount } | { problem: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined ? '' : null)
  const name = text(input.name)
  const institution = text(input.institution)
  const last4 = text(input.last4)
  if (!name) return { problem: 'Give the account a name.' }
  if (name.length > 100) return { problem: 'The name must be at most 100 characters.' }
  if (!ACCOUNT_KINDS.some(k => k.value === input.kind)) return { problem: 'Choose what kind of account it is.' }
  if (institution === null || institution.length > 100) return { problem: 'The bank\'s name must be at most 100 characters.' }
  if (last4 === null || (last4 && !/^\d{4}$/.test(last4))) return { problem: 'The last four digits must be four digits.' }
  return { ok: { name, kind: input.kind as AccountKind, institution, last4 } }
}

/** Liabilities: what they hold is owed, and a charge to them is money out. */
export const isLiability = (kind: string) => kind === 'credit_card' || kind === 'loan'

/** "$1,234.56" or "\u2212$1,234.56" from signed cents. */
export function formatCents(cents: number, currency = 'USD'): string {
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Math.abs(cents) / 100)
  return cents < 0 ? `\u2212${text}` : text
}

/**
 * A balance a person types ("1,234.56", "-$80", "$12"), as signed cents. For
 * a card or a loan, what's owed is stored negative whichever way it's typed.
 */
export function parseBalance(input: unknown, kind: string): { ok: number } | { problem: string } {
  const text = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : ''
  const m = /^([-\u2212]?)\s*\$?\s*([-\u2212]?)(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(text)
  if (!text || !m || (m[3] === undefined && m[4] === undefined) || (m[1] && m[2])) return { problem: 'Enter the balance as an amount, like 1,234.56.' }
  const cents = Number((m[3] ?? '0').replace(/,/g, '')) * 100 + Number((m[4] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000_00) return { problem: 'That balance is larger than Cheddar can hold.' }
  const negative = !!(m[1] || m[2])
  if (isLiability(kind)) return { ok: cents === 0 ? 0 : -cents }
  return { ok: negative && cents ? -cents : cents }
}
