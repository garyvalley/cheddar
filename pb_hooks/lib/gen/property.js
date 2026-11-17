/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/property.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/property.ts and run `pnpm gen:hooks`.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __pow = Math.pow;
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

// shared/property.ts
var property_exports = {};
__export(property_exports, {
  YEARLY_CHANGE_MAX_BP: () => YEARLY_CHANGE_MAX_BP,
  changesOnItsOwn: () => changesOnItsOwn,
  checkYearlyChange: () => checkYearlyChange,
  daysBetween: () => daysBetween,
  valueAfter: () => valueAfter,
  yearlyChangeWords: () => yearlyChangeWords
});
module.exports = __toCommonJS(property_exports);
var YEARLY_CHANGE_MAX_BP = 5e3;
var changesOnItsOwn = (kind) => kind === "property";
function checkYearlyChange(input) {
  if (input === null || input === void 0 || input === "") return { ok: 0 };
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim().replace(/%$/, "").trim().replace("−", "-") : "";
  if (!/^[-+]?\d{1,2}(\.\d{1,2})?$/.test(text)) return { problem: "Give the yearly change as a percent, like 3 or -15." };
  const bp = Math.round(Number(text) * 100);
  if (Math.abs(bp) > YEARLY_CHANGE_MAX_BP) return { problem: "A value can change at most 50% a year." };
  return { ok: bp };
}
function valueAfter(cents, bp, days) {
  if (!bp || days <= 0) return cents;
  return Math.round(cents * __pow(1 + bp / 1e4, days / 365));
}
function yearlyChangeWords(bp) {
  if (!bp) return "";
  const pct = String(Math.abs(bp) / 100);
  return `${bp > 0 ? "Grows" : "Loses"} ${pct}% a year`;
}
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}
