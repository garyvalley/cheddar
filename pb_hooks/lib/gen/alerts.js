/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/alerts.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/alerts.ts and run `pnpm gen:hooks`.
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// shared/alerts.ts
var alerts_exports = {};
__export(alerts_exports, {
  BILL_DAYS: () => BILL_DAYS,
  CHARGE_DAYS: () => CHARGE_DAYS,
  LASTING: () => LASTING,
  LOOKBACK_YEARS: () => LOOKBACK_YEARS,
  MAX_ALERT_CENTS: () => MAX_ALERT_CENTS,
  NO_ALERTS: () => NO_ALERTS,
  addDays: () => addDays2,
  alertEmail: () => alertEmail,
  anyOn: () => anyOn,
  balanceAlerts: () => balanceAlerts,
  bankAlerts: () => bankAlerts,
  billAlerts: () => billAlerts,
  budgetAlerts: () => budgetAlerts,
  carryFrom: () => carryFrom,
  cashflowForecast: () => cashflowForecast,
  chargeAlerts: () => chargeAlerts,
  checkAlertSettings: () => checkAlertSettings,
  dayWords: () => dayWords,
  due: () => due,
  expandSplits: () => expandSplits,
  linkHealth: () => linkHealth,
  money: () => money,
  overBudget: () => overBudget,
  recurring: () => recurring,
  summarize: () => summarize,
  weeklyAlert: () => weeklyAlert,
  withCarry: () => withCarry
});
module.exports = __toCommonJS(alerts_exports);

// shared/transactions.ts
var LARGEST = 1e13;
function parseAmount(input) {
  var _a, _b;
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  const m = /^([-−+]?)\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/.exec(text);
  if (!text || !m || m[2] === void 0 && m[3] === void 0) return null;
  const cents = Number(((_a = m[2]) != null ? _a : "0").replace(/,/g, "")) * 100 + Number(((_b = m[3]) != null ? _b : "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > LARGEST) return null;
  return { cents, negative: m[1] === "-" || m[1] === "−" };
}

// shared/categories.ts
var CATEGORIES = [
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
  { id: "transfer", label: "Transfers", spending: false }
];
var BUILT_IN = CATEGORIES.map((c) => __spreadProps(__spreadValues({}, c), {
  custom: false
}));
var categoryOf = (id, list = BUILT_IN) => {
  var _a;
  return (_a = list.find((c) => c.id === id)) != null ? _a : list.find((c) => c.id === "other");
};
function summarize(rows, list = BUILT_IN) {
  var _a, _b, _c;
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const id = categoryOf(r.category, list).id;
    const t = (_a = by.get(id)) != null ? _a : { total: 0, count: 0 };
    t.total += r.amount_cents;
    t.count++;
    by.set(id, t);
  }
  const categories = [];
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
      count: t.count
    });
  }
  categories.sort(
    (a, b) => Number(b.spending) - Number(a.spending) || (a.spending ? b.total_cents - a.total_cents : 0)
  );
  const spent = categories.filter((c) => c.spending).reduce((n, c) => n + c.total_cents, 0);
  const income = (_c = (_b = by.get("income")) == null ? void 0 : _b.total) != null ? _c : 0;
  return { categories, spent_cents: spent, income_cents: income };
}
var MAX_RANGE_DAYS = 366 * 5;

// shared/recurring.ts
var CADENCES = [
  // `slack` is how many days early or late a charge can come; `grace`, how
  // long past its date a charge can be missing before it counts as stopped.
  { id: "weekly", label: "Weekly", every: "a week", days: 7, months: 0, slack: 2, grace: 5, per_year: 52 },
  { id: "biweekly", label: "Every two weeks", every: "every two weeks", days: 14, months: 0, slack: 3, grace: 7, per_year: 26 },
  { id: "monthly", label: "Monthly", every: "a month", days: 30.44, months: 1, slack: 5, grace: 12, per_year: 12 },
  { id: "quarterly", label: "Every three months", every: "every three months", days: 91.31, months: 3, slack: 10, grace: 30, per_year: 4 },
  { id: "yearly", label: "Yearly", every: "a year", days: 365.25, months: 12, slack: 20, grace: 45, per_year: 1 }
];
var LOOKBACK_YEARS = 3;
var STOPPED_DAYS = 90;
var VARYING = /* @__PURE__ */ new Set(["utilities", "housing", "insurance", "loans", "fees"]);
var SAME_AMOUNT = 1.35;
var DAY = 864e5;
var toDays = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / DAY;
var fromDays = (d) => new Date(Math.round(d) * DAY).toISOString().slice(0, 10);
function addMonths(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
var after = (ymd, c) => c.months ? addMonths(ymd, c.months) : fromDays(toDays(ymd) + c.days);
var fits = (gap, c) => [1, 2].find((k) => Math.abs(gap - k * c.days) <= c.slack * k);
function run(dates2, c) {
  let len = 1;
  let single = 0;
  for (let i = dates2.length - 1; i > 0; i--) {
    const k = fits(dates2[i] - dates2[i - 1], c);
    if (!k) break;
    len++;
    if (k === 1) single++;
  }
  return len >= 3 && single >= 2 ? len : 0;
}
function byAmount(charges) {
  const sorted = [...charges].sort((a, b) => b.amount_cents - a.amount_cents);
  const groups = [];
  for (const ch of sorted) {
    const g = groups.at(-1);
    if (g && Math.abs(ch.amount_cents) <= Math.abs(g.at(-1).amount_cents) * SAME_AMOUNT) g.push(ch);
    else groups.push([ch]);
  }
  return groups.map((g) => g.sort((a, b) => a.posted.localeCompare(b.posted)));
}
function detect(key, charges, varying, today) {
  var _a, _b;
  const days = [];
  for (const ch of charges) {
    if (((_a = days.at(-1)) == null ? void 0 : _a.posted) === ch.posted) days[days.length - 1] = ch;
    else days.push(ch);
  }
  const dates2 = days.map((ch) => toDays(ch.posted));
  let best = null;
  for (const c2 of CADENCES) {
    const len2 = run(dates2, c2);
    if (len2 > ((_b = best == null ? void 0 : best.len) != null ? _b : 0)) best = { c: c2, len: len2 };
  }
  if (!best) return null;
  const { c, len } = best;
  const kept = days.slice(-len);
  const spent = kept.map((ch) => -ch.amount_cents);
  const latest = kept.at(-1);
  const [a, b, z] = [spent.at(-3), spent.at(-2), spent.at(-1)];
  const near = (x, y) => Math.abs(x - y) <= Math.max(x, y) * 0.02;
  if (!varying && !(near(a, b) || near(b, z) || near(a, z))) return null;
  const change = b === a && z !== b ? { from_cents: b, to_cents: z, on: latest.posted } : null;
  const varies = !change && !(z === b && b === a);
  const amount = varies ? Math.round((a + b + z) / 3) : z;
  const next = after(latest.posted, c);
  return {
    key,
    name: latest.payee || latest.description || key,
    category: latest.category,
    account: latest.account,
    cadence: c.id,
    amount_cents: amount,
    varies,
    yearly_cents: amount * c.per_year,
    count: kept.length,
    first: kept[0].posted,
    last: latest.posted,
    next,
    stopped: toDays(today) > toDays(next) + c.grace,
    change
  };
}
function recurring(rows, list, today) {
  var _a, _b;
  const merchants = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.amount_cents >= 0 || r.pending || !r.merchant_key || r.posted > today) continue;
    if (!categoryOf(r.category, list).spending) continue;
    const g = (_a = merchants.get(r.merchant_key)) != null ? _a : [];
    g.push(r);
    merchants.set(r.merchant_key, g);
  }
  const found = [];
  for (const [merchant, charges] of merchants) {
    if (charges.length < 3) continue;
    const varying = charges.some((ch) => VARYING.has(categoryOf(ch.category, list).id));
    const groups = varying ? [[...charges].sort((a, b) => a.posted.localeCompare(b.posted))] : byAmount(charges);
    for (const g of groups) {
      const r = g.length >= 3 ? detect(merchant, g, varying, today) : null;
      if (r) found.push(r);
    }
  }
  const seen = /* @__PURE__ */ new Map();
  for (const r of found) {
    const n = ((_b = seen.get(r.key)) != null ? _b : 0) + 1;
    seen.set(r.key, n);
    if (n > 1) r.key = `${r.key} ${n}`;
  }
  const cutoff = fromDays(toDays(today) - STOPPED_DAYS);
  const items = found.filter((r) => !r.stopped).sort((x, y) => y.yearly_cents - x.yearly_cents || x.name.localeCompare(y.name));
  const stopped = found.filter((r) => r.stopped && r.next >= cutoff).sort((x, y) => y.last.localeCompare(x.last));
  const yearly = items.reduce((n, r) => n + r.yearly_cents, 0);
  return { items, stopped, yearly_cents: yearly, monthly_cents: Math.round(yearly / 12) };
}

// shared/cashflow.ts
var DAY2 = 864e5;
var addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY2).toISOString().slice(0, 10);
var nextDate = (date, cadence) => {
  if (cadence === "weekly") return addDays(date, 7);
  if (cadence === "biweekly") return addDays(date, 14);
  if (cadence === "monthly") return addMonths(date, 1);
  if (cadence === "quarterly") return addMonths(date, 3);
  if (cadence === "yearly") return addMonths(date, 12);
  return date;
};
function dates(item, from, to) {
  const result = [];
  let date = item.next_date;
  if (item.cadence === "once") return date >= from && date <= to ? [date] : [];
  while (date < from) date = nextDate(date, item.cadence);
  for (let count = 0; date <= to && count < 100; count++) {
    result.push(date);
    date = nextDate(date, item.cadence);
  }
  return result;
}
function cashflowForecast(accounts, items, recurring2, today, days) {
  var _a;
  const to = addDays(today, days);
  const open = accounts.filter(
    (a) => !a.excluded && (!a.closed_on || a.closed_on > today)
  );
  const accountIds = new Set(open.map((a) => a.id));
  const ownedRecurring = new Set(
    items.map((item) => item.source_key).filter(Boolean)
  );
  const events = [];
  for (const item of items) {
    if (!accountIds.has(item.account)) continue;
    for (const date of dates(item, today, to)) {
      events.push({
        id: `${item.id}:${date}`,
        account: item.account,
        date,
        name: item.name,
        amount_cents: item.direction === "income" ? item.amount_cents : -item.amount_cents,
        source: "scheduled",
        running_cents: null
      });
    }
  }
  for (const charge of recurring2) {
    if (charge.stopped || ownedRecurring.has(charge.key) || !accountIds.has(charge.account))
      continue;
    for (const date of dates(
      { next_date: charge.next, cadence: charge.cadence },
      today,
      to
    )) {
      events.push({
        id: `recurring:${charge.key}:${date}`,
        account: charge.account,
        date,
        name: charge.name,
        amount_cents: -charge.amount_cents,
        source: "recurring",
        running_cents: null
      });
    }
  }
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
  );
  const running = new Map(open.map((a) => [a.id, a.balance_cents]));
  for (const event of events) {
    const balance = (_a = running.get(event.account)) != null ? _a : null;
    event.running_cents = balance === null ? null : balance + event.amount_cents;
    if (event.running_cents !== null)
      running.set(event.account, event.running_cents);
  }
  const summaries = open.map((account) => {
    var _a2;
    return {
      id: account.id,
      name: account.name,
      balance_cents: account.balance_cents,
      balance_date: account.balance_date,
      projected_cents: account.balance_cents === null ? null : (_a2 = running.get(account.id)) != null ? _a2 : account.balance_cents
    };
  });
  return { from: today, to, days, accounts: summaries, events };
}

// shared/link-health.ts
var SYNC_STALE_HOURS = 36;
var BALANCE_STALE_DAYS = 3;
var DAY_MS = 864e5;
var dayMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
function linkHealth(links, now, today) {
  return links.map((l) => {
    const accounts = l.accounts.filter((a) => !a.excluded && !(a.closed_on && a.closed_on <= today)).map((a) => ({
      id: a.id,
      name: a.name,
      last4: a.last4,
      balance_date: a.balance_date,
      stale: !a.balance_date || (dayMs(today) - dayMs(a.balance_date)) / DAY_MS > BALANCE_STALE_DAYS
    }));
    const synced = l.last_synced ? Date.parse(l.last_synced.replace(" ", "T")) : Number.NaN;
    const old = Number.isNaN(synced) || now - synced > SYNC_STALE_HOURS * 36e5;
    const state = l.status === "reconnect" ? "reconnect" : l.status === "error" ? "error" : old || accounts.some((a) => a.stale) ? "stale" : "ok";
    return { id: l.id, name: l.institutions.length ? l.institutions.join(", ") : "Linked bank", state, message: l.message, last_synced: l.last_synced, accounts };
  });
}

// shared/splits.ts
var MIN_PARTS = 2;
var MAX_PARTS = 10;
var isCents = (v) => typeof v === "number" && Number.isSafeInteger(v) && v !== 0;
function partsOf(splits) {
  if (!Array.isArray(splits) || splits.length < MIN_PARTS || splits.length > MAX_PARTS) return [];
  const parts = [];
  for (const p of splits) {
    if (!p || typeof p !== "object") return [];
    const { category, amount_cents } = p;
    if (typeof category !== "string" || !category || category.length > 20 || !isCents(amount_cents)) return [];
    parts.push({ category, amount_cents });
  }
  return parts;
}
function leftOver(t) {
  const parts = partsOf(t.splits);
  return parts.length ? t.amount_cents - parts.reduce((n, p) => n + p.amount_cents, 0) : 0;
}
function expandSplits(rows) {
  const out = [];
  for (const r of rows) {
    const parts = partsOf(r.splits);
    if (!parts.length) {
      out.push(r);
      continue;
    }
    for (const p of parts) out.push(__spreadProps(__spreadValues({}, r), { category: p.category, amount_cents: p.amount_cents }));
    const rest = leftOver(r);
    if (rest) out.push(__spreadProps(__spreadValues({}, r), { amount_cents: rest }));
  }
  return out;
}

// shared/budgets.ts
function nextMonth(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
function monthsBefore(from, until) {
  const out = [];
  for (let m = from; m < until && out.length < 1200; m = nextMonth(m)) out.push(m);
  return out;
}
function carryInto(monthly_cents, from, month, spent) {
  if (!/^\d{4}-\d{2}$/.test(from)) return 0;
  return monthsBefore(from, month).reduce((n, m) => {
    var _a;
    return n + monthly_cents - ((_a = spent.get(m)) != null ? _a : 0);
  }, 0);
}
function withCarry(budgets, rows, list, month) {
  const byMonth = /* @__PURE__ */ new Map();
  for (const r of expandSplits(rows)) {
    const m = r.posted.slice(0, 7);
    if (m >= month) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  }
  const spent = /* @__PURE__ */ new Map();
  for (const [m, mRows] of byMonth)
    for (const c of summarize(mRows, list).categories) {
      if (!c.spending) continue;
      if (!spent.has(c.id)) spent.set(c.id, /* @__PURE__ */ new Map());
      spent.get(c.id).set(m, c.total_cents);
    }
  return budgets.map((b) => {
    var _a;
    return __spreadProps(__spreadValues({}, b), {
      carry_cents: b.rollover ? carryInto(b.amount_cents, b.rollover_from, month, (_a = spent.get(b.category)) != null ? _a : /* @__PURE__ */ new Map()) : 0
    });
  });
}
function carryFrom(budgets, month) {
  var _a;
  return (_a = budgets.filter((b) => b.rollover && b.rollover_from && b.rollover_from < month).map((b) => b.rollover_from).sort()[0]) != null ? _a : "";
}
function overBudget(categories, budgets) {
  const spent = new Map(categories.filter((c) => c.spending).map((c) => [c.id, c]));
  return budgets.flatMap((b) => {
    const c = spent.get(b.category);
    return c && c.total_cents > b.budget_cents ? [{ id: c.id, label: c.label, spent_cents: c.total_cents, budget_cents: b.budget_cents }] : [];
  }).sort((a, b) => b.spent_cents - b.budget_cents - (a.spent_cents - a.budget_cents));
}

// shared/alerts.ts
var BILL_DAYS = 3;
var MAX_ALERT_CENTS = 1e9;
var NO_ALERTS = {
  charge_over_cents: 0,
  balance_under_cents: 0,
  bills: false,
  budgets: false,
  banks: false,
  weekly: false
};
var anyOn = (s) => s.charge_over_cents > 0 || s.balance_under_cents > 0 || s.bills || s.budgets || s.banks || s.weekly;
function amountOf(input, what) {
  if (input === null || input === void 0 || input === "" || input === 0 || input === "0") return { cents: 0 };
  const parsed = parseAmount(input);
  if (!parsed || parsed.negative) return { problem: `The ${what} must be an amount of money, like 500.` };
  const cents = parsed.cents;
  if (cents > MAX_ALERT_CENTS) return { problem: `The ${what} can be at most $10,000,000.` };
  return { cents };
}
function checkAlertSettings(input) {
  const charge = amountOf(input.charge_over, "charge amount");
  if ("problem" in charge) return charge;
  const balance = amountOf(input.balance_under, "balance amount");
  if ("problem" in balance) return balance;
  return {
    ok: {
      charge_over_cents: charge.cents,
      balance_under_cents: balance.cents,
      bills: input.bills === true,
      budgets: input.budgets === true,
      banks: input.banks === true,
      weekly: input.weekly === true
    }
  };
}
var LASTING = /* @__PURE__ */ new Set(["balance", "bank"]);
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayWords(ymd) {
  const d = /* @__PURE__ */ new Date(`${ymd}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function money(cents) {
  const size = Math.abs(Math.round(cents));
  const dollars = String(Math.floor(size / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}$${dollars}.${String(size % 100).padStart(2, "0")}`;
}
function addDays2(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
function chargeAlerts(rows, over) {
  if (over <= 0) return [];
  return rows.filter((r) => r.amount_cents < 0 && -r.amount_cents >= over).map((r) => ({
    key: `charge:${r.id}`,
    kind: "charge",
    text: `${r.name}: ${money(-r.amount_cents)} from ${r.account_name} on ${dayWords(r.posted)}.`
  }));
}
var CASH_KINDS = /* @__PURE__ */ new Set(["checking", "savings"]);
function balanceAlerts(accounts, under, today) {
  if (under <= 0) return [];
  return accounts.filter((a) => CASH_KINDS.has(a.kind) && !a.excluded && !(a.closed_on && a.closed_on <= today) && a.balance_cents !== null && a.balance_cents < under).map((a) => ({
    key: `balance:${a.id}`,
    kind: "balance",
    text: `${a.name} is down to ${money(a.balance_cents)}, under the ${money(under)} you set.`
  }));
}
function billAlerts(events, names, today) {
  const last = addDays2(today, BILL_DAYS);
  return events.filter((e) => e.amount_cents < 0 && e.date >= today && e.date <= last).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map((e) => ({
    key: `bill:${e.id}`,
    kind: "bill",
    text: `${e.name}: ${money(-e.amount_cents)} ${e.date === today ? "today" : `on ${dayWords(e.date)}`}${names.get(e.account) ? ` from ${names.get(e.account)}` : ""}.`
  }));
}
function budgetAlerts(over, month) {
  return over.map((b) => ({
    key: `budget:${b.id}:${month}`,
    kind: "budget",
    text: `${b.label}: ${money(b.spent_cents)} spent this month, over its ${money(b.budget_cents)} budget.`
  }));
}
function bankAlerts(health) {
  return health.filter((h) => h.state !== "ok").map((h) => ({
    key: `bank:${h.id}:${h.state}`,
    kind: "bank",
    text: h.state === "reconnect" ? `${h.name} needs you to sign in to it again before Cheddar can bring anything new in.` : h.state === "error" ? `${h.name} couldn't sync${h.message ? `: ${h.message}` : "."}` : `${h.name} hasn't brought anything up to date lately.`
  }));
}
function weeklyAlert(today, categories, income_cents) {
  const spending = categories.filter((c) => c.spending && c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents);
  const spent = spending.reduce((n, c) => n + c.total_cents, 0);
  const top = spending.slice(0, 3).map((c) => `${c.label} ${money(c.total_cents)}`).join(", ");
  return {
    key: `weekly:${today}`,
    kind: "weekly",
    text: `Last week: ${money(spent)} spent${top ? ` (${top})` : ""}, ${money(income_cents)} came in.`
  };
}
function due(alerts, sent) {
  const order = ["bank", "charge", "balance", "bill", "budget", "weekly"];
  const seen = /* @__PURE__ */ new Set();
  return alerts.filter((a) => !sent.has(a.key) && !seen.has(a.key) && seen.add(a.key)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
var HEADINGS = {
  bank: "Your banks",
  charge: "Charges",
  balance: "Low balances",
  bill: "Coming up",
  budget: "Budgets",
  weekly: "Your week"
};
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function alertEmail(alerts, appUrl) {
  const subject = alerts.length === 1 ? alerts[0].kind === "weekly" ? "Your week in Cheddar" : `Cheddar: ${alerts[0].text}` : `Cheddar: ${alerts.length} things to know`;
  const sections = [];
  for (const kind of Object.keys(HEADINGS)) {
    const mine = alerts.filter((a) => a.kind === kind);
    if (!mine.length) continue;
    sections.push(`<h2 style="margin:20px 0 8px;font-size:16px;color:#1b1a20">${HEADINGS[kind]}</h2>` + mine.map((a) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3d3a33">${escapeHtml(a.text)}</p>`).join(""));
  }
  const base = appUrl.replace(/\/$/, "");
  const link = base ? `<p style="margin:24px 0 0;font-size:14px;color:#6b6776"><a href="${escapeHtml(base)}/" style="color:#6d3fc0">Open Cheddar</a> · <a href="${escapeHtml(base)}/settings#alerts" style="color:#6d3fc0">Change your alerts</a></p>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f9;padding:40px 20px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px"><tr><td style="padding:32px"><h1 style="margin:0;font-size:22px;font-weight:700;color:#1b1a20">From Cheddar</h1>` + sections.join("") + link + "</td></tr></table></td></tr></table></body></html>";
  return { subject: subject.length > 120 ? `${subject.slice(0, 117)}...` : subject, html };
}
var CHARGE_DAYS = 7;
