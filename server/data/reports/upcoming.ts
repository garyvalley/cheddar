import { cashflowForecast, type CashflowEvent } from '~~/shared/cashflow'
import type { Account } from '~~/shared/accounts'
import type { Recurring } from '~~/shared/recurring'
import { listAccounts } from '../accounts'
import { listCashflowItems } from '../cashflow'
import type { Session } from '../session'
import { recurringCharges } from './recurring'

/**
 * The days ahead of Cash flow's forecast from the caller's own accounts, as
 * Cash flow reads them, and the recurring charges it found in them: what
 * Spending's "Coming up" (GET /api/upcoming) and the bell's bills and price
 * rises (GET /api/notices) are made from.
 */
export async function forecastAhead(
  s: Session,
  today: string,
  days: number,
): Promise<{ accounts: Account[], events: CashflowEvent[], detected: Recurring[] }> {
  const [accounts, items, recurring] = await Promise.all([
    listAccounts(s, true),
    listCashflowItems(s),
    recurringCharges(s, today),
  ])
  const owned = new Set(accounts.map(a => a.id))
  const detected = recurring.items.filter(r => owned.has(r.account))
  return { accounts, events: cashflowForecast(accounts, items, detected, today, days).events, detected }
}
