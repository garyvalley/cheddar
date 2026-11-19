import { monthEnd, monthsFrom, report, yearReview, type Report, type YearReview } from '~~/shared/reports'
import { expandSplits } from '~~/shared/splits'
import { listCategories } from '../categories'
import { transactionsBetween } from '../transactions'
import type { Session } from '../session'

/**
 * Reports' trends (shared/reports.ts) from `from` to `to` ("YYYY-MM", both
 * included): every counted transaction in them, shared accounts too, as
 * Spending counts them.
 */
export async function trends(s: Session, from: string, to: string): Promise<Report> {
  const [rows, list] = await Promise.all([
    transactionsBetween(s, `${from}-01`, monthEnd(to), { counted: true, merchants: true }),
    listCategories(s),
  ])
  return report(expandSplits(rows), monthsFrom(from, to), list)
}

/** A year in review, against the year before. */
export async function yearInReview(s: Session, year: number, today: string): Promise<YearReview> {
  const [rows, before, list] = await Promise.all([
    transactionsBetween(s, `${year}-01-01`, `${year}-12-31`, { counted: true, merchants: true }),
    transactionsBetween(s, `${year - 1}-01-01`, `${year - 1}-12-31`, { counted: true }),
    listCategories(s),
  ])
  return yearReview(year, expandSplits(rows), expandSplits(before), today, list, rows.length)
}
