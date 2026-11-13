import { setBudget } from "~~/server/data/budgets";
import { listCategories } from "~~/server/data/money";
import { attempt, sessionFor } from "~~/server/data/session";
import { checkBudget } from "~~/shared/budgets";

/**
 * PUT /api/budgets/:category { amount }: sets the caller's monthly budget for
 * one of their spending categories; an empty or zero amount removes it (204).
 */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const category = getRouterParam(event, "category") ?? "";
  const list = await attempt(() => listCategories(s));
  if (!list.some((c) => c.id === category && c.spending))
    throw createError({ statusCode: 404, statusMessage: "No such spending category" });
  const body = await readFields<{ amount: unknown }>(event, ["amount"]);
  const checked = checkBudget(body.amount);
  if ("problem" in checked)
    throw createError({ statusCode: 400, statusMessage: checked.problem });
  const budget = await attempt(() => setBudget(s, category, checked.ok));
  if (!budget) {
    setResponseStatus(event, 204);
    return;
  }
  return { budget };
});
