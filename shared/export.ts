import type { Account, Import, Transaction } from './accounts.ts'
import { kindLabel } from './accounts.ts'
import { categoryLabel, type Category } from './categories.ts'

/**
 * What an export holds, and the spreadsheets (CSV) made from it: Settings'
 * "Export your data" (every file) and Spending's "Download CSV" (the
 * transactions it shows). Never a bank link's token or a two-step secret:
 * nothing that reads them is ever handed one.
 */

export const EXPORT_VERSION = 1

export interface BalancePoint {
  account: string
  date: string
  balance_cents: number
}

export interface CategoryRule {
  merchant: string
  category: string
}

/** Everything a person has in Cheddar, as cheddar.json holds it. */
export interface ExportData {
  cheddar_export: typeof EXPORT_VERSION
  exported: string
  profile: { name: string, email: string, state: string, filing_status: string, theme: string, appearance: string, time_zone: string }
  accounts: Account[]
  transactions: (Transaction & { import: string })[]
  imports: Import[]
  balance_history: BalancePoint[]
  categories: Category[]
  category_rules: CategoryRule[]
  bank_links: { institutions: string[], status: string, last_synced: string, accounts: string[] }[]
}

/** A cell a spreadsheet could take for a formula (=, +, -, @, or a tab or return first). */
const FORMULA = /^[=+\-@\t\r]/

/**
 * One CSV cell. Text that a spreadsheet would run as a formula gets a `'`
 * first: a payee or description comes from a bank or a file, so it could be
 * `=HYPERLINK(...)`. Numbers are written as they are, so amounts stay numbers.
 */
export function csvCell(value: string | number | boolean): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let s = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value
  if (FORMULA.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/**
 * A CSV file (RFC 4180: CRLF between rows), with a byte-order mark first so
 * Excel reads it as UTF-8 rather than mangling accented names.
 */
export function toCsv(header: string[], rows: (string | number | boolean)[][]): string {
  return `\uFEFF${[header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** Cents as a plain decimal a spreadsheet reads as a number: -1234 is -12.34. */
export const dollars = (cents: number): number => Math.round(cents) / 100

export function transactionsCsv(rows: Transaction[], accounts: Pick<Account, 'id' | 'name'>[], categories: Category[]): string {
  const names = new Map(accounts.map(a => [a.id, a.name]))
  return toCsv(
    ['Date', 'Account', 'Amount', 'Description', 'Payee', 'Category', 'Pending'],
    rows.map(t => [t.posted, names.get(t.account) ?? '', dollars(t.amount_cents), t.description, t.payee, categoryLabel(t.category, categories), t.pending]),
  )
}

export function accountsCsv(accounts: Account[]): string {
  return toCsv(
    ['Name', 'Kind', 'Institution', 'Last 4', 'Balance', 'Balance date', 'Linked'],
    accounts.map(a => [a.name, kindLabel(a.kind), a.institution, a.last4, a.balance_cents === null ? '' : dollars(a.balance_cents), a.balance_date, a.linked]),
  )
}

export function balanceHistoryCsv(points: BalancePoint[], accounts: Pick<Account, 'id' | 'name'>[]): string {
  const names = new Map(accounts.map(a => [a.id, a.name]))
  return toCsv(['Date', 'Account', 'Balance'], points.map(p => [p.date, names.get(p.account) ?? '', dollars(p.balance_cents)]))
}

/** The files in the zip, by name. */
export function exportFiles(data: ExportData): Record<string, string> {
  return {
    'accounts.csv': accountsCsv(data.accounts),
    'transactions.csv': transactionsCsv(data.transactions, data.accounts, data.categories),
    'balance_history.csv': balanceHistoryCsv(data.balance_history, data.accounts),
    'cheddar.json': `${JSON.stringify(data, null, 2)}\n`,
  }
}

/** A download's file name for the transactions between two days: cheddar-2026-11-01-to-2026-11-30.csv. */
export function csvName(from?: string, to?: string): string {
  if (from && to) return `cheddar-transactions-${from}-to-${to}.csv`
  if (from) return `cheddar-transactions-from-${from}.csv`
  if (to) return `cheddar-transactions-to-${to}.csv`
  return 'cheddar-transactions.csv'
}
