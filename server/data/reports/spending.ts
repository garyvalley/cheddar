import { budgetFor, isWholeMonth } from "~~/shared/budgets";
import { summarize, type SpendingSummary } from "~~/shared/categories";
import { expandSplits } from "~~/shared/splits";
import { budgetsForMonth, listBudgets } from "../budgets";
import { listCategories } from "../categories";
import { transactionsBetween } from "../transactions";
import type { Session } from "../session";

/** What each category came to between two dates, and the spending of the same span before. */
export async function spendingSummary(
  s: Session,
  q: {
    account?: string;
    from: string;
    to: string;
    previous: { from: string; to: string };
  },
): Promise<SpendingSummary> {
  const rows = async (range: { from: string; to: string }) =>
    expandSplits(
      await transactionsBetween(s, range.from, range.to, {
        account: q.account,
        counted: true,
      }),
    );
  const [now, before, list, budgets] = await Promise.all([
    rows(q),
    rows(q.previous),
    listCategories(s),
    // A month as a whole also gets what rolled over into it.
    isWholeMonth(q.from, q.to)
      ? budgetsForMonth(s, q.from.slice(0, 7))
      : listBudgets(s).then((list) => list.map((b) => ({ ...b, carry_cents: 0 }))),
  ]);
  const summary = summarize(now, list);
  // Each budget scaled to the span shown; a budgeted category with nothing
  // spent yet is listed too, at zero.
  const budget = new Map(
    budgets.map((b) => [b.category, budgetFor(b.amount_cents, q.from, q.to) + b.carry_cents]),
  );
  const whole = isWholeMonth(q.from, q.to);
  const carry = new Map(budgets.filter((b) => whole && b.rollover).map((b) => [b.category, b.carry_cents]));
  for (const c of summary.categories)
    if (budget.has(c.id)) {
      c.budget_cents = budget.get(c.id);
      if (carry.has(c.id)) c.carry_cents = carry.get(c.id);
    }
  const listed = new Set(summary.categories.map((c) => c.id));
  const unspent = list
    .filter((c) => c.spending && budget.has(c.id) && !listed.has(c.id))
    .map((c) => ({
      id: c.id,
      label: c.label,
      spending: true,
      custom: c.custom,
      shared: c.shared,
      total_cents: 0,
      count: 0,
      budget_cents: budget.get(c.id),
      ...(carry.has(c.id) ? { carry_cents: carry.get(c.id) } : {}),
    }));
  const at = summary.categories.findIndex((c) => !c.spending);
  summary.categories.splice(at === -1 ? summary.categories.length : at, 0, ...unspent);
  return {
    from: q.from,
    to: q.to,
    ...summary,
    previous_spent_cents: summarize(before, list).spent_cents,
  };
}
