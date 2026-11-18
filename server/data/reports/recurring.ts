import {
  LOOKBACK_YEARS,
  recurring,
  type Charge,
  type RecurringSummary,
} from "~~/shared/recurring";
import { listCategories } from "../categories";
import type { Session } from "../session";
import { transactionsBetween } from "../transactions";

/**
 * The subscriptions and bills in the last few years' spending
 * (shared/recurring.ts), in one account or all of them.
 */
export async function recurringCharges(
  s: Session,
  today: string,
  account?: string,
): Promise<RecurringSummary> {
  const from = `${Number(today.slice(0, 4)) - LOOKBACK_YEARS}${today.slice(4)}`;
  const [rows, list] = await Promise.all([
    // Spending only, and only once it has posted.
    transactionsBetween(s, from, null, {
      account,
      counted: true,
      merchants: true,
      extra: "amount_cents < 0 && pending = false",
    }) as Promise<Charge[]>,
    listCategories(s),
  ]);
  return recurring(rows, list, today);
}
