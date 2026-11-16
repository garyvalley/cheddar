/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/tags.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/tags.ts and run `pnpm gen:hooks`.
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

// shared/tags.ts
var tags_exports = {};
__export(tags_exports, {
  TAGS_MAX: () => TAGS_MAX,
  TAG_MAX: () => TAG_MAX,
  checkTags: () => checkTags,
  cleanTag: () => cleanTag,
  sameTag: () => sameTag,
  tagNeedle: () => tagNeedle,
  tagProblem: () => tagProblem,
  tagTotals: () => tagTotals,
  tagsOf: () => tagsOf
});
module.exports = __toCommonJS(tags_exports);
var TAG_MAX = 30;
var TAGS_MAX = 10;
var ALLOWED = /^[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ &'+\-./]*$/;
function cleanTag(input) {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
}
var sameTag = (a, b) => a.toLowerCase() === b.toLowerCase();
function tagProblem(tag) {
  if (!tag) return "A tag needs a word in it.";
  if (tag.length > TAG_MAX) return `A tag can be at most ${TAG_MAX} characters.`;
  if (!ALLOWED.test(tag)) return "A tag starts with a letter or digit and uses only letters, digits, spaces and & ' + - . /";
  return "";
}
function checkTags(input) {
  if (input === null || input === void 0 || input === "") return { tags: null };
  const list = typeof input === "string" ? input.split(",") : input;
  if (!Array.isArray(list)) return { problem: "Tags are a list of words." };
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") return { problem: "Tags are a list of words." };
    const tag = cleanTag(raw);
    if (!tag && typeof input === "string") continue;
    const problem = tagProblem(tag);
    if (problem) return { problem };
    if (!out.some((t) => sameTag(t, tag))) out.push(tag);
  }
  if (out.length > TAGS_MAX) return { problem: `A transaction can have at most ${TAGS_MAX} tags.` };
  return { tags: out.length ? out : null };
}
function tagsOf(stored) {
  return Array.isArray(stored) ? stored.filter((t) => typeof t === "string" && !!t) : [];
}
function tagTotals(rows) {
  const byKey = /* @__PURE__ */ new Map();
  for (const r of rows) {
    for (const tag of r.tags) {
      const key = tag.toLowerCase();
      let t = byKey.get(key);
      if (!t) byKey.set(key, t = { tag, count: 0, out_cents: 0, in_cents: 0 });
      t.count++;
      if (r.amount_cents < 0) t.out_cents -= r.amount_cents;
      else t.in_cents += r.amount_cents;
    }
  }
  return [...byKey.values()].sort((a, b) => b.out_cents - a.out_cents || a.tag.localeCompare(b.tag));
}
var tagNeedle = (tag) => JSON.stringify(cleanTag(tag));
