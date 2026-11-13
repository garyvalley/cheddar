import { budgetFor } from "~~/shared/budgets";
import { summarize, type SpendingSummary } from "~~/shared/categories";
import { expandSplits } from "~~/shared/splits";
import { listBudgets } from "../budgets";
import { listCategories } from "../categories";
import { transactionFilter } from "../transactions";
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
      (await s.collection("transactions").getFullList({
        fields: "amount_cents,category,splits",
        filter: transactionFilter(s, {
          account: q.account,
          ...range,
          counted: true,
        }),
      })) as unknown as {
        amount_cents: number;
        category: string;
        splits: unknown;
      }[],
    );
  const [now, before, list, budgets] = await Promise.all([
    rows(q),
    rows(q.previous),
    listCategories(s),
    listBudgets(s),
  ]);
  const summary = summarize(now, list);
  // Each budget scaled to the span shown; a budgeted category with nothing
  // spent yet is listed too, at zero.
  const budget = new Map(
    budgets.map((b) => [b.category, budgetFor(b.amount_cents, q.from, q.to)]),
  );
  for (const c of summary.categories)
    if (budget.has(c.id)) c.budget_cents = budget.get(c.id);
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
