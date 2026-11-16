/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/contact.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/contact.ts and run `pnpm gen:hooks`.
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

// shared/contact.ts
var contact_exports = {};
__export(contact_exports, {
  EMAIL_MAX: () => EMAIL_MAX,
  KEEP_DAYS: () => KEEP_DAYS,
  MESSAGE_MAX: () => MESSAGE_MAX,
  NAME_MAX: () => NAME_MAX,
  TOPICS: () => TOPICS,
  checkContact: () => checkContact,
  isTopic: () => isTopic,
  topicLabel: () => topicLabel
});
module.exports = __toCommonJS(contact_exports);
var TOPICS = [
  { id: "question", label: "A question" },
  { id: "privacy", label: "Privacy or my data" },
  { id: "security", label: "A security problem" },
  { id: "other", label: "Something else" }
];
var NAME_MAX = 100;
var EMAIL_MAX = 254;
var MESSAGE_MAX = 5e3;
var KEEP_DAYS = 365;
function isTopic(value) {
  return TOPICS.some((t) => t.id === value);
}
function topicLabel(topic) {
  var _a, _b;
  return (_b = (_a = TOPICS.find((t) => t.id === topic)) == null ? void 0 : _a.label) != null ? _b : topic;
}
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function checkContact(input) {
  const text = (v) => typeof v === "string" ? v.trim() : "";
  const name = text(input.name);
  const email = text(input.email);
  const message = text(input.message);
  if (name.length > NAME_MAX) return { problem: `Your name can be at most ${NAME_MAX} characters.` };
  if (!email || email.length > EMAIL_MAX || !EMAIL.test(email)) return { problem: "Enter the email address to reply to." };
  if (!isTopic(input.topic)) return { problem: "Choose what it's about." };
  if (!message) return { problem: "Write your message." };
  if (message.length > MESSAGE_MAX) return { problem: `A message can be at most ${MESSAGE_MAX} characters.` };
  return { ok: { name, email, topic: input.topic, message } };
}
