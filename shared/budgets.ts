/**
 * Monthly budgets: an optional amount per spending category (built in or the
 * person's own), kept per person in the `budgets` collection. Spending shows
 * what was spent against the budget for the span shown, scaled from the
 * monthly amount; Overview lists the categories over it this month.
 *
 * A budget can roll over (issue #107): from the month it was turned on,
 * what each whole month left unspent, or spent beyond it, carries into the
 * next, so an irregular cost (car repairs, gifts) evens out. The carry is
 * worked out from the months' spending each time it's shown, with the
 * budget's current amount, and only for a month as a whole.
 */
import { daysIn } from "./categories.ts";
import { parseAmount } from "./transactions.ts";

export interface Budget {
  /** A category id: built in, or "c-" and the person's own category's id. */
  category: string;
  /** What the category should come to in a month. */
  amount_cents: number;
  /** Whether what's left (or overspent) carries into the next month. */
  rollover: boolean;
  /** YYYY-MM: the first month whose leftover carries; "" when it doesn't roll over. */
  rollover_from: string;
}

/** "2026-11" → "2026-12". */
export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The months from `from` up to, not including, `until` (both YYYY-MM), oldest first. */
export function monthsBefore(from: string, until: string): string[] {
  const out: string[] = [];
  for (let m = from; m < until && out.length < 1200; m = nextMonth(m)) out.push(m);
  return out;
}

/**
 * What carries into `month` for a budget of `monthly_cents` rolling over
 * since `from`: each month before it, from `from` on, adds what it left
 * (monthly − spent), negative when it went over. `spent` maps YYYY-MM to
 * what the category came to then. 0 before rollover starts.
 */
export function carryInto(
  monthly_cents: number,
  from: string,
  month: string,
  spent: Map<string, number>,
): number {
  if (!/^\d{4}-\d{2}$/.test(from)) return 0;
  return monthsBefore(from, month).reduce((n, m) => n + monthly_cents - (spent.get(m) ?? 0), 0);
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

/** Whether `from`–`to` is exactly one calendar month: the only span a carry applies to. */
export function isWholeMonth(from: string, to: string): boolean {
  return from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7) && to === lastOfMonth(to);
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
