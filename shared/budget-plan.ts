/**
 * The monthly budget plan (Spending → Monthly plan, issue #89): every
 * spending category's monthly budget beside what it came to in one month,
 * the plan's totals, and a suggestion from the months before. Budgets are
 * the person's own and repeat every month (shared/budgets.ts); a plan is
 * what the spending should come to, not money set aside: Cheddar moves
 * nothing. Pure, so the server, the page (totals as the person types) and
 * the tests share it.
 */

/** How many whole months before the one shown a suggestion is averaged over. */
export const SUGGEST_MONTHS = 3

export interface PlanLine {
  id: string
  label: string
  custom: boolean
  /** The monthly budget, or null with none. */
  budget_cents: number | null
  /** Whether the budget rolls over (shared/budgets.ts). */
  rollover: boolean
  /** What rolled over into this month: left from the months before, negative when they went over. 0 when it doesn't roll over. */
  carry_cents: number
  /** What the category came to in the month (spending is positive; a refund-heavy month can be negative). */
  spent_cents: number
  /** The months before's average, rounded up to whole $10; null with nothing spent then. A suggestion only. */
  suggested_cents: number | null
}

export interface PlanTotals {
  /** The budgets added up. */
  planned_cents: number
  /** What the budgeted categories came to. */
  spent_budgeted_cents: number
  /** What rolled over into the budgeted categories (negative when they went over before). */
  carry_cents: number
  /** planned + carry − spent in budgeted categories; negative when over. */
  remaining_cents: number
  /** What categories without a budget came to. */
  unbudgeted_cents: number
  /** The month's income less the plan: income no budget accounts for yet (negative when the plan is more). */
  unplanned_income_cents: number
}

export interface BudgetPlan extends PlanTotals {
  /** YYYY-MM */
  month: string
  /** The month's income, as Spending counts it. */
  income_cents: number
  lines: PlanLine[]
}

/** An average of past months' spending, rounded up to whole $10 so it reads as a plan; null for nothing. */
export function suggestion(months: number[]): number | null {
  if (!months.length) return null
  const avg = months.reduce((s, m) => s + Math.max(0, m), 0) / months.length
  return avg > 0 ? Math.ceil(avg / 1000) * 1000 : null
}

/** The plan's totals for its lines (as typed, before they're saved) and the month's income. */
export function planTotals(lines: (Pick<PlanLine, 'budget_cents' | 'spent_cents'> & { carry_cents?: number })[], income_cents: number): PlanTotals {
  let planned = 0
  let carry = 0
  let spentBudgeted = 0
  let unbudgeted = 0
  for (const l of lines) {
    if (l.budget_cents) {
      planned += l.budget_cents
      carry += l.carry_cents ?? 0
      spentBudgeted += l.spent_cents
    }
    else unbudgeted += l.spent_cents
  }
  return {
    planned_cents: planned,
    carry_cents: carry,
    spent_budgeted_cents: spentBudgeted,
    remaining_cents: planned + carry - spentBudgeted,
    unbudgeted_cents: unbudgeted,
    unplanned_income_cents: income_cents - planned,
  }
}

/**
 * The plan for `month`: every spending category in `categories` (others',
 * shared ones are left out: a budget is on the person's own list), its
 * budget, what `spent` says it came to, and a suggestion from `before` (the
 * months before, each a map of category id to what it came to). Budgeted
 * ones first, then by what they came to.
 */
export function budgetPlan(q: {
  month: string
  income_cents: number
  categories: { id: string, label: string, spending: boolean, custom: boolean, shared?: boolean }[]
  budgets: { category: string, amount_cents: number, rollover?: boolean, carry_cents?: number }[]
  spent: Map<string, number>
  before: Map<string, number>[]
}): BudgetPlan {
  const budget = new Map(q.budgets.map(b => [b.category, b]))
  const lines: PlanLine[] = q.categories
    .filter(c => c.spending && !c.shared)
    .map(c => ({
      id: c.id,
      label: c.label,
      custom: c.custom,
      budget_cents: budget.get(c.id)?.amount_cents || null,
      rollover: !!budget.get(c.id)?.rollover,
      carry_cents: budget.get(c.id)?.carry_cents ?? 0,
      spent_cents: q.spent.get(c.id) ?? 0,
      suggested_cents: suggestion(q.before.map(m => m.get(c.id) ?? 0)),
    }))
    .sort((a, b) => Number(!!b.budget_cents) - Number(!!a.budget_cents) || b.spent_cents - a.spent_cents || a.label.localeCompare(b.label))
  return { month: q.month, income_cents: q.income_cents, lines, ...planTotals(lines, q.income_cents) }
}

/**
 * Moves `cents` of budget from one line to another, as the page's "Move"
 * does: never more than the first has, and the lines are otherwise left as
 * they are. Answers the new budgets, or a problem to show.
 */
export function moveBudget(
  from: number | null,
  to: number | null,
  cents: number,
): { from: number | null, to: number } | { problem: string } {
  if (!(cents > 0)) return { problem: 'Enter an amount to move.' }
  if ((from ?? 0) < cents) return { problem: 'That\'s more than its budget has.' }
  const left = (from ?? 0) - cents
  return { from: left || null, to: (to ?? 0) + cents }
}
