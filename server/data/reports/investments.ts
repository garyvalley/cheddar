import { growthStart, isInvestment } from "~~/shared/overview";
import { investments, type Investments } from "~~/shared/investments";
import { portfolio, type Portfolio, type Position } from "~~/shared/holdings";
import { listLinks } from "../bank-links";
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
): Promise<Investments & { holdings: Portfolio & { on: boolean } }> {
  const all = (await counted(s)).filter((a) => isInvestment(a.kind));
  if (!all.length) return { ...investments([], [], [], today), holdings: { ...portfolio([], [], false), on: false } };
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
  return { ...investments(all, history, transfers, today), holdings: await holdingsOf(s, all, today) };
}

/**
 * What the open investment accounts hold, position by position, and the
 * allocation (shared/holdings.ts). Positions are the person's own (the
 * `holdings` collection's rules); which link keeps each account, and why it
 * has none, comes from the bank-link routes.
 */
async function holdingsOf(
  s: Session,
  all: { id: string; balance_cents: number | null; owned?: boolean; closed_on: string }[],
  today: string,
): Promise<Portfolio & { on: boolean }> {
  const open = all.filter((a) => !(a.closed_on && a.closed_on <= today));
  const [links, rows] = await Promise.all([
    listLinks(s).catch(() => ({ enabled: false, links: [], holdings: false })),
    s.collection("holdings").getFullList({ sort: "-value_cents" }),
  ]);
  const linkOf = new Map<string, { id: string; holdings: string }>();
  for (const l of links.links) for (const a of l.accounts) linkOf.set(a.id, { id: l.id, holdings: l.holdings ?? "" });
  const positions: Position[] = rows.map((r) => ({
    account: r.account,
    name: r.name ?? "",
    ticker: r.ticker ?? "",
    type: r.type || "other",
    quantity: r.quantity ?? 0,
    // PocketBase keeps a missing number as 0: no price or cost basis is 0.
    price_cents: r.price_cents || null,
    value_cents: r.value_cents ?? 0,
    cost_basis_cents: r.cost_basis_cents || null,
    price_as_of: r.price_as_of ?? "",
    as_of: r.as_of ?? "",
  }));
  const on = !!links.holdings;
  return {
    ...portfolio(
      open.map((a) => ({ id: a.id, balance_cents: a.balance_cents, owned: a.owned !== false, link: linkOf.get(a.id) ?? null })),
      positions,
      on,
    ),
    on,
  };
}
