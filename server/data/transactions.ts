import type { RecordModel } from "pocketbase";
import type { Transaction } from "~~/shared/accounts";
import type { BalancePoint } from "~~/shared/overview";
import { partsOf, type SplitPart } from "~~/shared/splits";
import type { EditFields, ManualFields } from "~~/shared/transactions";
import { COUNTED, TX_COUNTED } from "./accounts";
import { callerId, type Session } from "./session";

/**
 * Transactions, always as the signed-in person: the list and search pages
 * read, what a person adds or changes by hand, and the two reads every
 * report shares (transactionsBetween(), balanceHistory()).
 */

export const toTransaction = (r: RecordModel, person: string): Transaction => ({
  id: r.id,
  account: r.account,
  posted: r.posted,
  amount_cents: r.amount_cents ?? 0,
  description: r.description ?? "",
  payee: r.payee ?? "",
  category: r.category ?? "",
  category_by: r.category_by ?? "",
  pending: !!r.pending,
  source: r.source,
  note: r.note ?? "",
  excluded: !!r.excluded,
  reviewed: !!r.reviewed,
  shared: r.owner !== person,
  splits: partsOf(r.splits),
});

export const PAGE_SIZE = 50;

export interface TransactionQuery {
  account?: string;
  /** A category id; "other" also finds what isn't sorted yet. */
  category?: string;
  /** YYYY-MM-DD, both ends included. */
  from?: string;
  to?: string;
  /** Also the accounts left out of every page's numbers, as an export reads them. Picking one account always does. */
  uncounted?: boolean;
  /** Words its description, name or note contain. */
  q?: string;
  /** Its size in whole cents, money in or out alike; both ends included. */
  min?: number | null;
  max?: number | null;
  /** Only transactions that count toward a total: none the person left out one by one. */
  counted?: boolean;
  /** Whether the person has reviewed the transaction. */
  reviewed?: boolean;
  /** Only rows owned by the caller, for personal exports. */
  ownedOnly?: boolean;
}

export function transactionFilter(s: Session, q: TransactionQuery): string {
  const parts: string[] = [];
  const params: Record<string, string | number | boolean> = {};
  if (q.account) {
    parts.push("account = {:account}");
    params.account = q.account;
  } else if (!q.uncounted) parts.push(COUNTED);
  // A split one is in each of its parts' categories instead of its own
  // (PocketBase stores the parts as compact JSON, keys in order).
  if (q.category) {
    const own =
      q.category === "other"
        ? "(category = 'other' || category = '')"
        : "category = {:category}";
    parts.push(`((splits = null && ${own}) || splits ~ {:part})`);
    Object.assign(params, {
      category: q.category,
      part: `"category":"${q.category}"`,
    });
  }
  if (q.from) {
    parts.push("posted >= {:from}");
    params.from = q.from;
  }
  if (q.to) {
    parts.push("posted <= {:to}");
    params.to = q.to;
  }
  if (q.q) {
    parts.push("(description ~ {:q} || payee ~ {:q} || note ~ {:q})");
    params.q = q.q;
  }
  if (q.reviewed !== undefined) {
    parts.push("reviewed = {:reviewed}");
    params.reviewed = q.reviewed;
  }
  if (q.ownedOnly) {
    parts.push("owner = {:owner}");
    params.owner = callerId(s);
  }
  // By size: -$80 and +$80 are both "$80".
  if (q.min != null || q.max != null) {
    const lo = q.min ?? 0;
    const hi = q.max ?? Number.MAX_SAFE_INTEGER;
    parts.push(
      "((amount_cents >= {:lo} && amount_cents <= {:hi}) || (amount_cents >= {:nhi} && amount_cents <= {:nlo}))",
    );
    Object.assign(params, { lo, hi, nlo: -lo, nhi: -hi });
  }
  if (q.counted) parts.push(TX_COUNTED);
  return s.filter(parts.join(" && "), params);
}

export async function listTransactions(
  s: Session,
  q: TransactionQuery & { page: number },
) {
  const filter = transactionFilter(s, q);
  const list = await s.collection("transactions").getList(q.page, PAGE_SIZE, {
    sort: "-posted,-created",
    ...(filter ? { filter } : {}),
  });
  return {
    items: list.items.map((r) => toTransaction(r, callerId(s))),
    page: list.page,
    pages: list.totalPages,
    total: list.totalItems,
  };
}

/** Every transaction a query finds, oldest first, as a download lists them. */
export async function allTransactions(
  s: Session,
  q: TransactionQuery,
): Promise<(Transaction & { import: string })[]> {
  const filter = transactionFilter(s, q);
  const rows = await s.collection("transactions").getFullList({
    sort: "posted,created",
    fields:
      "id,owner,account,import,posted,amount_cents,description,payee,category,category_by,pending,source,note,excluded,splits",
    ...(filter ? { filter } : {}),
  });
  return rows.map((r) => ({
    ...toTransaction(r, callerId(s)),
    import: r.import ?? "",
  }));
}

/** One of the caller's transactions; a 404 from the store for anyone else's. */
export async function getTransaction(
  s: Session,
  id: string,
): Promise<Transaction> {
  return toTransaction(
    await s.collection("transactions").getOne(id),
    callerId(s),
  );
}

/**
 * Adds a transaction by hand (shared/transactions.ts checked it), to an
 * account the caller's route has made sure no bank link keeps; the hooks
 * sort it into a category as it saves.
 */
export async function addTransaction(
  s: Session,
  account: string,
  t: ManualFields,
): Promise<Transaction> {
  return toTransaction(
    await s.collection("transactions").create({
      ...t,
      owner: callerId(s),
      account,
      source: "manual",
    }),
    callerId(s),
  );
}

/**
 * Changes what the person may change about a transaction. Only the fields
 * named in EditFields ever reach the store: never its account, owner or
 * category.
 */
export async function editTransaction(
  s: Session,
  id: string,
  change: EditFields & { splits?: SplitPart[] },
): Promise<Transaction> {
  const { payee, note, excluded, posted, amount_cents, description } = change;
  const body: Record<string, unknown> = Object.fromEntries(
    Object.entries({
      payee,
      note,
      excluded,
      posted,
      amount_cents,
      description,
    }).filter(([, v]) => v !== undefined),
  );
  // An empty list undoes a split (pb_hooks/splits.pb.js checks the parts).
  if (change.splits) body.splits = change.splits.length ? change.splits : null;
  return toTransaction(
    await s.collection("transactions").update(id, body),
    callerId(s),
  );
}

export async function markTransactionsReviewed(
  s: Session,
  ids: string[],
  reviewed: boolean,
): Promise<number> {
  const batch = s.createBatch();
  const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
  const filter = ids.map((_, i) => `id = {:id${i}}`).join(" || ");
  const found = await s
    .collection("transactions")
    .getFullList({ fields: "id", filter: s.filter(filter, params) });
  if (found.length !== ids.length)
    throw Object.assign(new Error("That transaction isn't there."), {
      status: 404,
    });
  for (const id of ids)
    batch.collection("transactions").update(id, { reviewed });
  await batch.send();
  return ids.length;
}

export async function deleteTransaction(s: Session, id: string): Promise<void> {
  await s.collection("transactions").delete(id);
}

/**
 * Moves a transaction to another category (pb_hooks/categories.pb.js): the
 * merchant's other transactions, and its next ones, follow. Answers how many
 * others moved.
 */
export function recategorize(
  s: Session,
  id: string,
  category: string,
): Promise<{ transaction: { id: string; category: string }; moved: number }> {
  return s.send(`/api/transactions/${encodeURIComponent(id)}/category`, {
    method: "POST",
    body: { category },
  });
}

/** A transaction as the reports read it: enough to total, split and count it. */
export interface ReportRow {
  account: string;
  posted: string;
  amount_cents: number;
  category: string;
  excluded: boolean;
  splits: unknown;
}

/**
 * Every transaction posted from `from` to `to` (both included) in the
 * accounts that count, for a report: the caller's own only with `ownedOnly`
 * (Projections, Taxes), and none the person left out one by one with
 * `counted`. `extra` narrows it further (a PocketBase filter, no params).
 */
export async function transactionsBetween(
  s: Session,
  from: string,
  to: string,
  opts: { ownedOnly?: boolean; counted?: boolean; extra?: string } = {},
): Promise<ReportRow[]> {
  const parts = ["posted >= {:from} && posted <= {:to}", COUNTED];
  if (opts.ownedOnly) parts.push("owner = {:owner}");
  if (opts.counted) parts.push(TX_COUNTED);
  if (opts.extra) parts.push(opts.extra);
  return (await s.collection("transactions").getFullList({
    fields: "account,posted,amount_cents,category,excluded,splits",
    filter: s.filter(parts.join(" && "), {
      from,
      to,
      owner: opts.ownedOnly ? callerId(s) : "",
    }),
  })) as unknown as ReportRow[];
}

/** The daily balances Cheddar has seen (balance_history), oldest first: the caller's own only with `ownedOnly`. */
export async function balanceHistory(
  s: Session,
  opts: { ownedOnly?: boolean } = {},
): Promise<BalancePoint[]> {
  return (await s.collection("balance_history").getFullList({
    fields: "account,date,balance_cents",
    sort: "date",
    ...(opts.ownedOnly
      ? { filter: s.filter("owner = {:owner}", { owner: callerId(s) }) }
      : {}),
  })) as unknown as BalancePoint[];
}
