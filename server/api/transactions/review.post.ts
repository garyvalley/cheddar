import { markTransactionsReviewed } from "~~/server/data/transactions";
import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const { ids, reviewed } = await readFields<Record<string, unknown>>(event, [
    "ids",
    "reviewed",
  ]);
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string" || !id || id.length > 64)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose between 1 and 100 transactions.",
    });
  }
  if (new Set(ids).size !== ids.length)
    throw createError({
      statusCode: 400,
      statusMessage: "Choose each transaction only once.",
    });
  if (typeof reviewed !== "boolean")
    throw createError({
      statusCode: 400,
      statusMessage: "Say whether the transactions have been reviewed.",
    });
  const updated = await attempt(
    () => markTransactionsReviewed(s, ids as string[], reviewed),
    "That transaction isn't there.",
  );
  return { updated };
});
