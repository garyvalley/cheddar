/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/links.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/links.ts and run `pnpm gen:hooks`.
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

// shared/links.ts
var links_exports = {};
__export(links_exports, {
  REFUND_DAYS: () => REFUND_DAYS,
  TRANSFER_DAYS: () => TRANSFER_DAYS,
  daysApart: () => daysApart,
  linkWords: () => linkWords,
  matchable: () => matchable,
  refundFor: () => refundFor,
  transferFor: () => transferFor
});
module.exports = __toCommonJS(links_exports);
var TRANSFER_DAYS = 4;
var REFUND_DAYS = 120;
var day = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / 864e5;
var daysApart = (a, b) => Math.abs(day(a) - day(b));
function matchable(r) {
  return !r.link && !r.link_off && !r.pending && !r.excluded && r.amount_cents !== 0;
}
function transferFor(row, candidates) {
  var _a, _b;
  if (!matchable(row) || handPicked(row)) return "";
  const fits = candidates.filter((c) => c.id !== row.id && c.owner === row.owner && c.account !== row.account && c.amount_cents === -row.amount_cents && matchable(c) && !handPicked(c) && daysApart(c.posted, row.posted) <= TRANSFER_DAYS);
  fits.sort((a, b) => daysApart(a.posted, row.posted) - daysApart(b.posted, row.posted) || (a.id < b.id ? -1 : 1));
  return (_b = (_a = fits[0]) == null ? void 0 : _a.id) != null ? _b : "";
}
var handPicked = (r) => r.category_by === "person" && r.category !== "transfer";
function refundFor(row, candidates, spending) {
  var _a, _b;
  if (!matchable(row) || row.amount_cents <= 0 || !row.merchant_key) return "";
  const fits = candidates.filter((c) => c.id !== row.id && c.owner === row.owner && c.account === row.account && c.merchant_key === row.merchant_key && c.amount_cents < 0 && -c.amount_cents >= row.amount_cents && matchable(c) && spending(c.category) && c.posted <= row.posted && daysApart(c.posted, row.posted) <= REFUND_DAYS);
  fits.sort((a, b) => Number(-b.amount_cents === row.amount_cents) - Number(-a.amount_cents === row.amount_cents) || (a.posted < b.posted ? 1 : a.posted > b.posted ? -1 : 0) || (a.id < b.id ? -1 : 1));
  return (_b = (_a = fits[0]) == null ? void 0 : _a.id) != null ? _b : "";
}
function linkWords(kind, self, other) {
  if (!kind) return "";
  if (kind === "transfer") {
    const where = other ? ` ${self.amount_cents < 0 ? "to" : "from"} ${other.account_name}` : "";
    return `Transfer${where}`;
  }
  if (self.amount_cents > 0) return other ? `Refund of a purchase on ${other.posted}` : "Refund of a purchase";
  return other ? `Refunded on ${other.posted}` : "Refunded";
}
