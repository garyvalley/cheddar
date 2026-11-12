/**
 * Reading the PDF statement a bank or card issuer sends each month. A PDF
 * has no columns, only text placed on a page, and every bank lays its
 * statement out its own way, so this reads the lines a person would read:
 * one that starts with a date and ends with an amount is a transaction.
 *
 * The browser takes the text out of the PDF (app/utils/pdf-text.ts, with
 * pdf.js) and sends only that text, which the server reads again here, as it
 * does a CSV. The PDF itself never leaves the browser.
 *
 * Which way the money went is the hard part, because a statement often
 * prints amounts without a sign and says it with the heading above them
 * ("Deposits and additions") or the running balance beside them. In order,
 * the first of these that applies wins:
 *   1. "CR" or "DR" after the amount;
 *   2. the running balance on the line, when it moved by exactly the amount;
 *   3. a statement that signs some of its amounts: as printed (a card's
 *      charges print positive, so for a card the sign is turned round);
 *   4. the heading the line is under;
 *   5. money out.
 * The person sees every row in the preview first, and can flip them all.
 */

import { parseAmount, type RowProblem, type StatementRow } from './statements.ts'

/** The first line of the text the browser sends for a PDF, so a CSV is never read as one. */
export const PDF_TEXT_MARK = '%cheddar-pdf-text 1'

/** One piece of text pdf.js found on a page: where it starts, how wide it is, and its height. */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * The pages' text as lines, top to bottom and left to right, pages in order.
 * Pieces whose baselines are within a third of the text's height share a
 * line; a wide gap between two pieces becomes two spaces, so columns stay apart.
 */
export function pdfLines(pages: PdfTextItem[][]): string[] {
  const out: string[] = []
  for (const items of pages) {
    const pieces = items.filter(i => i.str.trim())
    // PDF's y grows upward: the top of the page comes first.
    pieces.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: PdfTextItem[][] = []
    for (const p of pieces) {
      const line = lines.at(-1)
      const tolerance = Math.max(2, (p.height || 10) / 3)
      if (line && Math.abs(line[0]!.y - p.y) <= tolerance) line.push(p)
      else lines.push([p])
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const p of line) {
        const gap = p.x - end
        const space = (p.height || 10) * 0.25
        if (text) text += gap > space * 4 ? '  ' : gap > space * 0.5 ? ' ' : ''
        text += p.str
        end = p.x + p.width
      }
      out.push(text.replace(/\s+$/, ''))
    }
  }
  return out
}

/** What pdfPages() needs of a pdf.js document. */
export interface PdfDocumentLike {
  numPages: number
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>
}

/** Most pages a statement can have; a longer PDF is something else. */
export const MAX_PDF_PAGES = 100

/** Every page's text pieces, from a document pdf.js opened. */
export async function pdfPages(doc: PdfDocumentLike): Promise<PdfTextItem[][]> {
  const pages: PdfTextItem[][] = []
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.flatMap((item) => {
      const i = item as { str?: string, transform?: number[], width?: number, height?: number }
      if (typeof i.str !== 'string' || !i.transform) return []
      return [{ str: i.str, x: i.transform[4] ?? 0, y: i.transform[5] ?? 0, width: i.width ?? 0, height: i.height || Math.abs(i.transform[3] ?? 0) }]
    }))
  }
  return pages
}

/** The text the browser sends for a PDF's pages. */
export function pdfText(pages: PdfTextItem[][]): string {
  return `${PDF_TEXT_MARK}\n${pdfLines(pages).join('\n')}\n`
}

export const isPdfText = (text: string) => text.startsWith(PDF_TEXT_MARK)

export interface PdfOptions {
  /** A card or loan: its statement prints charges as positive. */
  liability?: boolean
  /** Turn every sign round: the person saw the preview had them backwards. */
  flip?: boolean
  /** Today, YYYY-MM-DD: the year for a statement that never prints one. */
  today?: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?'

/**
 * A date at the start of a transaction line: 11/05, 11/05/26, 11/05/2026,
 * 11-05, Nov 5, Nov 5, 2026, 5 Nov. A card's last four digits may come
 * first, as on Wells Fargo's statements ("1234  09/17  09/18 …").
 */
const LEAD_DATE = new RegExp(`^(?:\\d{4}\\s+)?(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|${MONTH} \\d{1,2}(?:,? \\d{4})?|\\d{1,2} ${MONTH}(?: \\d{4})?)(?=\\s)`, 'i')
/** An amount as statements print it: always with cents, maybe a sign, $, parentheses, or CR/DR. */
const AMOUNT = '(?:\\(\\s*-?\\$?\\s?\\d{1,3}(?:,\\d{3})*\\.\\d{2}\\s*\\)|[-+]?\\s?\\$?\\s?-?\\d{1,3}(?:,\\d{3})*\\.\\d{2}(?:-|\\s?(?:CR|DR)\\b)?)'
const TRAILING_AMOUNTS = new RegExp(`\\s+(${AMOUNT})(?:\\s+(${AMOUNT}))?\\s*$`, 'i')
/** A full date anywhere in the text, to learn the statement's year. */
const FULL_DATE = new RegExp(`\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4}|\\d{2})\\b|\\b(${MONTH}) (\\d{1,2}),? (\\d{4})\\b`, 'gi')

/** Lines that hold a balance or a total, not a transaction, even when they start with a date. */
const NOT_A_TRANSACTION = /\b(beginning|opening|starting|previous|prior|ending|closing|new|daily|average|available|statement)\s+balance\b|\bbalance\s+(forward|brought|carried)\b|\b(minimum\s+payment|payment\s+due|credit\s+limit|available\s+credit|credit\s+available)\b|^total\b|\btotals?\b.*\b(for|this)\s+(period|month|cycle)\b/i
const BALANCE_LINE = /\b(beginning|opening|starting|previous|prior)\s+balance\b|\bbalance\s+(forward|brought)\b/i

/** Headings that say the lines under them are money in, or money out. Checked against lines with no amount, or short ones. */
const IN_HEADING = /\b(deposits?|credits?|additions|payments?(?!\s+due)(?:\s+(?:and|&)\s+(?:other\s+)?credits)?|refunds?|interest\s+(?:paid|earned))\b/i
const OUT_HEADING = /\b(withdrawals?|debits?|subtractions|purchases?|charges?|checks?(?:\s+paid)?|fees?|cash\s+advances?|interest\s+charged?|payments?\s+(?:sent|made|to))\b/i

function monthOf(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1
}

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000

/** Every full date the statement prints (its period, due date and so on), to place dates that leave the year out. */
function fullDates(lines: string[]): string[] {
  const found: string[] = []
  for (const line of lines) {
    for (const m of line.matchAll(FULL_DATE)) {
      const date = m[1]
        ? ymd(m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]))
        : ymd(Number(m[6]), monthOf(m[4]!), Number(m[5]))
      if (date) found.push(date)
    }
  }
  return found.sort()
}

/**
 * A transaction's date in full. A month and day with no year takes the year
 * that puts it nearest the dates the statement prints in full (so December's
 * rows on a statement that closes in January land in the year before), or,
 * with none printed, the latest that isn't after today.
 */
function placeDate(raw: string, known: string[], today: string): string | null {
  let m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(raw)
  let month: number, day: number, year: number | undefined
  if (m) {
    month = Number(m[1]); day = Number(m[2])
    if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  }
  else if ((m = new RegExp(`^(${MONTH}) (\\d{1,2})(?:,? (\\d{4}))?$`, 'i').exec(raw))) {
    month = monthOf(m[1]!); day = Number(m[2]); if (m[3]) year = Number(m[3])
  }
  else if ((m = new RegExp(`^(\\d{1,2}) (${MONTH})(?: (\\d{4}))?$`, 'i').exec(raw))) {
    day = Number(m[1]); month = monthOf(m[2]!); if (m[3]) year = Number(m[3])
  }
  else return null
  if (year) return ymd(year, month, day)

  const first = known[0]
  const last = known.at(-1)
  if (!first || !last) {
    const y = Number(today.slice(0, 4))
    const date = ymd(y, month, day)
    return date && date > today ? ymd(y - 1, month, day) : date
  }
  let best: string | null = null
  let bestDistance = Infinity
  for (const y of [Number(first.slice(0, 4)) - 1, Number(first.slice(0, 4)), Number(last.slice(0, 4)), Number(last.slice(0, 4)) + 1]) {
    const date = ymd(y, month, day)
    if (!date) continue
    const d = dayNumber(date)
    const distance = d < dayNumber(first) ? dayNumber(first) - d : d > dayNumber(last) ? d - dayNumber(last) : 0
    if (distance < bestDistance) { best = date; bestDistance = distance }
  }
  return best
}

/** An amount's cents as printed, and whether it carried a sign of its own. */
function printed(raw: string): { cents: number, signed: boolean, marker: 'CR' | 'DR' | '' } | null {
  const s = raw.replace(/\s+/g, ' ').trim().replace(/^([-+]) /, '$1')
  const marker = /CR$/i.test(s) ? 'CR' : /DR$/i.test(s) ? 'DR' : ''
  const cents = parseAmount(s.replace(/^([-+]?) ?\$ ?/, '$1$').replace(/\$ /, '$'))
  if (cents === null) return null
  return { cents, signed: /^[-(]|-$|^\$-|^\+/.test(s) && !marker, marker }
}

interface Candidate {
  line: number
  posted: string
  description: string
  amount: NonNullable<ReturnType<typeof printed>>
  balance: number | null
  heading: 'in' | 'out' | ''
}

/** The statement's transactions, read from the text pdfText() made. */
export function readPdfText(text: string, options: PdfOptions = {}): { rows: StatementRow[], problems: RowProblem[] } {
  const lines = text.replace(/\r/g, '').split('\n')
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const known = fullDates(lines)
  const problems: RowProblem[] = []
  const found: Candidate[] = []
  let heading: Candidate['heading'] = ''
  let balance: number | null = null
  const opening: (number | null)[] = []

  lines.forEach((raw, i) => {
    if (i === 0 && isPdfText(raw)) return
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line) return
    const tail = TRAILING_AMOUNTS.exec(line)
    const lead = LEAD_DATE.exec(line)

    if (!lead || !tail) {
      // A heading: a line with no amount, or a short one ("Deposits and additions  $2,400.00").
      if (!tail || line.length - tail[0].length < 40) {
        const words = tail ? line.slice(0, tail.index) : line
        if (BALANCE_LINE.test(words) && tail) {
          const b = printed(tail[2] ?? tail[1]!)
          if (b) balance = b.cents
        }
        else if (!NOT_A_TRANSACTION.test(words) && words.length <= 60 && !/\d{2}[/-]\d{2}/.test(words)) {
          if (OUT_HEADING.test(words)) heading = 'out'
          else if (IN_HEADING.test(words)) heading = 'in'
        }
      }
      return
    }

    let description = line.slice(lead[0].length, tail.index).trim()
    // A second date (the day it posted, next to the day of the purchase) belongs to neither.
    const second = LEAD_DATE.exec(`${description} `)
    if (second && placeDate(second[1]!, known, today)) description = description.slice(second[0].length).trim()
    // So does the bank's reference number before the description ("1234567AB1CDEFG2H").
    const reference = /^(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{12,}\s+(?=\S)/.exec(description)
    if (reference) description = description.slice(reference[0].length)
    if (NOT_A_TRANSACTION.test(description) || !description) {
      if (BALANCE_LINE.test(description)) {
        const b = printed(tail[2] ?? tail[1]!)
        if (b) balance = b.cents
      }
      return
    }
    const posted = placeDate(lead[1]!, known, today)
    if (!posted) { problems.push({ line: i + 1, problem: `No date in "${lead[1]}"` }); return }
    const amount = printed(tail[1]!)
    if (!amount) { problems.push({ line: i + 1, problem: 'No amount' }); return }
    const after = tail[2] ? printed(tail[2])?.cents ?? null : null
    found.push({ line: i + 1, posted, description: description.slice(0, 500), amount, balance: after, heading })
    opening.push(balance)
    if (after !== null) balance = after
  })

  const statementSigns = found.some(c => c.amount.signed)
  const rows = found.map((c, i): StatementRow => {
    const size = Math.abs(c.amount.cents)
    let cents: number
    const before = opening[i] ?? null
    if (c.amount.marker) cents = c.amount.marker === 'CR' ? size : -size
    else if (c.balance !== null && before !== null && Math.abs(c.balance - before) === size && size) {
      // A card's balance is what's owed: it grows with a charge.
      cents = (c.balance > before) !== !!options.liability ? size : -size
    }
    else if (statementSigns) cents = options.liability ? -c.amount.cents : c.amount.cents
    else cents = c.heading === 'in' ? size : -size
    if (options.flip) cents = -cents
    return { posted: c.posted, amount_cents: cents === 0 ? 0 : cents, description: c.description }
  })
  if (!rows.length && !problems.length) problems.push({ line: 1, problem: 'No line starts with a date and ends with an amount' })
  return { rows, problems }
}
