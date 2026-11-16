/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/rules.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/rules.ts and run `pnpm gen:hooks`.
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

// shared/rules.ts
var rules_exports = {};
__export(rules_exports, {
  RENAME_MAX: () => RENAME_MAX,
  RULES_MAX: () => RULES_MAX,
  TEXT_MAX: () => TEXT_MAX,
  actionWords: () => actionWords,
  actionsFor: () => actionsFor,
  checkRule: () => checkRule,
  conditionWords: () => conditionWords,
  matches: () => matches,
  plain: () => plain
});
module.exports = __toCommonJS(rules_exports);

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
var isCategory = (id) => CATEGORIES.some((c) => c.id === id);
var isCustomId = (id) => typeof id === "string" && /^c-[a-z0-9]{15}$/.test(id);
var isCategoryRef = (id) => isCategory(id) || isCustomId(id);
var MAX_RANGE_DAYS = 366 * 5;

// shared/rules.ts
var TEXT_MAX = 60;
var RENAME_MAX = 100;
var RULES_MAX = 200;
var LARGEST = 1e13;
function plain(text) {
  return String(text != null ? text : "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
var oneLine = (v) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
function cents(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > LARGEST) return void 0;
  return v;
}
var str = (v) => typeof v === "string" ? v : v === void 0 || v === null ? "" : null;
function checkRule(input) {
  const b = input && typeof input === "object" ? input : {};
  const text = str(b.text);
  const rename = str(b.rename);
  const account = str(b.account);
  const category = str(b.category);
  if (text === null || rename === null || account === null || category === null)
    return { problem: "Something in that rule isn't text." };
  const t = oneLine(text);
  const r = oneLine(rename);
  if (t.length > TEXT_MAX) return { problem: `Keep the words to match to ${TEXT_MAX} characters.` };
  if (text && !plain(t)) return { problem: "The words to match need a letter or a number." };
  if (r.length > RENAME_MAX) return { problem: `Keep the new name to ${RENAME_MAX} characters.` };
  const min = cents(b.min_cents);
  const max = cents(b.max_cents);
  if (min === void 0 || max === void 0) return { problem: "Amounts must be dollars and cents." };
  if (min !== null && max !== null && min > max) return { problem: "The smallest amount is more than the largest." };
  if (account && !/^[a-z0-9]{15}$/.test(account)) return { problem: "Choose one of your accounts." };
  if (category && !isCategoryRef(category)) return { problem: "Choose one of the categories." };
  if (b.exclude !== void 0 && typeof b.exclude !== "boolean") return { problem: "Leave out is yes or no." };
  const exclude = b.exclude === true;
  if (!t && min === null && max === null && !account)
    return { problem: "Say which transactions it's for: words to match, an amount or an account." };
  if (!category && !r && !exclude)
    return { problem: "Say what it does: a category, a new name, or leaving them out." };
  return { rule: { text: t, min_cents: min, max_cents: max, account, category, rename: r, exclude } };
}
function matches(rule, t) {
  if (rule.account && rule.account !== t.account) return false;
  const size = Math.abs(t.amount_cents);
  if (rule.min_cents !== null && size < rule.min_cents) return false;
  if (rule.max_cents !== null && size > rule.max_cents) return false;
  if (rule.text) {
    const want = ` ${plain(rule.text)} `;
    if (!` ${plain(t.description)} `.includes(want) && !` ${plain(t.payee)} `.includes(want)) return false;
  }
  return true;
}
function actionsFor(rules, t) {
  const out = {};
  for (const rule of rules) {
    if (!matches(rule, t)) continue;
    if (rule.category && out.category === void 0) out.category = rule.category;
    if (rule.rename && out.rename === void 0) out.rename = rule.rename;
    if (rule.exclude && out.exclude === void 0) out.exclude = true;
  }
  return out;
}
var money = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
function conditionWords(rule, accountName = () => "one account") {
  const parts = [];
  if (rule.text) parts.push(`has “${rule.text}”`);
  if (rule.min_cents !== null && rule.max_cents !== null)
    parts.push(rule.min_cents === rule.max_cents ? `exactly ${money(rule.min_cents)}` : `${money(rule.min_cents)} to ${money(rule.max_cents)}`);
  else if (rule.min_cents !== null) parts.push(`${money(rule.min_cents)} or more`);
  else if (rule.max_cents !== null) parts.push(`up to ${money(rule.max_cents)}`);
  if (rule.account) parts.push(`in ${accountName(rule.account)}`);
  return parts.join(", ");
}
function actionWords(rule, categoryName) {
  return [
    rule.category && categoryName(rule.category),
    rule.rename && `renamed ${rule.rename}`,
    rule.exclude && "left out"
  ].filter(Boolean).join(", ");
}
