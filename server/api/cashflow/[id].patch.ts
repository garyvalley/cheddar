import { getCashflowItem, updateCashflowItem } from "~~/server/data/cashflow";
import { todayFor } from "~~/server/data/profile";
import { listAccounts } from "~~/server/data/accounts";
import { recurringCharges } from "~~/server/data/reports/recurring";
import { attempt, sessionFor } from "~~/server/data/session";
import { checkCashflowItem } from "~~/shared/cashflow";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(
    getRouterParam(event, "id"),
    "That planned item isn't there.",
  );
  const current = await attempt(
    () => getCashflowItem(s, id),
    "That planned item isn't there.",
  );
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
  const checked = checkCashflowItem(
    {
      name: current.name,
      account: current.account,
      direction: current.direction,
      amount: current.amount_cents / 100,
      cadence: current.cadence,
      next_date: current.next_date,
      source_key: current.source_key,
      ...body,
    },
    accounts,
    today,
  );
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
  return {
    item: await attempt(
      () => updateCashflowItem(s, id, checked.ok),
      "That planned item isn't there.",
    ),
  };
});
