import { localToday } from "~~/shared/categories";
import { asHeld, isInvestment, lastMonths, monthly } from "~~/shared/overview";
import {
  PACE_MONTHS,
  debts,
  invested,
  savings,
  type Projections,
} from "~~/shared/projections";
import { expandSplits } from "~~/shared/splits";
import { listAccounts } from "../accounts";
import { listCategories } from "../categories";
import { balanceHistory, transactionsBetween } from "../transactions";
import type { Session } from "../session";

/**
 * Projections' numbers (shared/projections.ts): the last whole months'
 * income and spending for the savings rate, what's invested now, and each
 * debt with the pace it's being paid down. The page projects from them on
 * the assumptions the person picks.
 */
export async function projections(
  s: Session,
  today = localToday(),
): Promise<Projections> {
  const months = lastMonths(today, PACE_MONTHS + 1).slice(0, PACE_MONTHS);
  const [all, fetched, kept, list] = await Promise.all([
    listAccounts(s, true),
    transactionsBetween(s, `${months[0]}-01`, `${months.at(-1)}-31`, {
      ownedOnly: true,
    }),
    balanceHistory(s, { ownedOnly: true }),
    listCategories(s),
  ]);
  const rows = expandSplits(fetched);
  // Leaving one out changes what was earned and spent, not what a debt owes.
  const monthsIn = monthly(
    rows.filter((r) => !r.excluded),
    months,
    list,
  );
  const { open, history } = asHeld(all, kept);
  return {
    months: monthsIn,
    savings: savings(monthsIn),
    invested_cents: invested(open),
    has_investments: open.some(
      (a) => isInvestment(a.kind) && a.balance_cents !== null,
    ),
    debts: debts(open, rows, history, months),
  };
}
