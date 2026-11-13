/**
 * Monthly budgets: an optional amount per spending category (built in or the
 * person's own), kept per person in the `budgets` collection. Spending shows
 * what was spent against the budget for the span shown, scaled from the
 * monthly amount; Overview lists the categories over it this month.
 */
import { daysIn } from "./categories.ts";
import { parseAmount } from "./transactions.ts";

export interface Budget {
  /** A category id: built in, or "c-" and the person's own category's id. */
  category: string;
  /** What the category should come to in a month. */
  amount_cents: number;
}

/** The largest monthly budget accepted: $10 million. */
export const MAX_BUDGET_CENTS = 1_000_000_000;

/** A budget amount as typed: a positive amount of money, or "" / 0 to remove it. */
export function checkBudget(
  value: unknown,
): { ok: number | null } | { problem: string } {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim()))
    return { ok: null };
  const amount = parseAmount(value);
  if (!amount || amount.negative || amount.cents > MAX_BUDGET_CENTS)
    return { problem: "Enter a monthly budget of $0 or more, up to $10,000,000." };
  return { ok: amount.cents || null };
}

const lastOfMonth = (d: string) =>
  new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

/**
 * A monthly budget for the span `from`–`to`: whole months count the monthly
 * amount each, anything else its share by days (a week is 7/30.44 of it).
 */
export function budgetFor(monthly_cents: number, from: string, to: string): number {
  if (from.endsWith("-01") && to === lastOfMonth(to)) {
    const months =
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5, 7)) -
      Number(from.slice(5, 7)) +
      1;
    if (months > 0) return monthly_cents * months;
  }
  return Math.round((monthly_cents * daysIn(from, to) * 12) / 365.25);
}

export interface BudgetStatus {
  id: string;
  label: string;
  spent_cents: number;
  budget_cents: number;
}

/** The categories that came to more than their budget, most over first. */
export function overBudget(
  categories: { id: string; label: string; spending: boolean; total_cents: number }[],
  budgets: { category: string; budget_cents: number }[],
): BudgetStatus[] {
  const spent = new Map(categories.filter((c) => c.spending).map((c) => [c.id, c]));
  return budgets
    .flatMap((b) => {
      const c = spent.get(b.category);
      return c && c.total_cents > b.budget_cents
        ? [{ id: c.id, label: c.label, spent_cents: c.total_cents, budget_cents: b.budget_cents }]
        : [];
    })
    .sort((a, b) => b.spent_cents - b.budget_cents - (a.spent_cents - a.budget_cents));
}
