import { createCashflowItem } from "~~/server/data/cashflow";
import { todayFor } from "~~/server/data/profile";
import { listAccounts } from "~~/server/data/accounts";
import { recurringCharges } from "~~/server/data/reports/recurring";
import { attempt, sessionFor } from "~~/server/data/session";
import { checkCashflowItem } from "~~/shared/cashflow";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const body = await readFields<Record<string, unknown>>(event, [
    "name",
    "account",
    "direction",
    "amount",
    "cadence",
    "next_date",
    "source_key",
  ]);
  const [accounts, today] = await Promise.all([
    attempt(() => listAccounts(s, true)),
    attempt(() => todayFor(s)),
  ]);
  const checked = checkCashflowItem(body, accounts, today);
  if ("problem" in checked)
    throw createError({ statusCode: 400, statusMessage: checked.problem });
  if (checked.ok.source_key) {
    const detected = await attempt(() => recurringCharges(s, undefined, today));
    if (
      !detected.items.some(
        (item) =>
          item.key === checked.ok.source_key &&
          item.account === checked.ok.account,
      )
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "That recurring charge is no longer available to plan.",
      });
    }
  }
  setResponseStatus(event, 201);
  return { item: await attempt(() => createCashflowItem(s, checked.ok)) };
});
