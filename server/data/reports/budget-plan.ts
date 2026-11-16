import { budgetPlan, SUGGEST_MONTHS, type BudgetPlan } from "~~/shared/budget-plan";
import { periodOf, summarize } from "~~/shared/categories";
import { expandSplits } from "~~/shared/splits";
import { budgetsForMonth } from "../budgets";
import { listCategories } from "../categories";
import { transactionsBetween } from "../transactions";
import type { Session } from "../session";

/**
 * The monthly plan (shared/budget-plan.ts) for `at` ("YYYY-MM", this month
 * by default): each category's budget beside what it came to that month,
 * as Spending counts it, and a suggestion from the SUGGEST_MONTHS before.
 */
export async function budgetPlanFor(
  s: Session,
  at: string | undefined,
  today: string,
): Promise<BudgetPlan & { label: string; prev: string; next: string }> {
  const p = periodOf("month", at, today);
  const months = [p];
  for (let i = 0; i < SUGGEST_MONTHS; i++) months.push(periodOf("month", months.at(-1)!.prev, today));
  const first = months.at(-1)!.from;
  const [rows, list, budgets] = await Promise.all([
    transactionsBetween(s, first, p.to, { counted: true }),
    listCategories(s),
    budgetsForMonth(s, p.at),
  ]);
  const flat = expandSplits(rows);
  const of = (from: string, to: string) => summarize(flat.filter((r) => r.posted >= from && r.posted <= to), list);
  const totals = (m: { from: string; to: string }) =>
    new Map(of(m.from, m.to).categories.filter((c) => c.spending).map((c) => [c.id, c.total_cents]));
  const now = of(p.from, p.to);
  return {
    ...budgetPlan({
      month: p.at,
      income_cents: now.income_cents,
      categories: list,
      budgets,
      spent: new Map(now.categories.filter((c) => c.spending).map((c) => [c.id, c.total_cents])),
      before: months.slice(1).map(totals),
    }),
    label: p.label,
    prev: p.prev,
    next: p.next,
  };
}
