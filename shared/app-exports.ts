/**
 * Files exported from another money app (issue #113): Mint's
 * transactions.csv, Monarch's, and YNAB's register. Each is one CSV holding
 * every account, with the app's own category, merchant name, notes and tags.
 * They're known by their headings, read for one of their accounts at a time
 * (the person picks which Cheddar account it goes into), and each app's
 * category is mapped to Cheddar's, or left for Cheddar to sort when nothing
 * fits.
 *
 * Both the browser (the preview) and the server (which reads the file again)
 * use readImport(), which falls back to readStatement() for a bank's file.
 */
import {
  MAX_ROWS, parseAmount, parseCsv, parseDate, readStatement,
  type CsvMapping, type RowProblem, type Statement, type StatementRow,
} from './statements.ts'
import type { PdfOptions } from './pdf-statements.ts'
import { cleanTag, tagProblem, TAGS_MAX } from './tags.ts'
import type { CategoryId } from './categories.ts'

export type AppName = 'mint' | 'monarch' | 'ynab'

export const APP_NAMES: Record<AppName, string> = { mint: 'Mint', monarch: 'Monarch', ynab: 'YNAB' }

interface Columns {
  date: number
  /** What the bank called it. */
  description: number
  /** The app's tidied merchant name. */
  payee: number
  /** Signed, or unsigned with `type` (Mint's "debit"/"credit"). */
  amount: number
  type: number
  outflow: number
  inflow: number
  account: number
  category: number
  /** YNAB's "Category Group/Category", when there's no Category. */
  group: number
  note: number
  tags: number
}

interface Found { app: AppName, header: number, cols: Columns }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** The app a CSV came from, by its headings (in its first lines), or null. */
export function detectApp(records: string[][]): Found | null {
  for (let header = 0; header < Math.min(records.length, 5); header++) {
    const names = (records[header] ?? []).map(norm)
    const at = (...wanted: string[]) => {
      for (const w of wanted) {
        const i = names.indexOf(w)
        if (i >= 0) return i
      }
      return -1
    }
    const has = (...wanted: string[]) => wanted.every(w => names.includes(w))
    const base = { description: -1, payee: -1, amount: -1, type: -1, outflow: -1, inflow: -1, group: -1, note: at('notes', 'memo'), tags: -1 }
    if (has('date', 'description', 'original description', 'amount', 'transaction type', 'category', 'account name'))
      return { app: 'mint', header, cols: { ...base, date: at('date'), description: at('original description'), payee: at('description'), amount: at('amount'), type: at('transaction type'), account: at('account name'), category: at('category'), tags: at('labels') } }
    if (has('date', 'merchant', 'category', 'account', 'amount') && (has('original statement') || has('original description')))
      return { app: 'monarch', header, cols: { ...base, date: at('date'), description: at('original statement', 'original description'), payee: at('merchant'), amount: at('amount'), account: at('account'), category: at('category'), tags: at('tags') } }
    if (has('account', 'date', 'payee', 'outflow', 'inflow') && (has('category') || has('category group/category')))
      return { app: 'ynab', header, cols: { ...base, date: at('date'), payee: at('payee'), outflow: at('outflow'), inflow: at('inflow'), account: at('account'), category: at('category'), group: at('category group/category') } }
  }
  return null
}

// Each app's category names, as close to Cheddar's as they go. Tried as
// whole names first, then by the words in them, in order: "Auto Insurance"
// is insurance before it's transport, "Home Phone" a utility before housing.
const NAMED: Record<string, CategoryId | ''> = {
  'uncategorized': '', 'uncategorised': '', 'misc expenses': 'other', 'miscellaneous': 'other', 'other': 'other', 'cash & atm': 'other', 'cash and atm': 'other', 'check': 'other',
  'interest': 'income', 'interest income': 'income', 'dividends': 'income', 'dividends & capital gains': 'income', 'returned purchase': 'shopping', 'refund': '',
  'balance adjustments': 'transfer', 'buy': 'transfer', 'sell': 'transfer', 'investments': 'transfer', 'ready to assign': 'income', 'to be budgeted': 'income', 'inflow: ready to assign': 'income', 'inflow: to be budgeted': 'income',
  'gas': 'transport', 'auto & transport': 'transport', 'food & dining': 'dining', 'bills & utilities': 'utilities', 'mortgage & rent': 'housing',
}

const WORDS: [CategoryId, RegExp][] = [
  ['transfer', /transfer|credit card payment|card payment|balance adjust/],
  ['loans', /loan|auto payment|car payment/],
  ['income', /paycheck|income|salary|wages?\b|bonus|reimburse|dividend|deposit/],
  ['taxes', /tax/],
  ['fees', /\bfees?\b|finance charge|interest charge|service charge/],
  ['insurance', /insurance/],
  ['utilities', /utilit|electric|water|internet|cable|phone|mobile|television|\btv\b|trash|sewer|garbage/],
  ['housing', /rent\b|mortgage|home|hoa\b|housing|furnish|lawn|garden|maintenance|repair/],
  ['groceries', /grocer|supermarket/],
  ['dining', /restaurant|fast food|coffee|dining|food|\bbars?\b|alcohol|takeout|take-out|eating out|drinks/],
  ['travel', /travel|vacation|\bair|airline|flight|hotel|lodging|rental car/],
  ['transport', /fuel|auto|\bcar\b|parking|transport|ride ?share|taxi|toll|transit|gas\b/],
  ['health', /health|medical|doctor|dentist|dental|pharmacy|fitness|gym|eye ?care|vision|wellness/],
  ['personal', /personal|hair|spa\b|massage|beauty|laundry|dry clean/],
  ['education', /education|tuition|books?\b|school|student/],
  ['gifts', /gift|charity|donation|church|giving/],
  ['entertainment', /entertain|movie|music|game|hobb|recreation|subscription|streaming|sport|arts/],
  ['shopping', /shop|cloth|electronic|amazon|software|household|kids|pets?\b|baby|merchandise/],
]

/** Cheddar's category for another app's category name, or '' to let Cheddar sort it. */
export function mapCategory(name: string): CategoryId | '' {
  const n = norm(name).replace(/^[^\p{L}\p{N}]+/u, '') // Monarch's names can start with an emoji
  if (!n) return ''
  if (n in NAMED) return NAMED[n]!
  // YNAB's "Group: Category": the category's own name first, then its group's.
  const parts = n.includes(': ') ? [n.slice(n.indexOf(': ') + 2), n.slice(0, n.indexOf(': '))] : [n]
  for (const part of parts) {
    if (part in NAMED) return NAMED[part]!
    for (const [id, words] of WORDS) if (words.test(part)) return id
  }
  return ''
}

/** Its own tags, tidied, dropping any Cheddar can't keep. */
function tagsIn(raw: string, app: AppName): string[] | undefined {
  const tags: string[] = []
  for (const piece of raw.split(app === 'mint' ? /[,|]/ : /,/)) {
    const t = cleanTag(piece)
    if (!t || tagProblem(t) || tags.some(x => x.toLowerCase() === t.toLowerCase())) continue
    tags.push(t)
    if (tags.length === TAGS_MAX) break
  }
  return tags.length ? tags : undefined
}

function dateOrder(values: string[]): 'mdy' | 'dmy' {
  for (const v of values) {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v)
    if (m && Number(m[1]) > 12) return 'dmy'
  }
  return 'mdy'
}

export interface AppAccount { name: string, count: number }

/** The accounts in the file, most transactions first. */
export function appAccounts(records: string[][], found: Found): AppAccount[] {
  const counts = new Map<string, number>()
  for (const r of records.slice(found.header + 1)) {
    if (r.every(c => !c.trim())) continue
    const name = (r[found.cols.account] ?? '').trim()
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The file's rows for one of its accounts. */
export function readAppRows(records: string[][], found: Found, account: string): { rows: StatementRow[], problems: RowProblem[] } {
  const { cols, app } = found
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '').replace(/\s+/g, ' ').trim()
  const data = records.slice(found.header + 1)
  const order = dateOrder(data.map(r => r[cols.date] ?? ''))
  const rows: StatementRow[] = []
  const problems: RowProblem[] = []
  data.forEach((r, i) => {
    if (r.every(c => !c.trim()) || cell(r, cols.account) !== account) return
    const line = found.header + i + 2
    const posted = parseDate(cell(r, cols.date), order)
    if (!posted) { problems.push({ line, problem: `No date in "${cell(r, cols.date)}"` }); return }
    let cents: number | null
    if (app === 'ynab') {
      const out = parseAmount(cell(r, cols.outflow))
      const into = parseAmount(cell(r, cols.inflow))
      cents = out === null && into === null ? null : Math.abs(into ?? 0) - Math.abs(out ?? 0)
    }
    else {
      cents = parseAmount(cell(r, cols.amount))
      // Mint writes every amount as positive and says which way it went.
      if (cents !== null && app === 'mint') cents = norm(cell(r, cols.type)) === 'debit' ? -Math.abs(cents) : Math.abs(cents)
    }
    if (cents === null) { problems.push({ line, problem: 'No amount' }); return }
    const payee = cell(r, cols.payee).slice(0, 200)
    const description = (cell(r, cols.description) || payee).slice(0, 500)
    const category = mapCategory(cell(r, cols.category) || cell(r, cols.group))
    const note = cell(r, cols.note).slice(0, 1000)
    const tags = cols.tags >= 0 ? tagsIn(r[cols.tags] ?? '', app) : undefined
    rows.push({
      posted,
      amount_cents: cents === 0 ? 0 : cents,
      description,
      ...(payee && payee !== description ? { payee } : {}),
      ...(category ? { category } : {}),
      ...(note ? { note } : {}),
      ...(tags ? { tags } : {}),
    })
  })
  return { rows, problems }
}

/** A statement, and for another app's file which app and which of its accounts. */
export type Import = Statement & { app?: AppName, accounts?: AppAccount[], account_name?: string }

/**
 * A file to import: another app's export, read for `account` (one of its
 * accounts; else the one with the most transactions), or else a bank's file
 * as readStatement() reads it.
 */
export function readImport(filename: string, text: string, mapping?: CsvMapping, pdf?: PdfOptions, account?: string): Import | { problem: string } {
  if (!mapping && text.trim() && !/\.(ofx|qfx|qbo|pdf)$/i.test(filename)) {
    const records = parseCsv(text)
    const found = detectApp(records)
    if (found) {
      const accounts = appAccounts(records, found)
      if (!accounts.length) return { problem: 'No transactions were found in this file.' }
      const name = account !== undefined && accounts.some(a => a.name === account) ? account : accounts[0]!.name
      const read = readAppRows(records, found, name)
      if (read.rows.length > MAX_ROWS) return { problem: `This account has more than ${MAX_ROWS} transactions in the file. Export a shorter date range from ${APP_NAMES[found.app]}.` }
      return { format: 'csv', ...read, app: found.app, accounts, account_name: name }
    }
  }
  return readStatement(filename, text, mapping, pdf)
}
