import { carryFrom, withCarry, type Budget } from "~~/shared/budgets";
import { listCategories } from "./categories";
import { transactionsBetween } from "./transactions";
import { callerId, type Session } from "./session";

type BudgetRecord = { category: string; amount_cents: number; rollover?: boolean; rollover_from?: string };
const toBudget = (r: BudgetRecord): Budget => ({
  category: r.category,
  amount_cents: r.amount_cents,
  rollover: !!r.rollover,
  rollover_from: r.rollover ? (r.rollover_from ?? "") : "",
});

/** The caller's own budgets, one per category. */
export async function listBudgets(s: Session): Promise<Budget[]> {
  return (
    (await s.collection("budgets").getFullList({
      fields: "category,amount_cents,rollover,rollover_from",
      sort: "category",
    })) as unknown as BudgetRecord[]
  ).map(toBudget);
}

/**
 * Sets the caller's monthly budget for a category, or removes it (null).
 * `rollover` turns carrying on (from `month`, the person's this month) or
 * off; left out, it stays as it was.
 */
export async function setBudget(
  s: Session,
  category: string,
  amount_cents: number | null,
  rollover?: { on: boolean; month: string },
): Promise<Budget | null> {
  const found = (await s
    .collection("budgets")
    .getFirstListItem(s.filter("category = {:category}", { category }))
    .catch((e: { status?: number }) => {
      if (e?.status === 404) return null;
      throw e;
    })) as (BudgetRecord & { id: string }) | null;
  if (amount_cents === null) {
    if (found) await s.collection("budgets").delete(found.id);
    return null;
  }
  const fields: Record<string, unknown> = { amount_cents };
  if (rollover && rollover.on !== !!found?.rollover) {
    fields.rollover = rollover.on;
    fields.rollover_from = rollover.on ? rollover.month : "";
  }
  const r = (found
    ? await s.collection("budgets").update(found.id, fields)
    : await s.collection("budgets").create({ owner: callerId(s), category, ...fields })) as unknown as BudgetRecord;
  return toBudget(r);
}

/**
 * The caller's budgets for `month` (YYYY-MM), each with what carries into
 * it (`carry_cents`, 0 for one that doesn't roll over): from the spending
 * of every month since its rollover began, counted as Spending counts it.
 */
export async function budgetsForMonth(
  s: Session,
  month: string,
): Promise<(Budget & { carry_cents: number })[]> {
  const budgets = await listBudgets(s);
  const first = carryFrom(budgets, month);
  if (!first) return budgets.map((b) => ({ ...b, carry_cents: 0 }));
  const [rows, list] = await Promise.all([
    // Up to the end of the month before: no posted date is on or before "YYYY-MM-00".
    transactionsBetween(s, `${first}-01`, `${month}-00`, { counted: true }),
    listCategories(s),
  ]);
  return withCarry(budgets, rows, list, month);
}
