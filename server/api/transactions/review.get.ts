import { reviewCounts } from "~~/server/data/transactions";
import { attempt, sessionFor } from "~~/server/data/session";

/**
 * GET /api/transactions/review?account=: how many transactions wait for
 * review, { waiting, history }: `history` is what new bank links brought in
 * from before they were made (shared/review.ts), which Needs review leaves
 * out unless asked (GET /api/transactions?reviewed=false&history=false).
 */
export default defineEventHandler(async (event) => {
  const s = sessionFor(event);
  const { account } = readTransactionQuery(event);
  return await attempt(() => reviewCounts(s, account));
});
