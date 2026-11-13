import type { Budget } from "~~/shared/budgets";
import { callerId, type Session } from "./session";

/** The caller's own budgets, one per category. */
export async function listBudgets(s: Session): Promise<Budget[]> {
  return (
    await s.collection("budgets").getFullList({
      fields: "category,amount_cents",
      sort: "category",
    })
  ).map((r) => ({ category: r.category, amount_cents: r.amount_cents }));
}

/** Sets the caller's monthly budget for a category, or removes it (null). */
export async function setBudget(
  s: Session,
  category: string,
  amount_cents: number | null,
): Promise<Budget | null> {
  const found = await s
    .collection("budgets")
    .getFirstListItem(s.filter("category = {:category}", { category }))
    .catch((e: { status?: number }) => {
      if (e?.status === 404) return null;
      throw e;
    });
  if (amount_cents === null) {
    if (found) await s.collection("budgets").delete(found.id);
    return null;
  }
  const r = found
    ? await s.collection("budgets").update(found.id, { amount_cents })
    : await s
        .collection("budgets")
        .create({ owner: callerId(s), category, amount_cents });
  return { category: r.category, amount_cents: r.amount_cents };
}
