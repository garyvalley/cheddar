/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/categories.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/categories.ts and run `pnpm gen:hooks`.
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

// shared/categories.ts
var categories_exports = {};
__export(categories_exports, {
  BUILT_IN: () => BUILT_IN,
  CATEGORIES: () => CATEGORIES,
  MAX_RANGE_DAYS: () => MAX_RANGE_DAYS,
  addDays: () => addDays,
  categoryLabel: () => categoryLabel,
  categoryOf: () => categoryOf,
  daysIn: () => daysIn,
  isCategory: () => isCategory,
  isCategoryRef: () => isCategoryRef,
  isCustomId: () => isCustomId,
  isPeriodKind: () => isPeriodKind,
  localToday: () => localToday,
  parseRange: () => parseRange,
  periodOf: () => periodOf,
  rangeLabel: () => rangeLabel,
  summarize: () => summarize,
  weekStart: () => weekStart
});
module.exports = __toCommonJS(categories_exports);
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
var isCategory = (id) => CATEGORIES.some((c) => c.id === id);
var isCustomId = (id) => typeof id === "string" && /^c-[a-z0-9]{15}$/.test(id);
var isCategoryRef = (id) => isCategory(id) || isCustomId(id);
var categoryOf = (id, list = BUILT_IN) => {
  var _a;
  return (_a = list.find((c) => c.id === id)) != null ? _a : list.find((c) => c.id === "other");
};
var categoryLabel = (id, list = BUILT_IN) => categoryOf(id, list).label;
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
var isPeriodKind = (v) => v === "week" || v === "month" || v === "year" || v === "custom";
var MAX_RANGE_DAYS = 366 * 5;
var pad = (n) => String(n).padStart(2, "0");
var DAY = 864e5;
var isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && (/* @__PURE__ */ new Date(`${v}T00:00:00Z`)).toISOString().slice(0, 10) === v;
var toTime = (d) => Date.parse(`${d}T00:00:00Z`);
var fromTime = (t) => new Date(t).toISOString().slice(0, 10);
var addDays = (d, n) => fromTime(toTime(d) + n * DAY);
var daysIn = (from, to) => Math.round((toTime(to) - toTime(from)) / DAY) + 1;
var short = (d, year) => (/* @__PURE__ */ new Date(`${d}T12:00:00Z`)).toLocaleDateString("en-US", __spreadProps(__spreadValues({
  month: "short",
  day: "numeric"
}, year ? { year: "numeric" } : {}), {
  timeZone: "UTC"
}));
function rangeLabel(from, to) {
  if (from === to) return short(from, true);
  if (from.slice(0, 4) !== to.slice(0, 4))
    return `${short(from, true)} – ${short(to, true)}`;
  if (from.slice(0, 7) === to.slice(0, 7))
    return `${short(from, false)} – ${Number(to.slice(8))}, ${to.slice(0, 4)}`;
  return `${short(from, false)} – ${short(to, true)}`;
}
var weekStart = (d) => addDays(d, -(((/* @__PURE__ */ new Date(`${d}T00:00:00Z`)).getUTCDay() + 6) % 7));
function parseRange(at) {
  const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(at != null ? at : "");
  if (!m || !isDate(m[1]) || !isDate(m[2]) || m[1] > m[2]) return null;
  if (daysIn(m[1], m[2]) > MAX_RANGE_DAYS) return null;
  return { from: m[1], to: m[2] };
}
function periodOf(kind, at, today) {
  var _a;
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
      next: addDays(from, 7)
    };
  }
  if (kind === "custom") {
    const r = (_a = parseRange(at)) != null ? _a : { from: addDays(today, -29), to: today };
    const n = daysIn(r.from, r.to);
    const span = (from) => `${from}~${addDays(from, n - 1)}`;
    return __spreadProps(__spreadValues({
      kind,
      at: `${r.from}~${r.to}`
    }, r), {
      label: rangeLabel(r.from, r.to),
      prev: span(addDays(r.from, -n)),
      next: span(addDays(r.to, 1))
    });
  }
  if (kind === "year") {
    const y2 = /^\d{4}$/.test(at != null ? at : "") ? Number(at) : Number(today.slice(0, 4));
    return {
      kind,
      at: String(y2),
      from: `${y2}-01-01`,
      to: `${y2}-12-31`,
      label: String(y2),
      prev: String(y2 - 1),
      next: String(y2 + 1)
    };
  }
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(at != null ? at : "");
  const y = m ? Number(m[1]) : Number(today.slice(0, 4));
  const mo = m ? Number(m[2]) : Number(today.slice(5, 7));
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
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
    next
  };
}
function localToday(now = /* @__PURE__ */ new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
