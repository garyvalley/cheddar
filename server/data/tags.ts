import { tagTotals, tagsOf, type TagTotal } from "~~/shared/tags";
import { transactionFilter } from "./transactions";
import type { Session } from "./session";

/**
 * Tags (shared/tags.ts): what each came to between `from` and `to` (in
 * `account`, or every counted one), over the transactions that count, and
 * every tag the person has used, any date, to offer as they type.
 */
export async function tagsBetween(
  s: Session,
  q: { from?: string; to?: string; account?: string },
): Promise<{ totals: TagTotal[]; known: string[] }> {
  const read = (filter: string) =>
    s.collection("transactions").getFullList({ fields: "amount_cents,tags", filter });
  const [rows, all] = await Promise.all([
    read(transactionFilter(s, { ...q, counted: true, tagged: true })),
    read(transactionFilter(s, { tagged: true, uncounted: true })),
  ]);
  const known = tagTotals(all.map((r) => ({ amount_cents: 0, tags: tagsOf(r.tags) })))
    .map((t) => t.tag)
    .sort((a, b) => a.localeCompare(b));
  return {
    totals: tagTotals(rows.map((r) => ({ amount_cents: r.amount_cents ?? 0, tags: tagsOf(r.tags) }))),
    known,
  };
}
