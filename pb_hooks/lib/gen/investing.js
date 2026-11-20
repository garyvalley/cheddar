/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/investing.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/investing.ts and run `pnpm gen:hooks`.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// shared/investing.ts
var investing_exports = {};
__export(investing_exports, {
  ACTIVITY_LABELS: () => ACTIVITY_LABELS,
  FIRST_DAYS: () => FIRST_DAYS,
  OVERLAP_DAYS: () => OVERLAP_DAYS,
  activityFrom: () => activityFrom,
  dayRows: () => dayRows,
  incomeBetween: () => incomeBetween,
  positionChanges: () => positionChanges,
  securityKey: () => securityKey
});
module.exports = __toCommonJS(investing_exports);
var FIRST_DAYS = 730;
var OVERLAP_DAYS = 30;
var ACTIVITY_LABELS = {
  buy: "Bought",
  sell: "Sold",
  dividend: "Dividend",
  interest: "Interest",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  fee: "Fee",
  other: "Other"
};
function shift(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
function securityKey(p) {
  if (p.type === "cash") return "cash";
  return String(p.ticker || p.name || "").trim().toLowerCase().slice(0, 200);
}
function dayRows(positions) {
  var _a, _b, _c, _d, _e;
  const by = /* @__PURE__ */ new Map();
  for (const p of positions) {
    const key = securityKey(p);
    if (!key) continue;
    let d = by.get(key);
    if (!d) {
      d = { security: key, name: (_a = p.name) != null ? _a : "", ticker: (_b = p.ticker) != null ? _b : "", type: p.type || "other", quantity: 0, value_cents: 0, price_cents: (_c = p.price_cents) != null ? _c : null };
      by.set(key, d);
    }
    d.quantity += (_d = p.quantity) != null ? _d : 0;
    d.value_cents += (_e = p.value_cents) != null ? _e : 0;
  }
  return [...by.values()];
}
function activityFrom(newest, today) {
  const first = shift(today, -FIRST_DAYS);
  if (!/^\d{4}-\d{2}-\d{2}/.test(newest)) return first;
  const from = shift(newest.slice(0, 10), -OVERLAP_DAYS);
  if (from < first) return first;
  return from > today ? today : from;
}
function positionChanges(history, today, days = 30) {
  const start = shift(today, -days);
  const out = /* @__PURE__ */ new Map();
  for (const h of history) {
    if (h.date < start || h.date >= today) continue;
    const key = `${h.account}|${h.security}`;
    const had = out.get(key);
    if (!had || h.date < had.since) out.set(key, { since: h.date, from_cents: h.value_cents });
  }
  return out;
}
function incomeBetween(rows, from, to) {
  return rows.filter((r) => (r.kind === "dividend" || r.kind === "interest") && r.date >= from && r.date <= to).reduce((n, r) => n + r.amount_cents, 0);
}
