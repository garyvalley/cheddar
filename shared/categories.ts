/**
 * Spending categories as the browser shows them. The list is
 * pb_hooks/lib/categories.js's, which sorts each transaction into one;
 * tests/categories.test.mjs keeps the two the same.
 */

export const CATEGORIES = [
  { id: 'housing', label: 'Housing', spending: true },
  { id: 'utilities', label: 'Utilities', spending: true },
  { id: 'groceries', label: 'Groceries', spending: true },
  { id: 'dining', label: 'Dining and drinks', spending: true },
  { id: 'transport', label: 'Transportation', spending: true },
  { id: 'travel', label: 'Travel', spending: true },
  { id: 'shopping', label: 'Shopping', spending: true },
  { id: 'entertainment', label: 'Entertainment', spending: true },
  { id: 'health', label: 'Health', spending: true },
  { id: 'personal', label: 'Personal care', spending: true },
  { id: 'insurance', label: 'Insurance', spending: true },
  { id: 'education', label: 'Education', spending: true },
  { id: 'gifts', label: 'Gifts and donations', spending: true },
  { id: 'fees', label: 'Fees and interest', spending: true },
  { id: 'taxes', label: 'Taxes', spending: true },
  { id: 'loans', label: 'Loan payments', spending: true },
  { id: 'other', label: 'Other', spending: true },
  { id: 'income', label: 'Income', spending: false },
  { id: 'transfer', label: 'Transfers', spending: false },
] as const

export type CategoryId = typeof CATEGORIES[number]['id']

export const isCategory = (id: unknown): id is CategoryId => CATEGORIES.some(c => c.id === id)

/** A transaction saved before it was sorted counts as Other until it is. */
export const categoryOf = (id: string): CategoryId => (isCategory(id) ? id : 'other')

export const categoryLabel = (id: string) => CATEGORIES.find(c => c.id === categoryOf(id))!.label

export const isSpending = (id: string) => CATEGORIES.find(c => c.id === categoryOf(id))!.spending

export interface CategoryTotal {
  id: CategoryId
  label: string
  spending: boolean
  /** Spending: what went out, less refunds (positive is spent). Income and transfers: the net in. */
  total_cents: number
  count: number
}

export interface SpendingSummary {
  from: string
  to: string
  /** What every spending category added up to. */
  spent_cents: number
  income_cents: number
  /** The period before, for comparison. */
  previous_spent_cents: number
  /** Spending categories with anything in them, most spent first; then income and transfers. */
  categories: CategoryTotal[]
}

/** Adds up transactions by category. */
export function summarize(rows: { amount_cents: number, category: string }[]) {
  const by = new Map<CategoryId, { total: number, count: number }>()
  for (const r of rows) {
    const id = categoryOf(r.category)
    const t = by.get(id) ?? { total: 0, count: 0 }
    t.total += r.amount_cents
    t.count++
    by.set(id, t)
  }
  const categories: CategoryTotal[] = []
  for (const c of CATEGORIES) {
    const t = by.get(c.id)
    if (!t) continue
    categories.push({ id: c.id, label: c.label, spending: c.spending, total_cents: c.spending ? -t.total : t.total, count: t.count })
  }
  categories.sort((a, b) => Number(b.spending) - Number(a.spending) || (a.spending ? b.total_cents - a.total_cents : 0))
  const spent = categories.filter(c => c.spending).reduce((n, c) => n + c.total_cents, 0)
  const income = by.get('income')?.total ?? 0
  return { categories, spent_cents: spent, income_cents: income }
}

export type PeriodKind = 'month' | 'year'

export interface Period {
  kind: PeriodKind
  /** "2026-11" for a month, "2026" for a year. */
  at: string
  from: string
  to: string
  label: string
  prev: string
  next: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The month or year `at` names, or the one `today` (YYYY-MM-DD) is in when it names none. */
export function periodOf(kind: PeriodKind, at: string | undefined, today: string): Period {
  if (kind === 'year') {
    const y = /^\d{4}$/.test(at ?? '') ? Number(at) : Number(today.slice(0, 4))
    return { kind, at: String(y), from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), prev: String(y - 1), next: String(y + 1) }
  }
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(at ?? '')
  const y = m ? Number(m[1]) : Number(today.slice(0, 4))
  const mo = m ? Number(m[2]) : Number(today.slice(5, 7))
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`
  return { kind, at: `${y}-${pad(mo)}`, from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(last)}`, label, prev, next }
}

/** Today as YYYY-MM-DD where this code runs. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
