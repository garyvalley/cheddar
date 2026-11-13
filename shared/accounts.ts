/** Accounts and transactions as the browser sees them, and the rules for a new account. */

import type { SplitPart } from "./splits.ts";

export const ACCOUNT_KINDS = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "brokerage", label: "Brokerage" },
  { value: "retirement", label: "Retirement" },
  { value: "loan", label: "Loan" },
  { value: "property", label: "Property" },
  { value: "other", label: "Other" },
] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number]["value"];

export const kindLabel = (kind: string) =>
  ACCOUNT_KINDS.find((k) => k.value === kind)?.label ?? "Other";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string;
  last4: string;
  currency: string;
  source: "manual" | "import" | "sync" | "";
  /** Signed: what a card or loan owes is negative. Null until it has a balance. */
  balance_cents: number | null;
  /** The day the balance is from. */
  balance_date: string;
  /** A bank link keeps it up to date, balance and all. */
  linked: boolean;
  /** The day it was closed (YYYY-MM-DD), or '' while it's open. */
  closed_on: string;
  /** Left out of every page's numbers; it's kept, and a link keeps syncing it. */
  excluded: boolean;
  /** The signed-in person owns this account. */
  owned?: boolean;
  /** The owner shared this account with the signed-in person's household. */
  shared?: boolean;
  /** This owner has selected the account for household sharing. */
  shared_with_household?: boolean;
}

export interface NewAccount {
  name: string;
  kind: AccountKind;
  institution: string;
  last4: string;
}

export interface Transaction {
  id: string;
  account: string;
  posted: string;
  amount_cents: number;
  description: string;
  payee: string;
  /** A category id (shared/categories.ts); empty until the store has sorted it. */
  category: string;
  /** How the category was chosen: by hand ("person"), by the person's rule, or automatically. */
  category_by: "bank" | "match" | "default" | "rule" | "person" | "";
  pending: boolean;
  source: "manual" | "import" | "sync";
  /** The person's own words about it. */
  note: string;
  /** Left out of spending, Overview, Projections and Taxes, though it stays listed. */
  excluded: boolean;
  /** Whether the person has reviewed this transaction. */
  reviewed: boolean;
  /** The transaction belongs to an account shared by another household member. */
  shared?: boolean;
  /** Its parts when it's split across categories (shared/splits.ts), else none. */
  splits: SplitPart[];
}

export interface Import {
  id: string;
  account: string;
  filename: string;
  format: "csv" | "ofx";
  added: number;
  skipped: number;
  first_date: string;
  last_date: string;
  created: string;
}

/** A new account's fields, trimmed, or the first problem as a message. */
export function checkAccount(
  input: Record<string, unknown>,
): { ok: NewAccount } | { problem: string } {
  const text = (v: unknown) =>
    typeof v === "string" ? v.trim() : v === undefined ? "" : null;
  const name = text(input.name);
  const institution = text(input.institution);
  const last4 = text(input.last4);
  if (!name) return { problem: "Give the account a name." };
  if (name.length > 100)
    return { problem: "The name must be at most 100 characters." };
  if (!ACCOUNT_KINDS.some((k) => k.value === input.kind))
    return { problem: "Choose what kind of account it is." };
  if (institution === null || institution.length > 100)
    return { problem: "The bank's name must be at most 100 characters." };
  if (last4 === null || (last4 && !/^\d{4}$/.test(last4)))
    return { problem: "The last four digits must be four digits." };
  return { ok: { name, kind: input.kind as AccountKind, institution, last4 } };
}

/** What a person may change about an account: any of these. */
export interface AccountChange extends Partial<NewAccount> {
  closed_on?: string;
  excluded?: boolean;
}

const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/**
 * The fields of a change to `current`, checked as a new account's are, or
 * the first problem. A closing day is a real one, no later than `today`;
 * '' opens the account again.
 */
export function checkAccountChange(
  input: Record<string, unknown>,
  current: NewAccount,
  today: string,
): { ok: AccountChange } | { problem: string } {
  const out: AccountChange = {};
  const keys = (["name", "kind", "institution", "last4"] as const).filter(
    (k) => input[k] !== undefined,
  );
  if (keys.length) {
    const checked = checkAccount({
      ...current,
      ...Object.fromEntries(keys.map((k) => [k, input[k]])),
    });
    if ("problem" in checked) return checked;
    for (const k of keys) Object.assign(out, { [k]: checked.ok[k] });
  }
  if (input.excluded !== undefined) {
    if (typeof input.excluded !== "boolean")
      return { problem: "Say whether to count the account." };
    out.excluded = input.excluded;
  }
  if (input.closed_on !== undefined) {
    const day =
      typeof input.closed_on === "string" ? input.closed_on.trim() : null;
    if (day === null || (day && !isDay(day)))
      return { problem: "Give the day it closed as a date." };
    if (day > today)
      return { problem: "The day it closed can't be in the future." };
    out.closed_on = day;
  }
  return { ok: out };
}

/** Liabilities: what they hold is owed, and a charge to them is money out. */
export const isLiability = (kind: string) =>
  kind === "credit_card" || kind === "loan";

/** How many days a typed-in balance stays current: a home's value moves slowly, anything else monthly. */
export const staleAfterDays = (kind: string) => (kind === "property" ? 180 : 30);

/**
 * A balance the person typed in (or imported) that's older than its kind
 * allows, on an open, counted account of theirs that no bank link keeps up
 * to date: it's in net worth, so it's worth a reminder.
 */
export function isStale(
  a: Pick<Account, "kind" | "linked" | "closed_on" | "excluded" | "balance_cents" | "balance_date" | "owned">,
  today: string,
): boolean {
  if (a.linked || a.closed_on || a.excluded || a.owned === false) return false;
  if (a.balance_cents === null || !a.balance_date) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${a.balance_date}T00:00:00Z`)) / 86_400_000;
  return days > staleAfterDays(a.kind);
}

/** "$1,234.56" or "\u2212$1,234.56" from signed cents. */
export function formatCents(cents: number, currency = "USD"): string {
  const text = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Math.abs(cents) / 100);
  return cents < 0 ? `\u2212${text}` : text;
}

/**
 * A balance a person types ("1,234.56", "-$80", "$12"), as signed cents. For
 * a card or a loan, what's owed is stored negative whichever way it's typed.
 */
export function parseBalance(
  input: unknown,
  kind: string,
): { ok: number } | { problem: string } {
  const text =
    typeof input === "number"
      ? String(input)
      : typeof input === "string"
        ? input.trim()
        : "";
  const m =
    /^([-\u2212]?)\s*\$?\s*([-\u2212]?)(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(
      text,
    );
  if (
    !text ||
    !m ||
    (m[3] === undefined && m[4] === undefined) ||
    (m[1] && m[2])
  )
    return { problem: "Enter the balance as an amount, like 1,234.56." };
  const cents =
    Number((m[3] ?? "0").replace(/,/g, "")) * 100 +
    Number((m[4] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000_00)
    return { problem: "That balance is larger than Cheddar can hold." };
  const negative = !!(m[1] || m[2]);
  if (isLiability(kind)) return { ok: cents === 0 ? 0 : -cents };
  return { ok: negative && cents ? -cents : cents };
}
