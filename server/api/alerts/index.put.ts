import { saveAlertSettings } from '~~/server/data/alerts'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkAlertSettings } from '~~/shared/alerts'

/**
 * PUT /api/alerts { charge_over, balance_under, bills, budgets, banks,
 * weekly }: what the caller is emailed about. The amounts are as typed
 * ("500", or "" for off).
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const body = await readFields<Record<string, unknown>>(event, ['charge_over', 'balance_under', 'bills', 'budgets', 'banks', 'weekly'])
  const checked = checkAlertSettings(body)
  if ('problem' in checked) throw createError({ statusCode: 400, statusMessage: checked.problem })
  return { settings: await attempt(() => saveAlertSettings(s, checked.ok)) }
})
