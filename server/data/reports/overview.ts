import { overBudget } from "~~/shared/budgets";
import { localToday, summarize } from "~~/shared/categories";
import {
  GROWTH_PERIODS,
  asHeld,
  growth,
  growthStart,
  isInvestment,
  lastMonths,
  monthly,
  netWorth,
  netWorthChange,
  type Overview,
} from "~~/shared/overview";
import { expandSplits } from "~~/shared/splits";
import { counted } from "../accounts";
import { listBudgets } from "../budgets";
import { listCategories } from "../categories";
import { balanceHistory, transactionsBetween } from "../transactions";
import type { Session } from "../session";

/**
 * Overview's numbers (shared/overview.ts): net worth and its change since a
 * month ago, the last 12 months' income and spending, and the investment
 * accounts' growth over each period.
 */
export async function overview(
  s: Session,
  today = localToday(),
): Promise<Overview> {
  const months = lastMonths(today, 12);
  const [all, fetched, kept, list, budgets] = await Promise.all([
    counted(s),
    transactionsBetween(s, `${months[0]}-01`, `${months.at(-1)}-31`),
    balanceHistory(s),
    listCategories(s),
    listBudgets(s),
  ]);
  // Totals count a split one as its parts (shared/splits.ts).
  const rows = expandSplits(fetched);
  const thisMonth = summarize(
    rows.filter((r) => !r.excluded && r.posted.startsWith(today.slice(0, 7))),
    list,
  ).categories;
  const { open, accounts, history } = asHeld(all, kept);
  const invested = accounts.filter(
    (a) => isInvestment(a.kind) && a.balance_cents !== null,
  );
  const ids = new Set(invested.map((a) => a.id));
  // Transfers into the investment accounts aren't growth. Older ones than the
  // year above only matter to "All", so they're read only when there's history that old.
  const oldest = history.reduce(
    (d, p) => (ids.has(p.account) && p.date < d ? p.date : d),
    `${months[0]}-01`,
  );
  const older =
    oldest < `${months[0]}-01` && ids.size
      ? await transactionsBetween(s, oldest, `${months[0]}-01`, {
          extra: `posted < '${months[0]}-01' && category = 'transfer'`,
        })
      : [];
  const transfers = [...older, ...rows].filter(
    (r) => ids.has(r.account) && r.category === "transfer",
  );
  return {
    net_worth: netWorth(open),
    change: netWorthChange(accounts, history, growthStart("1m", today)),
    months: monthly(
      rows.filter((r) => !r.excluded),
      months,
      list,
    ),
    has_investments: open.some(
      (a) => isInvestment(a.kind) && a.balance_cents !== null,
    ),
    growth: GROWTH_PERIODS.map((p) =>
      growth(accounts, history, transfers, p.id, today),
    ),
    over_budget: overBudget(
      thisMonth,
      budgets.map((b) => ({ category: b.category, budget_cents: b.amount_cents })),
    ),
  };
}
