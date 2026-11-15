/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/review.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/review.ts and run `pnpm gen:hooks`.
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

// shared/review.ts
var review_exports = {};
__export(review_exports, {
  REVIEW_DAYS: () => REVIEW_DAYS,
  isHistory: () => isHistory,
  reviewFrom: () => reviewFrom
});
module.exports = __toCommonJS(review_exports);
var REVIEW_DAYS = 30;
var DAY_MS = 864e5;
function reviewFrom(linkedAt) {
  const day = String(linkedAt || "").slice(0, 10);
  const at = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(at)) return "";
  return new Date(at - REVIEW_DAYS * DAY_MS).toISOString().slice(0, 10);
}
function isHistory(posted, linkedAt) {
  const from = reviewFrom(linkedAt);
  return !!from && /^\d{4}-\d{2}-\d{2}/.test(posted) && posted.slice(0, 10) < from;
}
