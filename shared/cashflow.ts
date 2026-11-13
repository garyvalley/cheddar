import type { Account } from "./accounts.ts";
import { addMonths, type Recurring } from "./recurring.ts";
import { isDay, parseAmount } from "./transactions.ts";

export const CASHFLOW_CADENCES = [
  { id: "once", label: "Once" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every two weeks" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Every three months" },
  { id: "yearly", label: "Yearly" },
] as const;

export type CashflowCadence = (typeof CASHFLOW_CADENCES)[number]["id"];
export type CashflowDirection = "income" | "expense";

export interface CashflowItem {
  id: string;
  name: string;
  account: string;
  direction: CashflowDirection;
  amount_cents: number;
  cadence: CashflowCadence;
  next_date: string;
  source_key: string;
}

export type CashflowFields = Omit<CashflowItem, "id">;

export interface CashflowEvent {
  id: string;
  account: string;
  date: string;
  name: string;
  amount_cents: number;
  source: "scheduled" | "recurring";
  running_cents: number | null;
}

export function checkCashflowItem(
  input: Record<string, unknown>,
  accounts: Account[],
  today: string,
): { ok: CashflowFields } | { problem: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100)
    return { problem: "Give it a name of up to 100 characters." };
  const account = typeof input.account === "string" ? input.account : "";
  if (
    !accounts.some(
      (a) =>
        a.id === account &&
        !a.excluded &&
        (!a.closed_on || a.closed_on > today),
    )
  )
    return {
      problem: "Choose an open account that is counted in your finances.",
    };
  if (input.direction !== "income" && input.direction !== "expense")
    return { problem: "Choose money in or money out." };
  const amount = parseAmount(input.amount);
  if (!amount || amount.negative || amount.cents < 1)
    return { problem: "Enter an amount greater than zero." };
  if (!CASHFLOW_CADENCES.some((c) => c.id === input.cadence))
    return { problem: "Choose how often it happens." };
  if (!isDay(input.next_date))
    return { problem: "Choose a real date for the next payment." };
  const sourceKey =
    typeof input.source_key === "string" ? input.source_key : "";
  if (sourceKey.length > 100)
    return { problem: "That recurring charge can’t be planned." };
  return {
    ok: {
      name,
      account,
      direction: input.direction,
      amount_cents: amount.cents,
      cadence: input.cadence as CashflowCadence,
      next_date: input.next_date,
      source_key: sourceKey,
    },
  };
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const nextDate = (date: string, cadence: CashflowCadence) => {
  if (cadence === "weekly") return addDays(date, 7);
  if (cadence === "biweekly") return addDays(date, 14);
  if (cadence === "monthly") return addMonths(date, 1);
  if (cadence === "quarterly") return addMonths(date, 3);
  if (cadence === "yearly") return addMonths(date, 12);
  return date;
};

function dates(
  item: Pick<CashflowItem, "next_date" | "cadence">,
  from: string,
  to: string,
): string[] {
  const result: string[] = [];
  let date = item.next_date;
  if (item.cadence === "once") return date >= from && date <= to ? [date] : [];
  while (date < from) date = nextDate(date, item.cadence);
  for (let count = 0; date <= to && count < 100; count++) {
    result.push(date);
    date = nextDate(date, item.cadence);
  }
  return result;
}

export function cashflowForecast(
  accounts: Account[],
  items: CashflowItem[],
  recurring: Recurring[],
  today: string,
  days: number,
) {
  const to = addDays(today, days);
  const open = accounts.filter(
    (a) => !a.excluded && (!a.closed_on || a.closed_on > today),
  );
  const accountIds = new Set(open.map((a) => a.id));
  const ownedRecurring = new Set(
    items.map((item) => item.source_key).filter(Boolean),
  );
  const events: CashflowEvent[] = [];
  for (const item of items) {
    if (!accountIds.has(item.account)) continue;
    for (const date of dates(item, today, to)) {
      events.push({
        id: `${item.id}:${date}`,
        account: item.account,
        date,
        name: item.name,
        amount_cents:
          item.direction === "income" ? item.amount_cents : -item.amount_cents,
        source: "scheduled",
        running_cents: null,
      });
    }
  }
  for (const charge of recurring) {
    if (
      charge.stopped ||
      ownedRecurring.has(charge.key) ||
      !accountIds.has(charge.account)
    )
      continue;
    for (const date of dates(
      { next_date: charge.next, cadence: charge.cadence },
      today,
      to,
    )) {
      events.push({
        id: `recurring:${charge.key}:${date}`,
        account: charge.account,
        date,
        name: charge.name,
        amount_cents: -charge.amount_cents,
        source: "recurring",
        running_cents: null,
      });
    }
  }
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
  const running = new Map(open.map((a) => [a.id, a.balance_cents]));
  for (const event of events) {
    const balance = running.get(event.account) ?? null;
    event.running_cents =
      balance === null ? null : balance + event.amount_cents;
    if (event.running_cents !== null)
      running.set(event.account, event.running_cents);
  }
  const summaries = open.map((account) => ({
    id: account.id,
    name: account.name,
    balance_cents: account.balance_cents,
    balance_date: account.balance_date,
    projected_cents:
      account.balance_cents === null
        ? null
        : (running.get(account.id) ?? account.balance_cents),
  }));
  return { from: today, to, days, accounts: summaries, events };
}
