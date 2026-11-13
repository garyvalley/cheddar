import { localToday } from "~~/shared/categories";
import { expandSplits } from "~~/shared/splits";
import { taxYear, type TaxYear } from "~~/shared/taxes";
import { COUNTED, listAccounts } from "../accounts";
import { transactionsBetween } from "../transactions";
import { callerId, type Session } from "../session";

/**
 * A tax year from its transactions (shared/taxes.ts): this year so far, or
 * a past one whole. The earliest transaction the person has at all says
 * where their data starts.
 */
export async function taxes(
  s: Session,
  today = localToday(),
  year = Number(today.slice(0, 4)),
): Promise<TaxYear> {
  const jan1 = `${year}-01-01`;
  const end = `${year}-12-31` < today ? `${year}-12-31` : today;
  const owner = callerId(s);
  const [accounts, fetched, first] = await Promise.all([
    listAccounts(s, true),
    transactionsBetween(s, jan1, end, { ownedOnly: true, counted: true }),
    s.collection("transactions").getList(1, 1, {
      fields: "posted",
      sort: "posted",
      skipTotal: true,
      filter: s.filter(`owner = {:owner} && ${COUNTED}`, { owner }),
    }),
  ]);
  return taxYear(
    expandSplits(fetched),
    accounts,
    today,
    (first.items[0]?.posted as string | undefined) ?? "",
    year,
  );
}
