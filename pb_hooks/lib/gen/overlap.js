/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/overlap.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/overlap.ts and run `pnpm gen:hooks`.
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

// shared/overlap.ts
var overlap_exports = {};
__export(overlap_exports, {
  MATCH_DAYS: () => MATCH_DAYS,
  alreadySynced: () => alreadySynced,
  around: () => around,
  daysApart: () => daysApart,
  nearest: () => nearest
});
module.exports = __toCommonJS(overlap_exports);
var MATCH_DAYS = 4;
var DAY_MS = 864e5;
var dayOf = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
function daysApart(a, b) {
  return Math.round(Math.abs(dayOf(a) - dayOf(b)) / DAY_MS);
}
function around(first, last = first) {
  const at = (ymd, days) => new Date(dayOf(ymd) + days * DAY_MS).toISOString().slice(0, 10);
  return { from: at(first, -MATCH_DAYS), to: at(last, MATCH_DAYS) };
}
function nearest(row, candidates, taken = /* @__PURE__ */ new Set()) {
  let best = -1;
  let bestDays = MATCH_DAYS + 1;
  candidates.forEach((c, i) => {
    if (taken.has(i) || c.amount_cents !== row.amount_cents) return;
    const days = daysApart(row.posted, c.posted);
    if (days < bestDays || days === bestDays && best !== -1 && c.posted < candidates[best].posted) {
      best = i;
      bestDays = days;
    }
  });
  return best;
}
function alreadySynced(rows, synced) {
  const taken = /* @__PURE__ */ new Set();
  return rows.map((row) => {
    const i = nearest(row, synced, taken);
    if (i === -1) return false;
    taken.add(i);
    return true;
  });
}
