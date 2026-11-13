import { listCashflowItems } from "~~/server/data/cashflow";
import { todayFor } from "~~/server/data/profile";
import { listAccounts, recurringCharges } from "~~/server/data/money";
import { attempt, sessionFor } from "~~/server/data/session";
import { cashflowForecast } from "~~/shared/cashflow";

export default defineEventHandler(async (event) => {
  const s = sessionFor(event);
  const rawDays = getQuery(event).days;
  const days = rawDays === undefined ? 30 : Number(rawDays);
  if (![30, 60, 90].includes(days))
    throw createError({
      statusCode: 400,
      statusMessage: "Choose a 30, 60, or 90 day view.",
    });
  const today = await attempt(() => todayFor(s));
  const [accounts, items, recurring] = await Promise.all([
    attempt(() => listAccounts(s, true)),
    attempt(() => listCashflowItems(s)),
    attempt(() => recurringCharges(s, undefined, today)),
  ]);
  const accountIds = new Set(accounts.map((account) => account.id));
  const detected = recurring.items.filter((item) =>
    accountIds.has(item.account),
  );
  return {
    ...cashflowForecast(accounts, items, detected, today, days),
    items,
    detected,
  };
});
