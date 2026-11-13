/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/splits.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/splits.ts and run `pnpm gen:hooks`.
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

// shared/splits.ts
var splits_exports = {};
__export(splits_exports, {
  MAX_PARTS: () => MAX_PARTS,
  MIN_PARTS: () => MIN_PARTS,
  checkSplit: () => checkSplit,
  checkStored: () => checkStored,
  expandSplits: () => expandSplits,
  leftOver: () => leftOver,
  moveParts: () => moveParts,
  partsOf: () => partsOf
});
module.exports = __toCommonJS(splits_exports);

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
function checkSplit(input, amount_cents, usable) {
  var _a;
  if (!Array.isArray(input)) return { problem: "Give the parts of the split." };
  if (!input.length) return { ok: [] };
  if (!amount_cents) return { problem: "A transaction of $0.00 can't be split." };
  if (input.length > MAX_PARTS) return { problem: `A split has at most ${MAX_PARTS} parts.` };
  const sign = amount_cents < 0 ? -1 : 1;
  const by = /* @__PURE__ */ new Map();
  for (const p of input) {
    const { category, amount } = p && typeof p === "object" ? p : {};
    if (typeof category !== "string" || !usable(category)) return { problem: "Choose a category for each part." };
    const a = parseAmount(amount);
    if (!a || a.negative) return { problem: "Enter each part's amount as a number, like 12.34." };
    if (!a.cents) return { problem: "Each part needs an amount. Remove the ones you don't need." };
    by.set(category, ((_a = by.get(category)) != null ? _a : 0) + a.cents);
  }
  if (by.size < MIN_PARTS) return { problem: "Split it into at least two different categories." };
  const total = [...by.values()].reduce((n, c) => n + c, 0);
  const whole = Math.abs(amount_cents);
  if (total !== whole) {
    const gap = (Math.abs(whole - total) / 100).toFixed(2);
    return { problem: total < whole ? `The parts come to $${gap} less than the whole. Add it to a part.` : `The parts come to $${gap} more than the whole.` };
  }
  return { ok: [...by].map(([category, cents]) => ({ category, amount_cents: sign * cents })) };
}
function checkStored(value, amount, usable) {
  if (value === null || value === void 0 || Array.isArray(value) && value.length === 0) return { parts: null };
  if (!Array.isArray(value)) return { problem: "A split is a list of parts." };
  if (!amount) return { problem: "A transaction of $0.00 can't be split." };
  if (value.length < MIN_PARTS || value.length > MAX_PARTS) return { problem: `A split has ${MIN_PARTS} to ${MAX_PARTS} parts.` };
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  const parts = [];
  for (const p of value) {
    if (!p || typeof p !== "object") return { problem: "A split is a list of parts." };
    const { category, amount_cents } = p;
    if (typeof category !== "string" || !category || category.length > 20 || !usable(category)) return { problem: "Choose a category for each part." };
    if (seen.has(category)) return { problem: "Each part needs a category of its own." };
    seen.add(category);
    if (!isCents(amount_cents) || amount_cents < 0 !== amount < 0) return { problem: "Each part goes the same way as the whole." };
    total += amount_cents;
    parts.push({ category, amount_cents });
  }
  if (total !== amount) return { problem: "The parts must add up to the whole." };
  return { parts };
}
function moveParts(parts, from, to) {
  const out = [];
  const at = /* @__PURE__ */ new Map();
  for (const p of parts != null ? parts : []) {
    const category = p.category === from ? to : p.category;
    const i = at.get(category);
    if (i !== void 0) out[i].amount_cents += p.amount_cents;
    else {
      at.set(category, out.length);
      out.push({ category, amount_cents: p.amount_cents });
    }
  }
  return out.length >= MIN_PARTS ? out : null;
}
