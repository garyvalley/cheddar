import { createHash } from "node:crypto";
import type { RecordModel } from "pocketbase";
import type {
  Account,
  AccountChange,
  Import,
  NewAccount,
  Transaction,
} from "~~/shared/accounts";
import {
  localToday,
  summarize,
  type Category,
  type SpendingSummary,
} from "~~/shared/categories";
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
  type BalancePoint,
  type Overview,
} from "~~/shared/overview";
import {
  PACE_MONTHS,
  debts,
  invested,
  savings,
  type Projections,
} from "~~/shared/projections";
import { taxYear, type TaxYear } from "~~/shared/taxes";
import {
  LOOKBACK_YEARS,
  recurring,
  type Charge,
  type RecurringSummary,
} from "~~/shared/recurring";
import { alreadySynced, around, type Dated } from "~~/shared/overlap";
import type { EditFields, ManualFields } from "~~/shared/transactions";
import { expandSplits, partsOf, type SplitPart } from "~~/shared/splits";
import {
  dateRange,
  type StatementFormat,
  type StatementRow,
} from "~~/shared/statements";
import { callerId, type Session } from "./session";

/**
 * Accounts, their transactions and the statement files imported into them,
 * always as the signed-in person: PocketBase's rules
 * (migrations/0003_accounts_and_transactions.mjs) keep each person's to them.
 */

const toAccount = (r: RecordModel, person: string): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  institution: r.institution ?? "",
  last4: r.last4 ?? "",
  currency: r.currency || "USD",
  source: r.source ?? "",
  balance_cents: r.balance_date ? (r.balance_cents ?? 0) : null,
  balance_date: r.balance_date ?? "",
  linked: !!r.link,
  closed_on: r.closed_on ?? "",
  excluded: !!r.excluded,
  owned: r.owner === person,
  shared: r.owner !== person,
  shared_with_household: !!r.shared_household,
});

const toTransaction = (r: RecordModel, person: string): Transaction => ({
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

const toImport = (r: RecordModel): Import => ({
  id: r.id,
  account: r.account,
  filename: r.filename ?? "",
  format: r.format,
  added: r.added ?? 0,
  skipped: r.skipped ?? 0,
  first_date: r.first_date ?? "",
  last_date: r.last_date ?? "",
  created: r.created,
});

export async function listAccounts(
  s: Session,
  ownedOnly = false,
): Promise<Account[]> {
  const person = callerId(s);
  return (
    await s.collection("accounts").getFullList({
      sort: "name,created",
      ...(ownedOnly
        ? { filter: s.filter("owner = {:owner}", { owner: person }) }
        : {}),
    })
  ).map((r) => toAccount(r, person));
}

/**
 * What every page counts leaves out the accounts the person excluded: this
 * filter, on a transaction query, and `counted()` on a list of accounts.
 * Closed accounts still count, for the time they were open (asHeld()).
 */
const COUNTED = "account.excluded = false";
/**
 * And the transactions the person left out one by one: they're listed, but
 * no total counts them.
 */
const TX_COUNTED = "excluded = false";
const counted = async (s: Session) =>
  (await listAccounts(s)).filter((a) => !a.excluded);

/** One of the caller's accounts; a 404 from the store for anyone else's. */
export async function getAccount(s: Session, id: string): Promise<Account> {
  return toAccount(await s.collection("accounts").getOne(id), callerId(s));
}

export async function createAccount(
  s: Session,
  a: NewAccount,
): Promise<Account> {
  return toAccount(
    await s.collection("accounts").create({
      ...a,
      owner: callerId(s),
      currency: "USD",
      source: "manual",
    }),
    callerId(s),
  );
}

/**
 * Sets the balance of an account no bank link keeps up to date, as of `date`
 * (today for one entered by hand, a statement's closing day for one read from
 * it); pb_hooks/balances.pb.js adds it to the account's history.
 */
export async function setBalance(
  s: Session,
  id: string,
  cents: number,
  date: string,
): Promise<Account> {
  return toAccount(
    await s
      .collection("accounts")
      .update(id, { balance_cents: cents, balance_date: date }),
    callerId(s),
  );
}

/**
 * Changes what the person may change about an account (checkAccountChange()),
 * and with `balance_cents` its balance too, as setBalance() does.
 */
export async function updateAccount(
  s: Session,
  id: string,
  change: AccountChange & { balance_cents?: number; balance_date?: string },
): Promise<Account> {
  return toAccount(
    await s.collection("accounts").update(id, change),
    callerId(s),
  );
}

/** Deletes the account with every transaction and import in it. */
export async function deleteAccount(s: Session, id: string): Promise<void> {
  await s.collection("accounts").delete(id);
}

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

type CountedRow = {
  account: string;
  posted: string;
  amount_cents: number;
  category: string;
  excluded: boolean;
  splits: unknown;
};

function transactionFilter(s: Session, q: TransactionQuery): string {
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

/** What each category came to between two dates, and the spending of the same span before. */
export async function spendingSummary(
  s: Session,
  q: {
    account?: string;
    from: string;
    to: string;
    previous: { from: string; to: string };
  },
): Promise<SpendingSummary> {
  const rows = async (range: { from: string; to: string }) =>
    expandSplits(
      (await s.collection("transactions").getFullList({
        fields: "amount_cents,category,splits",
        filter: transactionFilter(s, {
          account: q.account,
          ...range,
          counted: true,
        }),
      })) as unknown as {
        amount_cents: number;
        category: string;
        splits: unknown;
      }[],
    );
  const [now, before, list] = await Promise.all([
    rows(q),
    rows(q.previous),
    listCategories(s),
  ]);
  return {
    from: q.from,
    to: q.to,
    ...summarize(now, list),
    previous_spent_cents: summarize(before, list).spent_cents,
  };
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

export async function listImports(
  s: Session,
  account?: string,
  ownedOnly = false,
): Promise<Import[]> {
  const parts: string[] = [];
  const params: Record<string, string> = {};
  if (account) {
    parts.push("account = {:account}");
    params.account = account;
  }
  if (ownedOnly) {
    parts.push("owner = {:owner}");
    params.owner = callerId(s);
  }
  return (
    await s.collection("imports").getFullList({
      sort: "-created",
      ...(parts.length ? { filter: s.filter(parts.join(" && "), params) } : {}),
    })
  ).map(toImport);
}

/** Undoes an import: its transactions go with it. */
export async function deleteImport(s: Session, id: string): Promise<void> {
  await s.collection("imports").delete(id);
}

/**
 * What identifies a file's row next time: the bank's own id when the file
 * has one, else a hash of what the row says. Two rows that say the same
 * thing on the same day (two coffees) are told apart by their order in the
 * file, so importing the same file, or one whose dates overlap it, adds
 * each of them once.
 */
export function externalIds(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.fitid) return `fitid:${r.fitid}`;
    const key = `${r.posted}|${r.amount_cents}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `csv:${createHash("sha256").update(`${key}|${n}`).digest("hex").slice(0, 40)}`;
  });
}

const BATCH = 200; // migrations/0003: the batch API's maxRequests

/**
 * Adds a statement's rows to an account, skipping each one it already has:
 * the same file row from an earlier import, or the same transaction from the
 * account's bank link (shared/overlap.ts). Records the import. All or
 * nothing: if any write fails, the import is deleted, which takes whatever it
 * had added with it.
 */
export async function importRows(
  s: Session,
  account: string,
  file: { filename: string; format: StatementFormat; rows: StatementRow[] },
) {
  const owner = callerId(s);
  const ids = externalIds(file.rows);
  const range = dateRange(file.rows);
  const have = new Set<string>();
  let synced: Dated[] = [];
  if (range) {
    const span = around(range.first, range.last);
    const existing = await s.collection("transactions").getFullList({
      fields: "external_id,source,posted,amount_cents",
      filter: s.filter(
        "account = {:account} && posted >= {:from} && posted <= {:to}",
        { account, ...span },
      ),
    });
    for (const r of existing) have.add(r.external_id);
    synced = existing
      .filter((r) => r.source === "sync")
      .map((r) => ({ posted: r.posted, amount_cents: r.amount_cents }));
  }
  const candidates: { row: StatementRow; id: string }[] = [];
  file.rows.forEach((row, i) => {
    const id = ids[i]!;
    if (have.has(id)) return;
    have.add(id); // an OFX file that repeats an id
    candidates.push({ row, id });
  });
  const fromLink = alreadySynced(
    candidates.map((c) => c.row),
    synced,
  );
  const fresh = candidates.filter((_, i) => !fromLink[i]);

  const record = await s.collection("imports").create({
    owner,
    account,
    filename: file.filename.slice(0, 200),
    format: file.format,
    added: fresh.length,
    skipped: file.rows.length - fresh.length,
    first_date: range?.first ?? "",
    last_date: range?.last ?? "",
  });
  try {
    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = s.createBatch();
      for (const { row, id } of fresh.slice(i, i + BATCH)) {
        batch.collection("transactions").create({
          owner,
          account,
          import: record.id,
          source: "import",
          external_id: id,
          posted: row.posted,
          amount_cents: row.amount_cents,
          description: row.description,
        });
      }
      await batch.send();
    }
  } catch (error) {
    await s
      .collection("imports")
      .delete(record.id)
      .catch(() => {});
    throw error;
  }
  return toImport(record);
}

/**
 * The person's categories, built in and their own: the routes in
 * pb_hooks/categories.pb.js, which alone read and write their own ones.
 */
export async function listCategories(s: Session): Promise<Category[]> {
  return (await s.send("/api/categories", { method: "GET" })).categories;
}

export async function createCategory(
  s: Session,
  name: string,
): Promise<Category> {
  return (await s.send("/api/categories", { method: "POST", body: { name } }))
    .category;
}

export async function renameCategory(
  s: Session,
  id: string,
  name: string,
): Promise<Category> {
  return (
    await s.send(`/api/categories/${encodeURIComponent(id)}/rename`, {
      method: "POST",
      body: { name },
    })
  ).category;
}

/** Deletes one of the person's own categories; its transactions are sorted again on their own. */
export async function removeCategory(
  s: Session,
  id: string,
): Promise<{ resorted: number }> {
  return await s.send(`/api/categories/${encodeURIComponent(id)}/remove`, {
    method: "POST",
  });
}

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
  const [all, fetched, kept, list] = await Promise.all([
    counted(s),
    s.collection("transactions").getFullList({
      fields: "account,posted,amount_cents,category,excluded,splits",
      filter: s.filter(`posted >= {:from} && posted <= {:to} && ${COUNTED}`, {
        from: `${months[0]}-01`,
        to: `${months.at(-1)}-31`,
      }),
    }) as Promise<unknown> as Promise<CountedRow[]>,
    s.collection("balance_history").getFullList({
      fields: "account,date,balance_cents",
      sort: "date",
    }) as Promise<unknown> as Promise<BalancePoint[]>,
    listCategories(s),
  ]);
  // Totals count a split one as its parts (shared/splits.ts).
  const rows = expandSplits(fetched);
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
      ? ((await s.collection("transactions").getFullList({
          fields: "account,posted,amount_cents,category",
          filter: s.filter(
            `posted >= {:from} && posted < {:to} && category = 'transfer' && ${COUNTED}`,
            { from: oldest, to: `${months[0]}-01` },
          ),
        })) as unknown as typeof rows)
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
  };
}

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
  const owner = callerId(s);
  const [all, fetched, kept, list] = await Promise.all([
    listAccounts(s, true),
    s.collection("transactions").getFullList({
      fields: "account,posted,amount_cents,category,excluded,splits",
      filter: s.filter(
        `owner = {:owner} && posted >= {:from} && posted <= {:to} && ${COUNTED}`,
        {
          owner,
          from: `${months[0]}-01`,
          to: `${months.at(-1)}-31`,
        },
      ),
    }) as Promise<unknown> as Promise<CountedRow[]>,
    s.collection("balance_history").getFullList({
      fields: "account,date,balance_cents",
      sort: "date",
      filter: s.filter("owner = {:owner}", { owner }),
    }) as Promise<unknown> as Promise<BalancePoint[]>,
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

/**
 * The tax year so far, from this year's transactions (shared/taxes.ts): the
 * earliest transaction the person has at all says where their data starts.
 */
export async function taxes(
  s: Session,
  today = localToday(),
): Promise<TaxYear> {
  const jan1 = `${today.slice(0, 4)}-01-01`;
  const owner = callerId(s);
  const [accounts, fetched, first] = await Promise.all([
    listAccounts(s, true),
    s.collection("transactions").getFullList({
      fields: "account,posted,amount_cents,category,splits",
      filter: s.filter(
        `owner = {:owner} && posted >= {:from} && posted <= {:to} && ${COUNTED} && ${TX_COUNTED}`,
        { owner, from: jan1, to: today },
      ),
    }) as Promise<unknown> as Promise<
      {
        account: string;
        posted: string;
        amount_cents: number;
        category: string;
        splits: unknown;
      }[]
    >,
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
  );
}
