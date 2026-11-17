import {
  EXPORT_VERSION,
  exportFiles,
  type BalancePoint,
  type CategoryRule,
  type ExportData,
} from "~~/shared/export";
import { listLinks } from "./bank-links";
import { listGoals } from "./goals";
import { listBudgets } from "./budgets";
import { getAlertSettings } from "./alerts";
import { listActivity } from "./activity";
import { listCashflowItems } from "./cashflow";
import { allTransactions } from "./transactions";
import { listAccounts } from "./accounts";
import { listCategories } from "./categories";
import { listImports } from "./imports";
import { toMe } from "./profile";
import { todayIn } from "~~/shared/time-zone";
import { zip } from "./zip";
import { callerId, type Session } from "./session";
import type { RuleFields } from "~~/shared/rules";

/**
 * Everything the person has, read as them: PocketBase's rules let each read
 * only their own. The password goes first, to pb_hooks/export.pb.js, which
 * answers with the merchant rules only the hooks can read; nothing else is
 * read until it has said yes.
 */
export async function exportData(
  s: Session,
  password: string,
  now = new Date(),
): Promise<ExportData> {
  const { category_rules, rules } = await s.send<{ category_rules: CategoryRule[]; rules: RuleFields[] }>(
    "/api/export",
    { method: "POST", body: { password } },
  );
  const [
    user,
    accounts,
    transactions,
    imports,
    history,
    categories,
    links,
    goals,
    budgets,
    cashflowItems,
    activity,
    holdings,
    alerts,
  ] = await Promise.all([
    s.collection("users").getOne(callerId(s)),
    listAccounts(s, true),
    allTransactions(s, { uncounted: true, ownedOnly: true }),
    listImports(s, undefined, true),
    s.collection("balance_history").getFullList({
      fields: "account,date,balance_cents",
      sort: "date",
      filter: s.filter("owner = {:owner}", { owner: callerId(s) }),
    }) as Promise<unknown> as Promise<BalancePoint[]>,
    listCategories(s),
    listLinks(s),
    listGoals(s),
    listBudgets(s),
    listCashflowItems(s),
    listActivity(s),
    s.collection("holdings").getFullList({
      sort: "account,-value_cents",
      filter: s.filter("owner = {:owner}", { owner: callerId(s) }),
    }),
    getAlertSettings(s),
  ]);
  const me = toMe(user);
  return {
    cheddar_export: EXPORT_VERSION,
    exported: now.toISOString(),
    profile: {
      name: me.name,
      email: me.email,
      state: me.state,
      filing_status: me.filing_status,
      theme: me.theme,
      appearance: me.appearance,
      time_zone: me.time_zone,
    },
    accounts,
    transactions,
    imports,
    balance_history: history.map((p) => ({
      account: p.account,
      date: p.date,
      balance_cents: p.balance_cents,
    })),
    goals,
    budgets,
    alerts,
    holdings: holdings.map((h) => ({
      account: h.account,
      name: h.name ?? "",
      ticker: h.ticker ?? "",
      type: h.type ?? "",
      quantity: h.quantity ?? 0,
      price_cents: h.price_cents || null,
      value_cents: h.value_cents ?? 0,
      cost_basis_cents: h.cost_basis_cents || null,
      price_as_of: h.price_as_of ?? "",
      as_of: h.as_of ?? "",
    })),
    cashflow_items: cashflowItems,
    categories,
    category_rules,
    rules,
    bank_links: links.links.map((l) => ({
      institutions: l.institutions,
      status: l.status,
      last_synced: l.last_synced,
      accounts: l.accounts.map((a) => a.id),
    })),
    activity,
  };
}

/**
 * The export as a zip (accounts.csv, transactions.csv, balance_history.csv
 * and cheddar.json), and the person's own today, to name it by.
 */
export async function exportZip(
  s: Session,
  password: string,
  now = new Date(),
): Promise<{ file: Buffer; day: string }> {
  const data = await exportData(s, password, now);
  return {
    file: zip(exportFiles(data), now),
    day: todayIn(data.profile.time_zone, now),
  };
}
