/**
 * Reading the files banks and card issuers export: CSV (each bank its own
 * columns), OFX or QFX (Quicken and Money's format, one standard), and the
 * text of a PDF statement (shared/pdf-statements.ts). All
 * the browser (to show a preview before anything is saved) and the server
 * (which reads the file again itself, never trusting the preview) use this.
 *
 * Every amount comes out as signed whole cents, money out negative; every
 * date as YYYY-MM-DD.
 */

import { isPdfText, readPdfText, type PdfOptions } from './pdf-statements.ts'

export type StatementFormat = 'csv' | 'ofx' | 'pdf'

/** One transaction as a file states it. */
export interface StatementRow {
  posted: string
  amount_cents: number
  description: string
  /** OFX's own id for the transaction (FITID), when the file has one. */
  fitid?: string
}

/** A line that couldn't be read as a transaction, with why. Line numbers count from 1. */
export interface RowProblem {
  line: number
  problem: string
}

/** Which CSV column holds what, and how to read it. Columns count from 0; -1 is "none". */
export interface CsvMapping {
  /** The line of column headings (0-based); data starts on the next line. */
  header: number
  date: number
  description: number
  /** One signed amount column, or else separate money-out and money-in columns. */
  amount: number
  debit: number
  credit: number
  /** How to read a date like 03/04/2026: US month first, or day first. */
  dateOrder: 'mdy' | 'dmy'
  /** The file shows money out as positive (many card exports): flip every sign. */
  flip: boolean
}

/** What the OFX file says about its account, to suggest one. */
export interface AccountHint {
  last4?: string
  kind?: 'checking' | 'savings' | 'credit_card'
}

export interface Statement {
  format: StatementFormat
  rows: StatementRow[]
  problems: RowProblem[]
  /** CSV only: the headings, and the columns this read used. */
  columns?: string[]
  mapping?: CsvMapping
  account?: AccountHint
}

/** Larger than any month's statement; a file this big is the wrong file. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const MAX_ROWS = 5000

/** 'pdf' for a PDF's text, 'ofx' for an OFX/QFX file (by name or by content), else 'csv'. */
export function detectFormat(filename: string, text: string): StatementFormat {
  if (isPdfText(text)) return 'pdf'
  if (/\.(ofx|qfx|qbo)$/i.test(filename)) return 'ofx'
  return /^\s*(OFXHEADER|<\?xml[^>]*>\s*<\?OFX|<OFX>)/i.test(text.replace(/^\uFEFF/, '')) ? 'ofx' : 'csv'
}

/**
 * The whole file read as a statement, or why it can't be. A CSV is read with
 * `mapping` when given, else with the columns its headings suggest; a PDF's
 * text with `pdf` (which way its unsigned amounts go).
 */
export function readStatement(filename: string, text: string, mapping?: CsvMapping, pdf?: PdfOptions): Statement | { problem: string } {
  if (!text.trim()) return { problem: 'The file is empty.' }
  const format = detectFormat(filename, text)
  if (format === 'pdf') {
    const read = readPdfText(text, pdf)
    if (!read.rows.length) return { problem: 'No transactions could be found in this PDF. If it\'s a scan, download the statement from your bank\'s website instead, or export CSV.' }
    if (read.rows.length > MAX_ROWS) return { problem: `The file has more than ${MAX_ROWS} transactions. Export a shorter date range.` }
    return { format, ...read }
  }
  if (/\.pdf$/i.test(filename) || text.startsWith('%PDF-')) return { problem: 'Choose the PDF again: its text couldn\'t be read.' }
  if (format === 'ofx') {
    const read = readOfx(text)
    if (!read.rows.length && !read.problems.length) return { problem: 'No transactions were found in this file.' }
    if (read.rows.length > MAX_ROWS) return { problem: `The file has more than ${MAX_ROWS} transactions. Export a shorter date range.` }
    return { format, ...read }
  }
  const records = parseCsv(text)
  const columns = (m: CsvMapping) => (records[m.header] ?? []).map(c => c.trim())
  const use = mapping ?? guessMapping(records)
  if ('problem' in use) return use
  const checked = checkMapping(use, columns(use).length)
  if (checked) return { problem: checked }
  const read = readCsv(records, use)
  if (read.rows.length > MAX_ROWS) return { problem: `The file has more than ${MAX_ROWS} transactions. Export a shorter date range.` }
  return { format, ...read, columns: columns(use), mapping: use }
}

// --- CSV ---

/** RFC 4180 records: quoted fields may hold the delimiter, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '')
  const delimiter = guessDelimiter(text)
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      }
      else field += ch
    }
    else if (ch === '"' && field.trim() === '') { field = ''; quoted = true }
    else if (ch === delimiter) { record.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    }
    else field += ch
  }
  if (field !== '' || record.length) {
    record.push(field)
    records.push(record)
  }
  return records
}

function guessDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20)
  let best = ','
  let bestScore = 0
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map(l => l.replace(/"[^"]*"/g, '').split(d).length - 1)
    // The delimiter splits most lines into the same number of fields.
    const common = mode(counts)
    const score = common * counts.filter(c => c === common).length
    if (common > 0 && score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function mode(values: number[]): number {
  const seen = new Map<number, number>()
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1)
  let best = 0
  let bestCount = 0
  for (const [v, n] of seen) if (n > bestCount || (n === bestCount && v > best)) { best = v; bestCount = n }
  return best
}

const norm = (heading: string) => heading.toLowerCase().replace(/[^a-z]+/g, ' ').trim()

// Headings as banks write them, best first.
const HEADINGS = {
  date: ['transaction date', 'trans date', 'date', 'posted date', 'posting date', 'post date', 'date posted', 'effective date', 'value date'],
  description: ['description', 'transaction description', 'original description', 'payee', 'merchant', 'merchant name', 'name', 'details', 'narrative', 'memo', 'transaction'],
  amount: ['amount', 'transaction amount', 'amount usd', 'net amount', 'value'],
  debit: ['debit', 'debits', 'debit amount', 'withdrawal', 'withdrawals', 'withdrawal amount', 'money out', 'paid out', 'charge', 'charges'],
  credit: ['credit', 'credits', 'credit amount', 'deposit', 'deposits', 'deposit amount', 'money in', 'paid in', 'payment', 'payments'],
} as const

function find(headings: string[], wanted: readonly string[]): number {
  const names = headings.map(norm)
  for (const w of wanted) {
    const at = names.indexOf(w)
    if (at >= 0) return at
  }
  return -1
}

/** The columns a file's headings suggest, or why none fit. Banks often put a few summary lines above the headings. */
export function guessMapping(records: string[][]): CsvMapping | { problem: string } {
  for (let header = 0; header < Math.min(records.length, 30); header++) {
    const headings = records[header]!
    const date = find(headings, HEADINGS.date)
    if (date < 0) continue
    let description = find(headings, HEADINGS.description)
    const amount = find(headings, HEADINGS.amount)
    const debit = amount >= 0 ? -1 : find(headings, HEADINGS.debit)
    const credit = amount >= 0 ? -1 : find(headings, HEADINGS.credit)
    if (amount < 0 && debit < 0 && credit < 0) continue
    if (description < 0) description = headings.findIndex((_, i) => ![date, amount, debit, credit].includes(i))
    const data = records.slice(header + 1)
    return { header, date, description, amount, debit, credit, dateOrder: guessDateOrder(data.map(r => r[date] ?? '')), flip: false }
  }
  return { problem: 'Couldn\'t find the column headings (a date and an amount). Export the file as CSV with headings, or try the OFX/QFX download.' }
}

/** What's wrong with a mapping for a file with `width` columns, or ''. */
export function checkMapping(m: CsvMapping, width: number): string {
  const column = (i: unknown) => Number.isInteger(i) && (i as number) >= -1 && (i as number) < width
  if (!Number.isInteger(m.header) || m.header < 0) return 'Choose the line with the column headings.'
  if (![m.date, m.description, m.amount, m.debit, m.credit].every(column)) return 'Choose columns from the file.'
  if (m.date < 0) return 'Choose the column with the date.'
  if (m.amount < 0 && m.debit < 0 && m.credit < 0) return 'Choose the column with the amount, or the money out and money in columns.'
  if (m.dateOrder !== 'mdy' && m.dateOrder !== 'dmy') return 'Choose how dates are written.'
  if (typeof m.flip !== 'boolean') return 'Choose whether money out shows as positive.'
  return ''
}

/** Day first only if some date can't be month first. */
function guessDateOrder(values: string[]): 'mdy' | 'dmy' {
  for (const v of values) {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v)
    if (m && Number(m[1]) > 12) return 'dmy'
  }
  return 'mdy'
}

export function readCsv(records: string[][], m: CsvMapping): { rows: StatementRow[], problems: RowProblem[] } {
  const rows: StatementRow[] = []
  const problems: RowProblem[] = []
  for (let i = m.header + 1; i < records.length; i++) {
    const r = records[i]!
    if (r.every(c => !c.trim())) continue
    const line = i + 1
    const posted = parseDate(r[m.date] ?? '', m.dateOrder)
    if (!posted) { problems.push({ line, problem: `No date in "${(r[m.date] ?? '').trim()}"` }); continue }
    let cents: number | null
    if (m.amount >= 0) cents = parseAmount(r[m.amount] ?? '')
    else {
      const out = m.debit >= 0 ? parseAmount(r[m.debit] ?? '') : null
      const into = m.credit >= 0 ? parseAmount(r[m.credit] ?? '') : null
      // Money out is negative whichever way the bank signs its debit column.
      cents = out === null && into === null ? null : Math.abs(into ?? 0) - Math.abs(out ?? 0)
    }
    if (cents === null) { problems.push({ line, problem: 'No amount' }); continue }
    if (m.flip) cents = -cents
    const description = (m.description >= 0 ? r[m.description] ?? '' : '').replace(/\s+/g, ' ').trim().slice(0, 500)
    rows.push({ posted, amount_cents: cents === 0 ? 0 : cents, description })
  }
  return { rows, problems }
}

/**
 * Signed whole cents from an amount as banks write it: "1,234.56",
 * "-$12.00", "$-12.00", "(12.00)" and "12.00-" are all forms of it, and
 * "12.00 DR"/"CR" too. Null when there's no number.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[\s\u00a0]+/g, ' ')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (/\s*(DR|DB)$/i.test(s)) { negative = true; s = s.replace(/\s*(DR|DB)$/i, '') }
  s = s.replace(/\s*CR$/i, '')
  if (/-$/.test(s)) { negative = true; s = s.slice(0, -1) }
  s = s.replace(/^[+]/, '')
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  s = s.replace(/^(US)?\$|^USD\s?|\s?USD$/i, '').trim()
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  const m = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/.exec(s)
  if (!m || (!m[1] && !m[2])) return null
  const cents = Number((m[1] || '0').replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
  if (!Number.isSafeInteger(cents)) return null
  return negative && cents ? -cents : cents
}

/**
 * YYYY-MM-DD from a date as banks write it: 2026-03-04, 20260304,
 * 03/04/2026, 3/4/26 (month first unless `order` says day first), and
 * "Mar 4, 2026" or "4 Mar 2026". Null when it isn't a real date.
 */
export function parseDate(raw: string, order: 'mdy' | 'dmy' = 'mdy'): string | null {
  const s = raw.trim()
  let y: number, mo: number, d: number
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s) || /^(\d{4})(\d{2})(\d{2})/.exec(s) || /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s)
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(s))) {
    const a = Number(m[1])
    const b = Number(m[2])
    mo = order === 'mdy' ? a : b
    d = order === 'mdy' ? b : a
    y = Number(m[3])
    if (m[3]!.length === 2) y += 2000
  }
  else if ((m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s))) {
    mo = month(m[1]!); d = Number(m[2]); y = Number(m[3])
  }
  else if ((m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})$/.exec(s))) {
    d = Number(m[1]); mo = month(m[2]!); y = Number(m[3])
  }
  else return null
  if (!mo || mo > 12 || d < 1 || y < 1900 || y > 2200) return null
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const month = (name: string) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.toLowerCase()) + 1

// --- OFX / QFX ---

/** One element's value: OFX 1 (SGML) often leaves elements unclosed, so the value runs to the next tag or line end. */
function element(block: string, tag: string): string {
  const open = `<${tag}>`
  const at = block.toUpperCase().indexOf(open)
  if (at < 0) return ''
  const rest = block.slice(at + open.length)
  const end = rest.search(/[<\r\n]/)
  return decodeEntities((end < 0 ? rest : rest.slice(0, end)).trim())
}

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' })[e]!)
}

export function readOfx(text: string): { rows: StatementRow[], problems: RowProblem[], account?: AccountHint } {
  const rows: StatementRow[] = []
  const problems: RowProblem[] = []
  const pattern = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text))) {
    const block = m[1]!
    const line = text.slice(0, m.index).split('\n').length
    const posted = parseDate(element(block, 'DTPOSTED').slice(0, 8))
    if (!posted) { problems.push({ line, problem: 'No date' }); continue }
    const cents = parseAmount(element(block, 'TRNAMT').replace(/^([+-]?\d+),(\d{1,2})$/, '$1.$2'))
    if (cents === null) { problems.push({ line, problem: 'No amount' }); continue }
    const name = element(block, 'NAME')
    const memo = element(block, 'MEMO')
    const description = (name && memo && !memo.startsWith(name) ? `${name} ${memo}` : name || memo).replace(/\s+/g, ' ').slice(0, 500)
    const fitid = element(block, 'FITID').slice(0, 180)
    rows.push({ posted, amount_cents: cents, description, ...(fitid ? { fitid } : {}) })
  }
  const account: AccountHint = {}
  const id = element(text, 'ACCTID').replace(/\D/g, '')
  if (id.length >= 4) account.last4 = id.slice(-4)
  if (/<CCACCTFROM>/i.test(text)) account.kind = 'credit_card'
  else {
    const type = element(text, 'ACCTTYPE').toUpperCase()
    if (type === 'CHECKING' || type === 'MONEYMRKT') account.kind = 'checking'
    else if (type === 'SAVINGS') account.kind = 'savings'
    else if (type === 'CREDITLINE') account.kind = 'credit_card'
  }
  return { rows, problems, ...(Object.keys(account).length ? { account } : {}) }
}

/** The earliest and latest dates among `rows`. */
export function dateRange(rows: StatementRow[]): { first: string, last: string } | null {
  if (!rows.length) return null
  let first = rows[0]!.posted
  let last = first
  for (const r of rows) {
    if (r.posted < first) first = r.posted
    if (r.posted > last) last = r.posted
  }
  return { first, last }
}
