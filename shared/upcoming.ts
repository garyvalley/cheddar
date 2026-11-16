/**
 * Overview's "Coming up" card (issue #109): the next few days of bills and
 * planned money from the cash-flow forecast (shared/cashflow.ts: the
 * person's planned items and the recurring charges Cheddar found), and the
 * subscriptions whose price just went up (shared/recurring.ts's `change`).
 * Pure: GET /api/upcoming answers with upcoming().
 */
import type { CashflowEvent } from "./cashflow.ts";
import type { Recurring } from "./recurring.ts";

/** How many days ahead the card looks. */
export const UPCOMING_DAYS = 7;
/** How long after a price rise the card still mentions it. */
export const RISE_DAYS = 45;

export interface PriceRise {
  key: string;
  name: string;
  category: string;
  from_cents: number;
  to_cents: number;
  /** The first charge at the new price. */
  on: string;
  /** What the rise adds over a year. */
  yearly_cents: number;
}

export interface Upcoming {
  days: number;
  /** Due from today through `days` days on, soonest first. */
  events: Pick<CashflowEvent, "id" | "date" | "name" | "amount_cents" | "source" | "account">[];
  /** What's due out over those days (positive). */
  due_cents: number;
  /** Price rises in the last RISE_DAYS, newest first. */
  rises: PriceRise[];
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const PER_YEAR: Record<string, number> = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };

export function upcoming(
  events: CashflowEvent[],
  recurring: Recurring[],
  today: string,
  days = UPCOMING_DAYS,
): Upcoming {
  const soon = events
    .filter((e) => e.date >= today && daysBetween(today, e.date) < days)
    .map(({ id, date, name, amount_cents, source, account }) => ({ id, date, name, amount_cents, source, account }));
  const rises = recurring
    .filter((r) => !r.stopped && r.change && r.change.to_cents > r.change.from_cents)
    .filter((r) => daysBetween(r.change!.on, today) <= RISE_DAYS)
    .map((r) => ({
      key: r.key,
      name: r.name,
      category: r.category,
      from_cents: r.change!.from_cents,
      to_cents: r.change!.to_cents,
      on: r.change!.on,
      yearly_cents: (r.change!.to_cents - r.change!.from_cents) * (PER_YEAR[r.cadence] ?? 12),
    }))
    .sort((a, b) => b.on.localeCompare(a.on) || a.name.localeCompare(b.name));
  return {
    days,
    events: soon,
    due_cents: soon.reduce((n, e) => n + (e.amount_cents < 0 ? -e.amount_cents : 0), 0),
    rises,
  };
}
