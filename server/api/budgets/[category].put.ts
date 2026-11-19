import { setBudget } from '~~/server/data/budgets'
import { todayFor } from '~~/server/data/profile'
import { listCategories } from '~~/server/data/categories'
import { attempt, sessionFor } from '~~/server/data/session'
import { checkBudget } from '~~/shared/budgets'

/**
 * PUT /api/budgets/:category { amount, rollover?, shared? }: sets the
 * caller's monthly budget for one of their spending categories; an empty or
 * zero amount removes it (204). `rollover` true carries each month's
 * leftover into the next, starting with this month's; false stops it; left
 * out, it's kept. `shared` shares it with the caller's household, or stops
 * sharing it. A budget a member shared with the caller takes only a new
 * amount (server/data/budgets.ts).
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const s = sessionFor(event)
  const category = getRouterParam(event, 'category') ?? ''
  const list = await attempt(() => listCategories(s))
  if (!list.some(c => c.id === category && c.spending))
    throw createError({ statusCode: 404, statusMessage: 'No such spending category' })
  const body = await readFields<{ amount: unknown, rollover: unknown, shared: unknown }>(event, ['amount', 'rollover', 'shared'])
  if (body.rollover !== undefined && typeof body.rollover !== 'boolean')
    throw createError({ statusCode: 400, statusMessage: 'Rollover is on or off.' })
  if (body.shared !== undefined && typeof body.shared !== 'boolean')
    throw createError({ statusCode: 400, statusMessage: 'Shared is on or off.' })
  const checked = checkBudget(body.amount)
  if ('problem' in checked)
    throw createError({ statusCode: 400, statusMessage: checked.problem })
  const rollover
    = typeof body.rollover === 'boolean'
      ? { on: body.rollover, month: (await attempt(() => todayFor(s))).slice(0, 7) }
      : undefined
  let share: { on: boolean, household: string } | undefined
  if (typeof body.shared === 'boolean') {
    const household = body.shared
      ? (await attempt(() => s.send<{ household: { id: string } | null }>('/api/household', { method: 'GET' }))).household
      : null
    if (body.shared && !household)
      throw createError({ statusCode: 400, statusMessage: 'Start or join a household first (Settings → Household).' })
    share = { on: body.shared, household: household?.id ?? '' }
  }
  const budget = await attempt(() => setBudget(s, category, checked.ok, rollover, share))
  if (!budget) {
    setResponseStatus(event, 204)
    return
  }
  return { budget }
})
