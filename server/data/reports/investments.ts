import { growthStart, isInvestment } from "~~/shared/overview";
import { investments, type Investments } from "~~/shared/investments";
import { localToday } from "~~/shared/categories";
import { expandSplits } from "~~/shared/splits";
import { counted } from "../accounts";
import { balanceHistory, transactionsBetween } from "../transactions";
import type { Session } from "../session";

/**
 * The Investments page's read model (shared/investments.ts): the counted
 * brokerage and retirement accounts, their history, and the transfers in and
 * out of them, which aren't growth.
 */
export async function investmentsReport(
  s: Session,
  today = localToday(),
): Promise<Investments> {
  const all = (await counted(s)).filter((a) => isInvestment(a.kind));
  if (!all.length) return investments([], [], [], today);
  const ids = new Set(all.map((a) => a.id));
  // Daily balances for the last year (the longest period but "All"), each month's first and last before.
  const history = (
    await balanceHistory(s, { dailyFrom: growthStart("1y", today) })
  ).filter((p) => ids.has(p.account));
  const oldest = history.reduce((d, p) => (p.date < d ? p.date : d), today);
  // Totals count a split one as its parts (shared/splits.ts).
  const transfers = expandSplits(
    await transactionsBetween(s, oldest, today, {
      counted: true,
      // Only these accounts' rows: record ids are PocketBase's own, checked before they go in the filter.
      extra: `(${[...ids].filter((id) => /^[a-z0-9]{15}$/.test(id)).map((id) => `account = '${id}'`).join(" || ") || "id = ''"})`,
    }),
  ).filter((r) => ids.has(r.account) && r.category === "transfer");
  return investments(all, history, transfers, today);
}
