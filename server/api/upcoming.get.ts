import { listCashflowItems } from '~~/server/data/cashflow'
import { todayFor } from '~~/server/data/profile'
import { listAccounts } from '~~/server/data/accounts'
import { recurringCharges } from '~~/server/data/reports/recurring'
import { attempt, sessionFor } from '~~/server/data/session'
import { cashflowForecast } from '~~/shared/cashflow'
import { upcoming, UPCOMING_DAYS } from '~~/shared/upcoming'

/**
 * GET /api/upcoming: Overview's "Coming up" (shared/upcoming.ts): the next
 * week of the cash-flow forecast, from the caller's own accounts as Cash
 * flow reads them, and recent price rises in their recurring charges.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const today = await attempt(() => todayFor(s))
  const [accounts, items, recurring] = await Promise.all([
    attempt(() => listAccounts(s, true)),
    attempt(() => listCashflowItems(s)),
    attempt(() => recurringCharges(s, today)),
  ])
  const owned = new Set(accounts.map(a => a.id))
  const detected = recurring.items.filter(r => owned.has(r.account))
  const forecast = cashflowForecast(accounts, items, detected, today, UPCOMING_DAYS)
  return upcoming(forecast.events, detected, today)
})
