import { localToday } from "~~/shared/categories";
import {
  LOOKBACK_YEARS,
  recurring,
  type Charge,
  type RecurringSummary,
} from "~~/shared/recurring";
import { COUNTED, TX_COUNTED } from "../accounts";
import { listCategories } from "../categories";
import type { Session } from "../session";

/**
 * The subscriptions and bills in the last few years' spending
 * (shared/recurring.ts), in one account or all of them.
 */
export async function recurringCharges(
  s: Session,
  account?: string,
  today = localToday(),
): Promise<RecurringSummary> {
  const from = `${Number(today.slice(0, 4)) - LOOKBACK_YEARS}${today.slice(4)}`;
  const [rows, list] = await Promise.all([
    s.collection("transactions").getFullList({
      fields:
        "account,posted,amount_cents,merchant_key,payee,description,category,pending",
      filter: s.filter(
        `posted >= {:from} && amount_cents < 0 && pending = false && ${TX_COUNTED} && ${account ? "account = {:account}" : COUNTED}`,
        { from, account: account ?? "" },
      ),
    }) as Promise<unknown> as Promise<Charge[]>,
    listCategories(s),
  ]);
  return recurring(rows, list, today);
}
