/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/legal.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/legal.ts and run `pnpm gen:hooks`.
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

// shared/legal.ts
var legal_exports = {};
__export(legal_exports, {
  PRIVACY_UPDATED: () => PRIVACY_UPDATED,
  TERMS_VERSION: () => TERMS_VERSION,
  hasAgreed: () => hasAgreed,
  legalDate: () => legalDate
});
module.exports = __toCommonJS(legal_exports);
var TERMS_VERSION = "2026-11-16";
var PRIVACY_UPDATED = "2026-11-19";
function hasAgreed(version) {
  return version === TERMS_VERSION;
}
function legalDate(version) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [y, m, d] = version.split("-").map(Number);
  return `${months[(m != null ? m : 1) - 1]} ${d}, ${y}`;
}
