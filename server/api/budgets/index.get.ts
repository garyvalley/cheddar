import { listBudgets } from "~~/server/data/budgets";
import { attempt, sessionFor } from "~~/server/data/session";

/** GET /api/budgets: the caller's monthly budget for each category that has one. */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event);
  return { budgets: await attempt(() => listBudgets(s)) };
});
