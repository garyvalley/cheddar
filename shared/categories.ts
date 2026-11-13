/**
 * Spending categories as the browser shows them. The list is
 * pb_hooks/lib/categories.js's, which sorts each transaction into one;
 * tests/categories.test.mjs keeps the two the same. A person can add
 * categories of their own (GET /api/categories lists both), which count as
 * spending.
 */

export const CATEGORIES = [
  { id: "housing", label: "Housing", spending: true },
  { id: "utilities", label: "Utilities", spending: true },
  { id: "groceries", label: "Groceries", spending: true },
  { id: "dining", label: "Dining and drinks", spending: true },
  { id: "transport", label: "Transportation", spending: true },
  { id: "travel", label: "Travel", spending: true },
  { id: "shopping", label: "Shopping", spending: true },
  { id: "entertainment", label: "Entertainment", spending: true },
  { id: "health", label: "Health", spending: true },
  { id: "personal", label: "Personal care", spending: true },
  { id: "insurance", label: "Insurance", spending: true },
  { id: "education", label: "Education", spending: true },
  { id: "gifts", label: "Gifts and donations", spending: true },
  { id: "fees", label: "Fees and interest", spending: true },
  { id: "taxes", label: "Taxes", spending: true },
  { id: "loans", label: "Loan payments", spending: true },
  { id: "other", label: "Other", spending: true },
  { id: "income", label: "Income", spending: false },
  { id: "transfer", label: "Transfers", spending: false },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** A category as the page lists it: built in, or one the person made ("c-" and its id). */
export interface Category {
  id: string;
  label: string;
  spending: boolean;
  custom: boolean;
  /** A custom category belonging to another household member. */
  shared?: boolean;
}

export const BUILT_IN: Category[] = CATEGORIES.map((c) => ({
  ...c,
  custom: false,
}));

export const isCategory = (id: unknown): id is CategoryId =>
  CATEGORIES.some((c) => c.id === id);

/** A custom category's id: "c-" and a PocketBase record id. */
export const isCustomId = (id: unknown): id is string =>
  typeof id === "string" && /^c-[a-z0-9]{15}$/.test(id);

/** Built in, or shaped like one of the person's own (the store checks it's theirs). */
export const isCategoryRef = (id: unknown): id is string =>
  isCategory(id) || isCustomId(id);

/** The category a transaction counts in: one saved before it was sorted, or in a category since deleted, counts as Other. */
export const categoryOf = (id: string, list: Category[] = BUILT_IN): Category =>
  list.find((c) => c.id === id) ?? list.find((c) => c.id === "other")!;

export const categoryLabel = (id: string, list: Category[] = BUILT_IN) =>
  categoryOf(id, list).label;

export interface CategoryTotal {
  id: string;
  label: string;
  spending: boolean;
  custom: boolean;
  shared?: boolean;
  /** Spending: what went out, less refunds (positive is spent). Income and transfers: the net in. */
  total_cents: number;
  count: number;
  /** The person's budget for this category, scaled to the span shown (shared/budgets.ts). */
  budget_cents?: number;
}

export interface SpendingSummary {
  from: string;
  to: string;
  /** What every spending category added up to. */
  spent_cents: number;
  income_cents: number;
  /** The period before, for comparison. */
  previous_spent_cents: number;
  /** Spending categories with anything in them, most spent first; then income and transfers. */
  categories: CategoryTotal[];
}

/** Adds up transactions by category, in the person's list of categories. */
export function summarize(
  rows: { amount_cents: number; category: string }[],
  list: Category[] = BUILT_IN,
) {
  const by = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const id = categoryOf(r.category, list).id;
    const t = by.get(id) ?? { total: 0, count: 0 };
    t.total += r.amount_cents;
    t.count++;
    by.set(id, t);
  }
  const categories: CategoryTotal[] = [];
  for (const c of list) {
    const t = by.get(c.id);
    if (!t) continue;
    categories.push({
      id: c.id,
      label: c.label,
      spending: c.spending,
      custom: c.custom,
      shared: c.shared,
      total_cents: c.spending ? -t.total : t.total,
      count: t.count,
    });
  }
  categories.sort(
    (a, b) =>
      Number(b.spending) - Number(a.spending) ||
      (a.spending ? b.total_cents - a.total_cents : 0),
  );
  const spent = categories
    .filter((c) => c.spending)
    .reduce((n, c) => n + c.total_cents, 0);
  const income = by.get("income")?.total ?? 0;
  return { categories, spent_cents: spent, income_cents: income };
}

export type PeriodKind = "week" | "month" | "year" | "custom";

export const isPeriodKind = (v: unknown): v is PeriodKind =>
  v === "week" || v === "month" || v === "year" || v === "custom";

/** The longest custom range Spending reads at once. */
export const MAX_RANGE_DAYS = 366 * 5;

export interface Period {
  kind: PeriodKind;
  /** "2026-11" for a month, "2026" for a year, the Monday for a week, "2026-01-05~2026-02-10" for a range. */
  at: string;
  from: string;
  to: string;
  label: string;
  prev: string;
  next: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const DAY = 86_400_000;
const isDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
/** `d` moved by `n` days. */
export const addDays = (d: string, n: number) => fromTime(toTime(d) + n * DAY);
/** Days from `from` to `to`, counting both. */
export const daysIn = (from: string, to: string) =>
  Math.round((toTime(to) - toTime(from)) / DAY) + 1;

const short = (d: string, year: boolean) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
/** "Nov 9 – 15, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return short(from, true);
  if (from.slice(0, 4) !== to.slice(0, 4))
    return `${short(from, true)} – ${short(to, true)}`;
  if (from.slice(0, 7) === to.slice(0, 7))
    return `${short(from, false)} – ${Number(to.slice(8))}, ${to.slice(0, 4)}`;
  return `${short(from, false)} – ${short(to, true)}`;
}

/** The Monday of the week `d` is in. */
export const weekStart = (d: string) =>
  addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** A custom range as `at` carries it, when it's a real one: `from` on or before `to`, at most MAX_RANGE_DAYS. */
export function parseRange(at: string | undefined): { from: string; to: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(at ?? "");
  if (!m || !isDate(m[1]!) || !isDate(m[2]!) || m[1]! > m[2]!) return null;
  if (daysIn(m[1]!, m[2]!) > MAX_RANGE_DAYS) return null;
  return { from: m[1]!, to: m[2]! };
}

/**
 * The week, month, year or range `at` names, or the one `today`
 * (YYYY-MM-DD) is in when it names none. A week runs Monday to Sunday; a
 * range with nothing usable is the 30 days to today. A range's prev and next
 * are the spans of the same length either side.
 */
export function periodOf(
  kind: PeriodKind,
  at: string | undefined,
  today: string,
): Period {
  if (kind === "week") {
    const from = weekStart(at && isDate(at) ? at : today);
    const to = addDays(from, 6);
    return {
      kind,
      at: from,
      from,
      to,
      label: rangeLabel(from, to),
      prev: addDays(from, -7),
      next: addDays(from, 7),
    };
  }
  if (kind === "custom") {
    const r = parseRange(at) ?? { from: addDays(today, -29), to: today };
    const n = daysIn(r.from, r.to);
    const span = (from: string) => `${from}~${addDays(from, n - 1)}`;
    return {
      kind,
      at: `${r.from}~${r.to}`,
      ...r,
      label: rangeLabel(r.from, r.to),
      prev: span(addDays(r.from, -n)),
      next: span(addDays(r.to, 1)),
    };
  }
  if (kind === "year") {
    const y = /^\d{4}$/.test(at ?? "") ? Number(at) : Number(today.slice(0, 4));
    return {
      kind,
      at: String(y),
      from: `${y}-01-01`,
      to: `${y}-12-31`,
      label: String(y),
      prev: String(y - 1),
      next: String(y + 1),
    };
  }
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(at ?? "");
  const y = m ? Number(m[1]) : Number(today.slice(0, 4));
  const mo = m ? Number(m[2]) : Number(today.slice(5, 7));
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  return {
    kind,
    at: `${y}-${pad(mo)}`,
    from: `${y}-${pad(mo)}-01`,
    to: `${y}-${pad(mo)}-${pad(last)}`,
    label,
    prev,
    next,
  };
}

/** Today as YYYY-MM-DD where this code runs. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
