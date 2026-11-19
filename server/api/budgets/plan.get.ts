import { todayFor } from '~~/server/data/profile'
import { budgetPlanFor } from '~~/server/data/reports/budget-plan'
import { attempt, sessionFor } from '~~/server/data/session'

/**
 * GET /api/budgets/plan?month=YYYY-MM: the monthly plan for that month (this
 * one by default): every spending category's monthly budget beside what it
 * came to, the plan's totals, and suggestions from the months before
 * (shared/budget-plan.ts). Budgets are changed with PUT /api/budgets/:category.
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event)
  const q = getQuery(event)
  const today = await attempt(() => todayFor(s))
  return await attempt(() => budgetPlanFor(s, typeof q.month === 'string' ? q.month : undefined, today))
})
