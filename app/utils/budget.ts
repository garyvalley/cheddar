/** What's left of a span's budget (negative when it's over), for a row with its spending and budget. */
export const overBy = (c: { total_cents: number, budget_cents?: number }) => (c.budget_cents ?? 0) - c.total_cents

/** How much of a span's budget is spent, as a bar's width (0% to 100%). */
export const budgetShare = (c: { total_cents: number, budget_cents?: number }) => `${Math.max(0, Math.min(100, (c.total_cents / Math.max(1, c.budget_cents ?? 0)) * 100)).toFixed(1)}%`
